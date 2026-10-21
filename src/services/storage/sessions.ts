/**
 * 会话持久化：事件日志的加载/追加/列表查询。
 */
import { Session } from '../../core/session/session';
import type { SessionEvent } from '../../core/session/events';
import type { ConversationMeta } from '../../types';
import { db, type StoredEvent } from './db';

export async function loadSession(conversationId: string): Promise<Session> {
  const rows = await db.events
    .where('[conversationId+seq]')
    .between([conversationId, 0], [conversationId, Infinity])
    .toArray();
  const events: SessionEvent[] = rows
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({ seq: r.seq, type: r.type, data: r.data, at: r.at }) as SessionEvent);
  return new Session(conversationId, events);
}

export async function persistEvent(conversationId: string, event: SessionEvent): Promise<void> {
  const row: StoredEvent = {
    conversationId,
    seq: event.seq,
    type: event.type,
    data: event.data,
    at: event.at,
  };
  await db.events.add(row);
}

export async function upsertConversation(meta: ConversationMeta): Promise<void> {
  await db.conversations.put(meta);
}

export async function getConversation(id: string): Promise<ConversationMeta | undefined> {
  return db.conversations.get(id);
}

export async function listConversationsByOrigin(origin: string): Promise<ConversationMeta[]> {
  return db.conversations.where('origin').equals(origin).reverse().sortBy('updatedAt');
}

export async function listAllConversations(): Promise<ConversationMeta[]> {
  return db.conversations.orderBy('updatedAt').reverse().toArray();
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.events, db.drafts, async () => {
    await db.events.where('conversationId').equals(id).delete();
    await db.drafts.delete(id);
    await db.conversations.delete(id);
  });
}
