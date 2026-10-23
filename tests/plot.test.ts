/**
 * LaTeX → 可绘制函数 的转换与求值测试。
 */
import { describe, expect, it } from 'vitest';
import { evalAt, latexToPlottable } from '../src/core/plot/convert';

describe('latexToPlottable', () => {
  it('单变量等式（y=…）可取右边并出图表达式', () => {
    const r = latexToPlottable('y=\\sin\\left(\\frac{x}{100}\\right)');
    expect(r.ok).toBe(true);
    expect(r.variable).toBe('x');
    expect(r.expr).toContain('sin');
    expect(r.expr).toContain('x');
  });

  it('裸表达式（无 y=）视为 f(x)=expr', () => {
    const r = latexToPlottable('\\frac{x^2}{2}');
    expect(r.ok).toBe(true);
    expect(r.variable).toBe('x');
  });

  it('多变量公式不可画', () => {
    const r = latexToPlottable('y = x + z');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('multi-variable');
  });

  it('nerdamer 把无运算符的连乘（XW_Q）视为单个符号名——记录此边界行为', () => {
    const r = latexToPlottable('Q = XW_Q');
    expect(r.ok).toBe(true);
    expect(r.variable).toBe('XW_Q');
  });

  it('无变量公式不可画', () => {
    const r = latexToPlottable('1+1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-variable');
  });

  it('softmax 这类多变量公式诚实拒绝', () => {
    const r = latexToPlottable('\\mathrm{softmax}(s)_i=\\frac{e^{s_i}}{\\sum_j e^{s_j}}');
    expect(r.ok).toBe(false);
  });
});

describe('evalAt', () => {
  it('求值 x^2/2 在 x=3 处为 4.5', () => {
    const r = latexToPlottable('\\frac{x^2}{2}');
    expect(evalAt(r.expr!, r.variable!, 3)).toBeCloseTo(4.5);
  });

  it('非法输入返回 null', () => {
    expect(evalAt('x^2', 'x', NaN)).toBeNull();
  });
});
