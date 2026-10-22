/**
 * Dexie 表结构。IndexedDB 是浏览器原生存储，Dexie 只是它的封装。
 * background 是唯一写入口；side panel 通过 bridge 读写。
 */
import Dexie, { type EntityTable } from 'dexie';
import type { AnnotationItem, ConversationMeta } from '../../types';
import type { SessionEventType, SessionEventMap } from '../../core/session/events';

const LEGACY_MIGRATED_KEY = 'legacyDbMigrated';

export interface StoredEvent {
  id?: number;
  conversationId: string;
  seq: number;
  type: SessionEventType;
  data: SessionEventMap[SessionEventType];
  at: number;
}

export interface Draft {
  conversationId: string;
  /** 输入框草稿。 */
  question: string;
  /** 未发送的批注列表。 */
  annotations: AnnotationItem[];
  updatedAt: number;
}

export interface ConversationInstruction {
  conversationId: string;
  text: string;
}

export const db = new Dexie('whale-read-buddy') as Dexie & {
  conversations: EntityTable<ConversationMeta, 'id'>;
  events: EntityTable<StoredEvent, 'id'>;
  drafts: EntityTable<Draft, 'conversationId'>;
  conversationInstructions: EntityTable<ConversationInstruction, 'conversationId'>;
};

db.version(1).stores({
  conversations: 'id, origin, updatedAt',
  events: '++id, [conversationId+seq], conversationId',
  drafts: 'conversationId',
  siteInstructions: 'origin',
});

// v2：站点指令（per-origin）废弃，改为会话提示词（per-conversation）。
db.version(2).stores({
  siteInstructions: null,
  conversationInstructions: 'conversationId',
});

/**
 * 一次性迁移：扩展改名（deepreader → whale-read-buddy）前的旧 Dexie 库。
 * 仅当同一扩展存储里存在旧库时才合并；执行过一次就标记跳过。
 */
export async function migrateLegacyDb(): Promise<void> {
  const flag = await chrome.storage.local.get(LEGACY_MIGRATED_KEY);
  if (flag[LEGACY_MIGRATED_KEY]) return;
  const legacy = new Dexie('deepreader');
  try {
    await legacy.open();
    const convs = await legacy.table('conversations').toArray();
    const events = await legacy.table('events').toArray();
    const drafts = await legacy.table('drafts').toArray();
    if (convs.length > 0 || events.length > 0 || drafts.length > 0) {
      await db.transaction('rw', db.conversations, db.events, db.drafts, async () => {
        for (const c of convs) await db.conversations.put(c as ConversationMeta);
        for (const e of events) {
          const { id: _drop, ...rest } = e as StoredEvent;
          await db.events.add(rest as StoredEvent);
        }
        for (const d of drafts) await db.drafts.put(d as Draft);
      });
    }
  } catch {
    // 没有旧库或结构不符：无事发生。
  } finally {
    legacy.close();
    await chrome.storage.local.set({ [LEGACY_MIGRATED_KEY]: true });
  }
}
