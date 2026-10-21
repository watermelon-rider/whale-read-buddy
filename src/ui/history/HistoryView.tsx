/**
 * 会话历史：按 origin 分组展示；当前 origin 置顶。
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Plus, X } from 'lucide-react';
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
                <button className="dr-history-open" onClick={() => onOpen(c)}>
                  <div className="dr-history-title">{c.title}</div>
                  <div className="dr-history-time">{new Date(c.updatedAt).toLocaleString('zh-CN')}</div>
                </button>
                <button
                  className="dr-icon-btn"
                  title="删除会话"
                  onClick={async () => {
                    await request({ kind: 'deleteConversation', conversationId: c.id });
                    await reload();
                  }}
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        ))}
        {items.length === 0 && <div className="dr-empty">还没有会话记录。</div>}
      </div>
    </div>
  );
}
