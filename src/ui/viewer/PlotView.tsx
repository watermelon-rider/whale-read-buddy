/**
 * 查看器 plot 模式：LaTeX 公式 → 交互式函数图像（function-plot）。
 * 支持输入 x 在图上标点 (x, f(x))；多变量/非函数式公式给出诚实提示。
 */
import { useEffect, useRef, useState } from 'react';
import functionPlot from 'function-plot';
import {
  buildPlotFn,
  evalAt,
  latexToPlottable,
  type PlotParseResult,
} from '../../core/plot/convert';
import { t } from '../../i18n';

const PLOT_COLOR = '#4e75df';
const POINT_COLOR = '#d93025';

export function PlotView({ plotKey }: { plotKey: string }) {
  const [parsed, setParsed] = useState<PlotParseResult | null>(null);
  const [tex, setTex] = useState('');
  const [xInput, setXInput] = useState('');
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void chrome.storage.session.get(plotKey).then((raw) => {
      const tex = (raw[plotKey] as string) ?? '';
      setTex(tex);
      setParsed(latexToPlottable(tex));
    });
  }, [plotKey]);

  // 解析结果或标点变化时重绘。
  useEffect(() => {
    if (!parsed?.ok || !parsed.expr || !plotRef.current) return;
    const el = plotRef.current;
    el.innerHTML = '';
    const fn = buildPlotFn(parsed.expr, parsed.variable!);
    functionPlot({
      target: el,
      width: Math.max(320, el.clientWidth),
      height: Math.max(300, Math.floor(window.innerHeight * 0.6)),
      grid: true,
      data: [
        // 用预编译函数而非字符串：避免 function-plot 自带解析器对 log10/x^-1 等写法的差异。
        {
          fn: (scope: Record<string, unknown>) => fn(Number(scope.x)),
          color: PLOT_COLOR,
          // 默认 interval 采样器会把函数画成填充矩形；显式用折线采样。
          graphType: 'polyline' as const,
          sampler: 'builtIn' as const,
          nSamples: 800,
        },
        ...(points.length > 0
          ? [
              {
                points,
                fnType: 'points' as const,
                graphType: 'scatter' as const,
                color: POINT_COLOR,
                attr: { r: 6 },
              },
            ]
          : []),
      ],
    });
  }, [parsed, points]);

  if (!parsed) return null;

  if (!parsed.ok) {
    return (
      <div className="dr-plot-note">
        {t('plotNotPlottable')}
        <div className="dr-plot-tex">{tex}</div>
      </div>
    );
  }

  const markPoint = () => {
    const x = Number(xInput);
    if (!Number.isFinite(x) || !parsed.expr || !parsed.variable) return;
    const y = evalAt(parsed.expr, parsed.variable, x);
    if (y === null) return;
    setPoints((prev) => [...prev, [x, y]]);
  };

  return (
    <div className="dr-plot">
      <div className="dr-plot-input-row">
        <span className="dr-plot-var">{parsed.variable} =</span>
        <input
          className="dr-plot-input"
          value={xInput}
          placeholder={t('plotInputPlaceholder')}
          inputMode="decimal"
          onChange={(e) => setXInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) markPoint();
          }}
        />
        <button className="dr-primary-btn" onClick={markPoint}>
          {t('plotMark')}
        </button>
      </div>
      <div ref={plotRef} className="dr-plot-canvas" />
      {points.length > 0 && (
        <div className="dr-plot-points">
          {points.map(([x, y], i) => (
            <span key={i} className="dr-plot-point">
              ({x}, {y.toPrecision(4)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
