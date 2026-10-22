/**
 * 渲染内容的放大查看：悬浮出现放大按钮，点击全屏 overlay 展示。
 * Esc / 点遮罩 / 再点一次按钮关闭。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

export function Zoomable({ children, label }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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
            <button className="dr-zoom-close" title="关闭" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={2} />
            </button>
            <div className="dr-zoom-content" onClick={(e) => e.stopPropagation()}>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
