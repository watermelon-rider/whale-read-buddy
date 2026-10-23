/**
 * 批注详情浮窗：点开显示引用与批注。
 * 自适应宽度、窗口内钳制（不超出屏幕）、失焦/点击外部/Esc 自动关闭。
 * 传入 onSaveNote/onDelete 时（草稿批注）支持原地编辑与删除。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { t } from '../../i18n';

interface Props {
  /** 触发元素的屏幕位置。 */
  rect: DOMRect;
  quote: string;
  note: string;
  onClose: () => void;
  onSaveNote?: (note: string) => void;
  onDelete?: () => void;
}

const WIDTH = 280;

export function AnnoPopover({ rect, quote, note, onClose, onSaveNote, onDelete }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  // 渲染后按真实高度决定放上面还是下面，并做水平钳制。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = Math.min(WIDTH, window.innerWidth - 16);
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = rect.bottom + 6 + h <= window.innerHeight - 8;
    const top = below ? rect.bottom + 6 : Math.max(8, rect.top - h - 6);
    setPos({ left, top });
  }, [rect]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="dr-anno-detail"
      style={{
        left: pos.left,
        top: pos.top,
        width: Math.min(WIDTH, window.innerWidth - 16),
        visibility: pos.top === 0 && pos.left === 0 ? 'hidden' : 'visible',
      }}
    >
      <div className="dr-anno-detail-quote">「{quote}」</div>
      {editing ? (
        <textarea
          autoFocus
          className="dr-anno-edit dr-anno-edit-area"
          value={draft}
          placeholder={t('writeNote')}
          rows={1}
          ref={(el) => {
            if (el) {
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 66)}px`;
            }
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 66)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              onSaveNote?.(draft.trim());
              setEditing(false);
              onClose();
            }
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        note.trim().length > 0 && (
          <div className="dr-anno-detail-note">{t('notePrefix', { note })}</div>
        )
      )}
      {(onSaveNote || onDelete) && !editing && (
        <div className="dr-anno-detail-actions">
          {onSaveNote && (
            <button
              className="dr-icon-btn"
              title={t('editNote')}
              onClick={() => {
                setDraft(note);
                setEditing(true);
              }}
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          )}
          {onDelete && (
            <button
              className="dr-icon-btn dr-anno-del"
              title={t('delete')}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
