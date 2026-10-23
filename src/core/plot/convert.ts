/**
 * LaTeX → 可绘制函数表达式（nerdamer 转换 + 单变量探测）。
 * 只有恰好一个自由变量的公式才可画成二维函数图像（诚实降级原则）。
 */
import nerdamer from 'nerdamer';

export interface PlotParseResult {
  ok: boolean;
  /** function-plot 可直接使用的普通表达式。 */
  expr?: string;
  /** 自由变量名。 */
  variable?: string;
  reason?: 'parse-failed' | 'no-variable' | 'multi-variable';
}

interface NerdamerConverted {
  dataType?: string;
  RHS?: { text: () => string; variables: () => string[] };
  text: () => string;
  variables: () => string[];
}

export function latexToPlottable(tex: string): PlotParseResult {
  let converted: NerdamerConverted;
  try {
    converted = nerdamer.convertFromLaTeX(tex) as unknown as NerdamerConverted;
  } catch {
    return { ok: false, reason: 'parse-failed' };
  }
  // 等式（y=…、f(x)=…）取右侧，否则整体视为 f(x)=expr。
  const exprObj = converted.dataType === 'EQN' && converted.RHS ? converted.RHS : converted;
  const expr = exprObj.text();
  // 用 nerdamer 的符号表识别自由变量（比正则可靠，能认出函数名与常量）。
  const vars = exprObj
    .variables()
    .filter((v) => v !== 'e' && v !== 'pi');
  if (vars.length === 0) return { ok: false, reason: 'no-variable' };
  if (vars.length > 1) return { ok: false, reason: 'multi-variable' };
  return { ok: true, expr, variable: vars[0] };
}

/** 求 f(x) 在某点的值；失败返回 null。 */
export function evalAt(expr: string, variable: string, x: number): number | null {
  try {
    const n = Number(nerdamer(expr, { [variable]: String(x) } as never).evaluate().valueOf());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
