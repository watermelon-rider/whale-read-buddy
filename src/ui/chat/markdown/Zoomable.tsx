/**
 * 渲染内容的放大查看：悬浮出现放大按钮，点击全屏 overlay 展示。
 * overlay 内支持 +/- 按钮、Ctrl+滚轮缩放、拖拽平移；Esc / 点遮罩关闭。
 */
import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

export function Zoomable({ children, label }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    // 打开后量一次原始尺寸（缩放用 transform，不改布局，用 spacer 撑滚动区）。
    const raf = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (el) setBaseSize({ w: el.offsetWidth, h: el.offsetHeight });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const zoom = (delta: number) =>
    setScale((s) => Math.min(4, Math.max(0.25, Math.round((s + delta) * 100) / 100)));

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.1 : -0.1);
    }
  };

  return (
    <div className="dr-zoomable">
      <button
        className="dr-zoom-btn"
        title={label ?? '放大查看'}
        onClick={() => setOpen(true)}
      >
        <Maximize2 size={13} strokeWidth={2} />
      </button>
      {children}
      {open &&
        createPortal(
          <div className="dr-zoom-overlay" onClick={() => setOpen(false)}>
            <div className="dr-zoom-toolbar" onClick={(e) => e.stopPropagation()}>
              <button className="dr-zoom-tool" title="缩小" onClick={() => zoom(-0.1)}>
                <ZoomOut size={15} strokeWidth={2} />
              </button>
              <span className="dr-zoom-scale">{Math.round(scale * 100)}%</span>
              <button className="dr-zoom-tool" title="放大" onClick={() => zoom(0.1)}>
                <ZoomIn size={15} strokeWidth={2} />
              </button>
              <button
                className="dr-zoom-tool"
                title="重置"
                onClick={() => setScale(1)}
              >
                <RotateCcw size={14} strokeWidth={2} />
              </button>
            </div>
            <button className="dr-zoom-close" title="关闭" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={2} />
            </button>
            <div
              className="dr-zoom-viewport"
              onClick={(e) => e.stopPropagation()}
              onWheel={onWheel}
            >
              <div
                className="dr-zoom-spacer"
                style={
                  baseSize
                    ? { width: baseSize.w * scale, height: baseSize.h * scale }
                    : undefined
                }
              >
                <div
                  ref={contentRef}
                  className="dr-zoom-inner"
                  style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
                >
                  {children}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
