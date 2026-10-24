/**
 * KaTeX 渲染组件。
 *
 * 为什么不用 rehype-katex：KaTeX 布局依赖几十个内联 style（strut 高度/vlist 偏移），
 * rehype-katex 经由 hast → react-markdown 的 JSX 转换时内联样式被剥掉，
 * 导致上下标错位叠成一团。这里直接 katex.renderToString + dangerouslySetInnerHTML，
 * 完整保留内联样式（渲染管线与 KaTeX 官方一致）。
 */
import katex from 'katex';
import { useMemo } from 'react';
import { LineChart } from 'lucide-react';
import { Zoomable } from './Zoomable';
import { t } from '../../../i18n';
import { openPlotViewer } from '../../shared/open-plot';

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    strict: false,
    throwOnError: false, // 语法错误渲染为红色源文，不炸掉整条消息
  });
}

export function MathBlock({ tex }: { tex: string }) {
  const html = useMemo(() => renderTex(tex, true), [tex]);
  return (
    <Zoomable label={t('openInWindow')} copyText={tex} plotTex={tex}>
      <div className="dr-math-block" dangerouslySetInnerHTML={{ __html: html }} />
    </Zoomable>
  );
}

export function MathInline({ tex }: { tex: string }) {
  const html = useMemo(() => renderTex(tex, false), [tex]);
  return (
    // inline-block 只包裹公式本身；按钮绝对定位，不占文档流、不改变公式排版。
    <span className="dr-math-inline-wrap">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      <button
        className="dr-inline-plot-btn"
        title={t('plotFunction')}
        onClick={() => void openPlotViewer(tex)}
      >
        <LineChart size={11} strokeWidth={2} />
      </button>
    </span>
  );
}
