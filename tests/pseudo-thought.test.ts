/**
 * 伪思维链（脑回路）提取测试。
 */
import { describe, expect, it } from 'vitest';
import { extractPseudoThought } from '../src/core/prompt/pseudo-thought';

describe('extractPseudoThought', () => {
  it('提取首行脑回路并从正文移除', () => {
    const raw = '脑回路：先翻一翻这页的味道~\n\n正式回答。';
    const { thought, content } = extractPseudoThought(raw);
    expect(thought).toBe('先翻一翻这页的味道~');
    expect(content).toBe('正式回答。');
  });

  it('支持中文冒号', () => {
    const { thought } = extractPseudoThought('脑回路:干饭先。\n正文');
    expect(thought).toBe('干饭先。');
  });

  it('流式中途（无换行）：整行作为进行中的脑回路，正文为空', () => {
    const { thought, content } = extractPseudoThought('脑回路：正在想');
    expect(thought).toBe('正在想');
    expect(content).toBe('');
  });

  it('没有脑回路行时原样返回', () => {
    const raw = '普通回答，没有脑回路行。';
    expect(extractPseudoThought(raw)).toEqual({ content: raw });
  });

  it('脑回路出现在 300 字符之后不提取（防正文误伤）', () => {
    const raw = `${'长'.repeat(310)}\n脑回路：太晚出现的不算`;
    expect(extractPseudoThought(raw).thought).toBeUndefined();
  });

  it('容忍书名号/加粗修饰的变体', () => {
    expect(extractPseudoThought('「脑回路：先吃饭」\n\n正文').thought).toBe('先吃饭');
    expect(extractPseudoThought('**脑回路：** 翻书中\n\n正文').thought).toBe('翻书中');
  });

  it('脑回路前有正文时也能提取（不吞前文换行）', () => {
    const raw = '开头一句。\n脑回路：边想边干饭\n\n正文部分';
    const { thought, content } = extractPseudoThought(raw);
    expect(thought).toBe('边想边干饭');
    expect(content).toContain('开头一句。');
    expect(content).toContain('正文部分');
  });
});
