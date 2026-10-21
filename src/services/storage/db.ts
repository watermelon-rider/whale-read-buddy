/**
 * Dexie 表结构。IndexedDB 是浏览器原生存储，Dexie 只是它的封装。
 * background 是唯一写入口；side panel 通过 bridge 读写。
 */
import Dexie, { type EntityTable } from 'dexie';
import type { AnnotationItem, ConversationMeta } from '../../types';
import type { SessionEventType, SessionEventMap } from '../../core/session/events';

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

export const db = new Dexie('deepreader') as Dexie & {
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
