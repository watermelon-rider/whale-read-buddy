/**
 * core/ 纯逻辑单元测试：会话投影、批注协议、搜索合并、截断、工具校验。
 */
import { describe, expect, it } from 'vitest';
import { Session, composeUserText, repairDanglingToolCalls } from '../src/core/session/session';
import {
  ANNOTATION_DELIMITER,
  buildAnnotationProtocol,
  splitAnnotationProtocol,
} from '../src/core/annotation/protocol';
import { mergeSearchResults, formatSearchResult } from '../src/core/web/format';
import { mapSearchResponse } from '../src/core/web/search';
import { contentHash, truncateMarkdown } from '../src/core/extract/html';
import { validateQueries, validateUrl, validateQuestions } from '../src/core/agent/tools';
import { assembleSystemPrompt, DEFAULT_PERSONA } from '../src/core/prompt/system';
import { assembleInstructions } from '../src/core/prompt/instructions';
import type { AnnotationItem } from '../src/types';

const anno = (index: number, quote: string, note = ''): AnnotationItem => ({
  index,
  quote,
  note,
  source: { kind: 'page' },
});

describe('批注协议块', () => {
  it('组装：提问在前，其他信息：分隔，编号批注附后', () => {
    const items = [anno(1, '原文甲', '什么意思？'), anno(2, '原文乙')];
    const text = composeUserText('这段话怎么理解？', items);
    const [q, block] = text.split(`\n\n${ANNOTATION_DELIMITER}`);
    expect(q).toBe('这段话怎么理解？');
    expect(block).toContain('我批注了以下 2 处内容');
    expect(block).toContain('1. 「原文甲」');
    expect(block).toContain('批注：什么意思？');
    expect(block).toContain('2. 「原文乙」');
    expect(block).toContain('（仅标记，无批注内容）');
    expect(block).toContain('Annotation 1');
  });

  it('无批注时不拼接协议块', () => {
    expect(composeUserText('你好', [])).toBe('你好');
    expect(buildAnnotationProtocol([])).toBe('');
  });

  it('拆分：消息可还原为提问 + 协议块', () => {
    const text = composeUserText('问题', [anno(1, 'x', 'y')]);
    const { question, block } = splitAnnotationProtocol(text);
    expect(question).toBe('问题');
    expect(block).toContain(ANNOTATION_DELIMITER);
  });

  it('拆分：纯批注消息（无提问正文）', () => {
    const text = composeUserText('', [anno(1, 'x')]);
    const { question, block } = splitAnnotationProtocol(text);
    expect(question).toBe('');
    expect(block).toContain('1. 「x」');
  });
});

describe('会话投影 deriveMessages', () => {
  it('system 取最新非空节点；context/user/assistant/tool 按序投影', () => {
    const s = new Session('t');
    s.append('system/message', { content: '旧提示词' });
    s.append('system/message', { content: '新提示词' });
    s.append('context/page', {
      origin: 'https://a.com',
      url: 'https://a.com/x',
      title: '标题',
      markdown: '# 正文',
      contentHash: 'h1',
      truncated: false,
      kind: 'html',
    });
    s.append('user/message', { text: '问题一' });
    s.append('assistant/message', {
      content: '回答一',
      reasoning: '想了一下',
      toolCalls: [{ id: 'c1', name: 'web_search', argumentsJson: '{"queries":["q"]}' }],
    });
    s.append('tool/result', { toolCallId: 'c1', name: 'web_search', content: 'Sources: …' });

    const msgs = s.deriveMessages();
    expect(msgs[0]).toEqual({ role: 'system', content: '新提示词' });
    expect(msgs[1]?.role).toBe('user');
    expect(msgs[1]?.content).toContain('【当前阅读页面】');
    expect(msgs[2]).toMatchObject({ role: 'user', content: '问题一' });
    // 携带 tools 的请求必须回传 reasoning_content
    expect(msgs[3]?.reasoning_content).toBe('想了一下');
    expect(msgs[3]?.tool_calls?.[0]?.function.name).toBe('web_search');
    expect(msgs[4]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
  });

  it('compaction 遮蔽旧历史，保留摘要与新消息', () => {
    const s = new Session('t');
    s.append('user/message', { text: '老消息' });
    s.append('assistant/message', { content: '老回答' });
    const seqOfOld = s.seq - 1;
    s.append('user/message', { text: '新消息' });
    s.append('compaction/summary', { coversSeq: seqOfOld, text: '摘要：聊了某主题' });

    const msgs = s.deriveMessages();
    const contents = msgs.map((m) => m.content);
    expect(contents.some((c) => c === '老消息')).toBe(false);
    expect(contents.some((c) => typeof c === 'string' && c.includes('摘要：聊了某主题'))).toBe(true);
    expect(contents).toContain('新消息');
  });

  it('assistant/attempt 不进模型历史', () => {
    const s = new Session('t');
    s.append('user/message', { text: 'hi' });
    s.append('assistant/attempt', { error: '网络错误' });
    const msgs = s.deriveMessages();
    expect(msgs).toHaveLength(1);
  });

  it('孤儿 tool_calls 自动补合成错误结果（防 400）', () => {
    const s = new Session('t');
    s.append('user/message', { text: '查一下' });
    // 模拟回合中断：工具结果从未落盘。
    s.append('assistant/message', {
      content: '',
      toolCalls: [{ id: 'c9', name: 'web_search', argumentsJson: '{"queries":["x"]}' }],
    });
    s.append('user/message', { text: '下一句' });

    const msgs = s.deriveMessages();
    const toolMsg = msgs.find((m) => m.role === 'tool' && m.tool_call_id === 'c9');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('被中断');
    // 合成结果紧跟在 assistant 消息后、下一条用户消息前
    const aiIdx = msgs.findIndex((m) => m.role === 'assistant');
    expect(msgs[aiIdx + 1]?.role).toBe('tool');
    expect(msgs[aiIdx + 2]?.content).toBe('下一句');
  });

  it('repairDanglingToolCalls：完整配对的调用不受影响', () => {
    const fixed = repairDanglingToolCalls([
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'a', content: 'ok' },
    ]);
    expect(fixed).toHaveLength(2);
  });
});

