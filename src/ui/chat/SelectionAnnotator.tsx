/**
 * 对话内划词批注：在消息列表容器内选中文字 → 浮动「批注」按钮。
 * 与页面划词汇入同一个 chip 列表（source.kind = 'chat'）。
 */
import { useRef, useState, type ReactNode, type MouseEvent } from 'react';

interface Props {
  children: ReactNode;
  onAnnotate: (quote: string, messageId: string) => void;
}

export function SelectionAnnotator({ children, onAnnotate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number; quote: string; messageId: string } | null>(null);

  const handleMouseUp = (_e: MouseEvent) => {
    const selection = window.getSelection();
    const quote = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || quote.length === 0 || !containerRef.current) {
      setToolbar(null);
      return;
    }
    const anchor = selection.anchorNode;
    if (!anchor || !containerRef.current.contains(anchor)) {
      setToolbar(null);
      return;
    }
    // 定位消息 id（最近的 data-message-id 祖先）。
    const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    const messageEl = element?.closest('[data-message-id]');
    const messageId = messageEl?.getAttribute('data-message-id');
    if (!messageId) {
      setToolbar(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setToolbar({
      x: rect.left - containerRect.left,
      y: rect.bottom - containerRect.top + 4,
      quote: quote.slice(0, 2000),
      messageId,
    });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onMouseUp={handleMouseUp}>
      {children}
      {toolbar && (
        <button
          className="dr-primary-btn"
          style={{ position: 'absolute', left: toolbar.x, top: toolbar.y, zIndex: 10 }}
          onMouseDown={(e) => {
            e.preventDefault();
            onAnnotate(toolbar.quote, toolbar.messageId);
            setToolbar(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          批注
        </button>
      )}
    </div>
  );
}
