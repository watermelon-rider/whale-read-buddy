/**
 * 渲染内容的放大查看：悬浮出现放大按钮，点击全屏 overlay 展示。
 * overlay 内支持 +/- 按钮、Ctrl+滚轮缩放、拖拽平移；Esc / 点遮罩关闭。
 */
import { useEffect, useRef, useState, type ReactNode, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExternalLink, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

export function Zoomable({ children, label }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

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

  /** 同心缩放：以视口中心为锚点，缩放后补偿滚动位置，画面不漂移。 */
  const applyScale = (next: number) => {
    const clamped = Math.min(4, Math.max(0.25, Math.round(next * 100) / 100));
    const vp = viewportRef.current;
    if (vp) {
      const cx = vp.scrollLeft + vp.clientWidth / 2;
      const cy = vp.scrollTop + vp.clientHeight / 2;
      const f = clamped / scale;
      requestAnimationFrame(() => {
        vp.scrollLeft = cx * f - vp.clientWidth / 2;
        vp.scrollTop = cy * f - vp.clientHeight / 2;
      });
    }
    setScale(clamped);
  };
  const zoom = (delta: number) => applyScale(scale + delta);

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.1 : -0.1);
    }
  };

  /** 在整个浏览器窗口（新标签页）中查看：内容序列化为 HTML 经 storage.session 传递。 */
  const openInWindow = async () => {
    const html = renderToStaticMarkup(<div className="dr-md">{children}</div>);
    const key = `viewer:${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: html });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?key=${key}`) });
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
                onClick={() => applyScale(1)}
              >
                <RotateCcw size={14} strokeWidth={2} />
              </button>
              <button
                className="dr-zoom-tool"
                title="在整个浏览器窗口中打开"
                onClick={() => void openInWindow()}
              >
                <ExternalLink size={14} strokeWidth={2} />
              </button>
            </div>
            <button className="dr-zoom-close" title="关闭" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={2} />
            </button>
            <div
              className="dr-zoom-viewport"
              ref={viewportRef}
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
                  style={{
                    transform: `translateX(-50%) scale(${scale})`,
                    transformOrigin: 'top center',
                  }}
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
