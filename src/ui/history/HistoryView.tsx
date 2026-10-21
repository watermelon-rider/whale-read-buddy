/**
 * 会话历史：按 origin 分组展示；当前 origin 置顶。
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Pencil, Plus, X } from 'lucide-react';
import type { ConversationMeta } from '../../types';
import { request } from '../shared/backend';

interface Props {
  currentOrigin: string;
  onOpen: (meta: ConversationMeta) => void;
  onNew: () => void;
  onBack: () => void;
}

export function HistoryView({ currentOrigin, onOpen, onNew, onBack }: Props) {
  const [items, setItems] = useState<ConversationMeta[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const saveTitle = async (id: string) => {
    await request({ kind: 'renameConversation', conversationId: id, title: editTitle });
    setEditingId(null);
    await reload();
  };

  const reload = async () => {
    setItems(await request<ConversationMeta[]>({ kind: 'listConversations' }));
  };

  useEffect(() => {
    void reload();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ConversationMeta[]>();
    for (const item of items) {
      const list = map.get(item.origin) ?? [];
      list.push(item);
      map.set(item.origin, list);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === currentOrigin ? -1 : b === currentOrigin ? 1 : a.localeCompare(b),
    );
  }, [items, currentOrigin]);

  return (
    <div className="dr-history">
      <header className="dr-chat-header">
        <button className="dr-icon-btn" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} />
        </button>
        <div className="dr-chat-title">会话历史</div>
        <button className="dr-icon-btn dr-new-btn" onClick={onNew}>
          <Plus size={15} strokeWidth={1.8} />
          新会话
        </button>
      </header>
      <div className="dr-history-list">
        {groups.map(([origin, conversations]) => (
          <div key={origin} className="dr-history-group">
            <div className="dr-history-origin">
              {origin === currentOrigin ? (
                <span className="dr-current-origin">
                  <MapPin size={12} strokeWidth={1.8} />
                  {origin}
                </span>
              ) : (
                origin
              )}
            </div>
            {conversations.map((c) => (
              <div key={c.id} className="dr-history-item">
                {editingId === c.id ? (
                  <div className="dr-history-open dr-history-editing">
                    <input
                      autoFocus
                      className="dr-history-rename"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void saveTitle(c.id);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => void saveTitle(c.id)}
                    />
                  </div>
                ) : (
                  <div
                    className="dr-history-open"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(c)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(c)}
                  >
                    <div className="dr-history-title">{c.title}</div>
                    <div className="dr-history-time">
                      {new Date(c.updatedAt).toLocaleString('zh-CN')}
                    </div>
                    <span className="dr-history-actions">
                      <button
                        className="dr-icon-btn"
                        title="重命名"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(c.id);
                          setEditTitle(c.title);
                        }}
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                      </button>
                      <button
                        className="dr-icon-btn"
                        title="删除会话"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await request({ kind: 'deleteConversation', conversationId: c.id });
                          await reload();
                        }}
                      >
                        <X size={14} strokeWidth={1.8} />
                      </button>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {items.length === 0 && <div className="dr-empty">还没有会话记录。</div>}
      </div>
    </div>
  );
}
