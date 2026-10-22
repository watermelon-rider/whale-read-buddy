/**
 * 上下文用量进度环：圆环显示当前会话投影占模型窗口的比例。
 * 点击弹出确认气泡，可手动触发压缩（测试压缩机制用）。
 */
import { useEffect, useRef, useState } from 'react';

export interface ContextUsage {
  tokens: number;
  window: number;
  ratio: number;
  compacted: boolean;
}

interface Props {
  usage: ContextUsage | null;
  onCompact: () => void;
}

const R = 7;
const CIRC = 2 * Math.PI * R;

export function ContextRing({ usage, onCompact }: Props) {
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setConfirming(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [confirming]);

  if (!usage) return null;
  const ratio = Math.min(1, usage.ratio);
  const pct = Math.round(usage.ratio * 100);
  const color = ratio >= 0.85 ? '#d93025' : ratio >= 0.6 ? '#e8710a' : '#4e75df';
  const tokensK = usage.tokens >= 1000 ? `${(usage.tokens / 1000).toFixed(1)}K` : String(usage.tokens);

  return (
    <div className="dr-ring-anchor" ref={rootRef}>
      <button
        className="dr-ring-btn"
        title={`上下文占用约 ${pct}%（${tokensK} tokens）`}
        onClick={() => setConfirming((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r={R} fill="none" stroke="#e5e7eb" strokeWidth="2.4" />
          <circle
            cx="9"
            cy="9"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={`${CIRC * ratio} ${CIRC}`}
            transform="rotate(-90 9 9)"
          />
        </svg>
      </button>
      {confirming && (
        <div className="dr-ring-pop">
          <div className="dr-ring-pop-text">
            上下文占用约 {pct}%（{tokensK} / {(usage.window / 1000).toFixed(0)}K tokens）
            {usage.compacted ? '，之前已压缩过' : ''}。
          </div>
          <div className="dr-ring-pop-text">要现在压缩上下文吗？较早的对话会被摘要。</div>
          <div className="dr-ring-pop-row">
            <button className="dr-icon-btn" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button
              className="dr-primary-btn"
              onClick={() => {
                setConfirming(false);
                onCompact();
              }}
            >
              压缩
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