describe('搜索', () => {
  it('多查询轮询合并 + URL 去重 + 上限截断', () => {
    const a = [
      { url: 'u1', title: 't1' },
      { url: 'u2', title: 't2' },
    ];
    const b = [{ url: 'u2' }, { url: 'u3' }];
    const merged = mergeSearchResults([a, b]);
    expect(merged.map((s) => s.url)).toEqual(['u1', 'u2', 'u3']);
  });

  it('格式化含 Sources 与引用指引', () => {
    const out = formatSearchResult(['q'], [{ url: 'u1', title: '标题', snippet: '摘要' }]);
    expect(out).toContain('Sources:');
    expect(out).toContain('[标题](u1)');
    expect(out).toContain('web_fetch');
  });

  it('响应校验：非法结构抛结构化错误', () => {
    expect(() => mapSearchResponse({ nope: true })).toThrowError(/无法识别/);
    expect(mapSearchResponse({ results: [] })).toEqual([]);
    const ok = mapSearchResponse({
      results: [{ url: 'u', title: 't', snippet: 's', date: '2026-01-01' }],
    });
    expect(ok[0]).toMatchObject({ url: 'u', publishedAt: '2026-01-01' });
  });
});

describe('截断与哈希', () => {
  it('超长正文保留开头与结尾', () => {
    const long = 'a'.repeat(1000) + 'b'.repeat(1000);
    const { text, truncated } = truncateMarkdown(long, 200);
    expect(truncated).toBe(true);
    expect(text.startsWith('a'.repeat(120))).toBe(true);
    expect(text.endsWith('b'.repeat(80))).toBe(true);
    expect(text).toContain('已省略');
  });

  it('未超预算不截断', () => {
    expect(truncateMarkdown('短', 100)).toEqual({ text: '短', truncated: false });
  });

  it('内容哈希稳定且敏感', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'));
    expect(contentHash('abc')).not.toBe(contentHash('abd'));
  });
});

describe('工具参数校验', () => {
  it('web_search：空数组/超限/空白均被拒绝并去重', () => {
    expect(() => validateQueries({ queries: [] })).toThrowError(/at least one/);
    expect(() => validateQueries({ queries: ['a', 'b', 'c', 'd', 'e'] })).toThrowError(/at most 4/);
    expect(() => validateQueries({ queries: ['  '] })).toThrowError(/non-empty/);
    expect(validateQueries({ queries: ['x', 'x', 'y'] })).toEqual(['x', 'y']);
  });

  it('web_fetch：空 url 拒绝', () => {
    expect(() => validateUrl({})).toThrowError(/non-empty/);
    expect(validateUrl({ url: ' https://a.com ' })).toBe('https://a.com');
  });

  it('ask_user：重复 id / 选项不足被拒绝', () => {
    const q = (id: string) => ({
      id,
      question: '？',
      options: [{ label: 'a' }, { label: 'b' }],
    });
    expect(validateQuestions({ questions: [q('1')] })).toHaveLength(1);
    expect(() => validateQuestions({ questions: [q('1'), q('1')] })).toThrowError(/unique/);
    expect(() =>
      validateQuestions({ questions: [{ id: '1', question: '？', options: [{ label: 'a' }] }] }),
    ).toThrowError(/at least 2/);
  });
});

describe('提示词组装', () => {
  it('persona 为空用默认；指令与工具指引按需出现', () => {
    const p = assembleSystemPrompt({
      persona: '',
      globalInstructions: '',
      toolsEnabled: true,
    });
    expect(p).toContain(DEFAULT_PERSONA.slice(0, 10));
    expect(p).toContain('web_search');
    expect(p).toContain('Annotation N');

    const q = assembleSystemPrompt({
      persona: '严厉导师',
      globalInstructions: '先给结论',
      conversationInstructions: '本站先看评论区',
      toolsEnabled: false,
    });
    expect(q).toContain('严厉导师');
    expect(q).toContain('先给结论');
    expect(q).toContain('本站先看评论区');
    expect(q).not.toContain('web_search');
  });

  it('指令预算：超预算先砍全局指令', () => {
    const global = 'g'.repeat(9000);
    const site = '本站规则';
    const out = assembleInstructions(global, site, 8192);
    expect(out).toContain('本站规则');
    expect(out).not.toContain('gggg');
  });
});
