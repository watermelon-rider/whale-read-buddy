/**
 * 整窗口查看器：从 storage.session 取内容 HTML 渲染，支持缩放与平移。
 */
import { useEffect, useRef, useState, type WheelEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import '../../ui/shared/theme.css';
import '../../ui/shared/chat.css';
import 'katex/dist/katex.min.css';

function Viewer() {
  const [html, setHtml] = useState('');
  const [scale, setScale] = useState(1);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = new URLSearchParams(location.search).get('key');
    if (!key) return;
    void chrome.storage.session.get(key).then((raw) => {
      setHtml((raw[key] as string) ?? '<p>内容已过期，请重新放大。</p>');
      void chrome.storage.session.remove(key);
    });
  }, []);

  useEffect(() => {
    if (!html) return;
    const raf = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (el) setBaseSize({ w: el.offsetWidth, h: el.offsetHeight });
    });
    return () => cancelAnimationFrame(raf);
  }, [html]);

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

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // 低灵敏度：每档 5%
      applyScale(scale + (e.deltaY < 0 ? 0.05 : -0.05));
    }
  };

  return (
    <div className="dr-viewer">
      <div className="dr-zoom-toolbar dr-viewer-toolbar">
        <button className="dr-zoom-tool" title="缩小" onClick={() => applyScale(scale - 0.1)}>
          <ZoomOut size={15} strokeWidth={2} />
        </button>
        <span className="dr-zoom-scale">{Math.round(scale * 100)}%</span>
        <button className="dr-zoom-tool" title="放大" onClick={() => applyScale(scale + 0.1)}>
          <ZoomIn size={15} strokeWidth={2} />
        </button>
        <button className="dr-zoom-tool" title="重置" onClick={() => applyScale(1)}>
          <RotateCcw size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="dr-zoom-viewport" ref={viewportRef} onWheel={onWheel}>
        <div
          className="dr-zoom-spacer"
          style={baseSize ? { width: baseSize.w * scale, height: baseSize.h * scale } : undefined}
        >
          <div
            ref={contentRef}
            className="dr-viewer-content dr-md"
            style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Viewer />);
