/**
 * 事件溯源 Session：append-only 日志 + deriveMessages() 投影（借鉴 dsh-session）。
 * 纯逻辑模块，不依赖 chrome.*，可单测。
 */
import type { AnnotationItem } from '../../types';
import { buildAnnotationProtocol } from '../annotation/protocol';
import type { SessionEvent, SessionEventMap, SessionEventType, ToolCall } from './events';

/** OpenAI 兼容的消息格式（DeepSeek chat/completions 请求体）。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  reasoning_content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function formatPageContext(e: Extract<SessionEvent, { type: 'context/page' }>): string {
  const p = e.data;
  const truncatedNote = p.truncated ? '（正文过长，已截断，保留了开头与结尾）' : '';
  return [
    `【当前阅读页面${p.kind === 'pdf' ? '（PDF）' : ''}】`,
    `标题：${p.title}`,
    `URL：${p.url}`,
    `正文${truncatedNote}：`,
    '',
    p.markdown,
  ].join('\n');
}

function formatTimeContext(e: Extract<SessionEvent, { type: 'context/time' }>): string {
  const t = e.data;
  const elapsed =
    t.elapsedSeconds === 'unavailable' ? '未知' : `${t.elapsedSeconds} 秒前`;
  return `【时间上下文】当前时间：${t.iso}（时区 ${t.timeZone}）；上一条消息距今：${elapsed}。`;
}

/**
 * append-only 会话日志。seq 从 0 递增；事件一经提交不可变。
 */
export class Session {
  readonly id: string;
  private events: SessionEvent[] = [];
  private listeners = new Set<(e: SessionEvent) => void>();

  constructor(id: string, initial?: SessionEvent[]) {
    this.id = id;
    if (initial) this.events = [...initial];
  }

  get seq(): number {
    return this.events.length;
  }

  eventAt(seq: number): SessionEvent | undefined {
    return this.events[seq];
  }

  snapshot(): SessionEvent[] {
    return [...this.events];
  }

  onAppend(listener: (e: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  append<T extends SessionEventType>(type: T, data: SessionEventMap[T]): SessionEvent<T> {
    const event = { seq: this.events.length, type, data, at: Date.now() } as SessionEvent<T>;
    // 深冻结快照：事件不可变是投影缓存与回放正确性的前提。
    this.events.push(event as SessionEvent);
    for (const l of this.listeners) l(event as SessionEvent);
    return event;
  }

  /** 最近一条已注入的页面节点（供 URL 变化去重）。 */
  latestPageContext(): Extract<SessionEvent, { type: 'context/page' }> | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e?.type === 'context/page') {
        return e as Extract<SessionEvent, { type: 'context/page' }>;
      }
    }
    return undefined;
  }

  /**
   * 把日志投影为模型历史。
   * compaction/summary 遮蔽其 coversSeq 及之前的模型可见事件（system 除外）。
   */
  deriveMessages(): ChatMessage[] {
    let maskedUpTo = -1;
    let summary: string | undefined;
    for (const e of this.events) {
      if (e.type === 'compaction/summary') {
        maskedUpTo = Math.max(maskedUpTo, e.data.coversSeq);
        summary = e.data.text;
      }
    }

    const messages: ChatMessage[] = [];
    let system: string | undefined;
    for (const e of this.events) {
      if (e.type === 'system/message' && e.data.content.trim().length > 0) {
        system = e.data.content;
      }
    }
    if (system) messages.push({ role: 'system', content: system });
    if (summary) {
      messages.push({ role: 'user', content: `【早前对话摘要】\n${summary}` });
    }

    for (const e of this.events) {
      if (e.seq <= maskedUpTo) continue;
      switch (e.type) {
        case 'context/page':
          messages.push({ role: 'user', content: formatPageContext(e) });
          break;
        case 'context/time':
          messages.push({ role: 'user', content: formatTimeContext(e) });
          break;
        case 'user/message':
          messages.push({ role: 'user', content: e.data.text });
          break;
        case 'assistant/message': {
          const msg: ChatMessage = {
            role: 'assistant',
            content: e.data.content.length > 0 ? e.data.content : null,
          };
          // 携带 tools 的请求必须回传 reasoning_content，否则 DeepSeek 400。
          if (e.data.reasoning) msg.reasoning_content = e.data.reasoning;
          if (e.data.toolCalls && e.data.toolCalls.length > 0) {
            msg.tool_calls = e.data.toolCalls.map((tc: ToolCall) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.argumentsJson },
            }));
          }
          messages.push(msg);
          break;
        }
        case 'tool/result':
          messages.push({
            role: 'tool',
            tool_call_id: e.data.toolCallId,
            content: e.data.content,
          });
          break;
        default:
          break;
      }
    }
    return repairDanglingToolCalls(messages);
  }
}

/**
 * 修复孤儿 tool_calls：assistant 消息带了 tool_calls 但后续没有对应 tool 结果时
 * （回合被中断 / SW 重启 / compaction 截断），补一条合成错误结果。
 * 否则 DeepSeek 会以 400 拒绝整个请求。
 */
export function repairDanglingToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const answeredIds = new Set(
    messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id),
  );
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    out.push(msg);
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (!answeredIds.has(tc.id)) {
          out.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'Error: 该工具调用被中断，没有返回结果。请忽略它继续回答用户。',
          });
        }
      }
    }
  }
  return out;
}

/** 组装用户消息文本：提问在前，批注协议块附后（「其他信息：」分隔）。 */
export function composeUserText(question: string, annotations: AnnotationItem[]): string {
  const trimmed = question.trim();
  if (annotations.length === 0) return trimmed;
  const block = buildAnnotationProtocol(annotations);
  return trimmed.length > 0 ? `${trimmed}\n\n${block}` : block;
}
