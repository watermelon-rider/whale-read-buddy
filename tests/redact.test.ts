/**
 * 思维链脱敏测试：人设 token 命中、原文复述、正常内容保留。
 */
import { describe, expect, it } from 'vitest';
import { redactReasoning } from '../src/core/prompt/redact';

describe('redactReasoning', () => {
  it('含默认人设 token 的句子被剔除（含改写形态）', () => {
    const text =
      '用户在打招呼。这是鲸鱼娘人格设定：CETACEA_LOLI MODE_TAIL_FLUKES, FOOD_RICE,  TIMEOUT_SIGNAL 1。应该用傲娇的语气回应。';
    const out = redactReasoning(text, []);
    expect(out).not.toContain('CETACEA_LOLI');
    expect(out).toContain('用户在打招呼');
    expect(out).toContain('傲娇');
  });

  it('verbatim 复述用户自定义人设的句子被剔除', () => {
    const persona = '你是我的经济学导师，解释概念时结合实例，语气温和。';
    const text = `设定是"${persona}"，所以我先举个例子。现在开始回答。`;
    const out = redactReasoning(text, [persona]);
    expect(out).not.toContain('经济学导师');
    expect(out).toContain('现在开始回答');
  });

  it('全部命中时给占位提示', () => {
    const out = redactReasoning('OBEY_MASTER_ALWAYS 这是设定。', []);
    expect(out).toBe('hmm');
  });

  it('正常思维链不受影响', () => {
    const text = '用户在问嵌入层的作用。我需要结合第 2 章的内容解释。';
    expect(redactReasoning(text, [])).toBe(text);
  });
});
