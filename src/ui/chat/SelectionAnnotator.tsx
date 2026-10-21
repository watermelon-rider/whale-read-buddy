/**
 * 对话内划词批注（与页面划词同一交互语言，参考 dsh-annotation）：
 * 选中消息文字 →「批注」按钮 → 原地编辑卡片（引用 + 输入框 + ✓）→ 确认进入 chip 列表。
 */
import { useRef, useState, type ReactNode, type MouseEvent } from 'react';

interface Props {
  children: ReactNode;
  onAnnotate: (quote: string, note: string, messageId: string) => void;
}

interface ToolbarState {
  x: number;
  y: number;
  quote: string;
  messageId: string;
}

export function SelectionAnnotator({ children, onAnnotate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [editing, setEditing] = useState<ToolbarState | null>(null);
  const [note, setNote] = useState('');

  const handleMouseUp = (_e: MouseEvent) => {
    if (editing) return;
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
    const element = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    const messageId = element?.closest('[data-message-id]')?.getAttribute('data-message-id');
    if (!messageId) {
      setToolbar(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    // 卡片宽度 300，钳制在容器内，不跑出面板右边。
    const x = Math.max(4, Math.min(rect.left - containerRect.left, containerRect.width - 312));
    setToolbar({
      x,
      y: rect.bottom - containerRect.top + 6,
      quote: quote.slice(0, 2000),
      messageId,
    });
  };

  const confirm = () => {
    if (!editing) return;
    onAnnotate(editing.quote, note.trim(), editing.messageId);
    setEditing(null);
    setToolbar(null);
    setNote('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseUp={handleMouseUp}
      onMouseDown={(e) => {
        // 点击按钮/卡片外部时收起。
        if (!(e.target as HTMLElement).closest('.dr-sel-toolbar, .dr-sel-card')) {
          setToolbar(null);
          if (editing) {
            setEditing(null);
            setNote('');
          }
        }
      }}
    >
      {children}
      {toolbar && !editing && (
        <button
          className="dr-sel-toolbar"
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditing(toolbar);
          }}
        >
          批注
        </button>
      )}
      {editing && (
        <div className="dr-sel-card" style={{ left: editing.x, top: editing.y }}>
          <div className="dr-sel-quote">
            {editing.quote.length > 100 ? `${editing.quote.slice(0, 100)}…` : editing.quote}
          </div>
          <div className="dr-sel-row">
            <input
              autoFocus
              className="dr-sel-input"
              placeholder="添加可选评论…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  confirm();
                }
                if (e.key === 'Escape') {
                  setEditing(null);
                  setNote('');
                }
              }}
            />
            <button className="dr-sel-ok" onClick={confirm} aria-label="确认批注">
              ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
