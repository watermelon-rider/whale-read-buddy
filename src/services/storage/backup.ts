/**
 * 会话数据导出/导入（JSON 备份）。
 * 导出：全部会话 + 事件日志 + 草稿。导入：校验后合并（重复会话覆盖式写入）。
 */
import { db, type StoredEvent, type Draft } from './db';
import type { ConversationMeta } from '../../types';

export interface BackupFile {
  app: 'whale-read-buddy';
  version: 1;
  exportedAt: number;
  conversations: ConversationMeta[];
  events: StoredEvent[];
  drafts: Draft[];
}

export async function exportBackup(): Promise<BackupFile> {
  return {
    app: 'whale-read-buddy',
    version: 1,
    exportedAt: Date.now(),
    conversations: await db.conversations.toArray(),
    events: await db.events.toArray(),
    drafts: await db.drafts.toArray(),
  };
}

export async function importBackup(raw: unknown): Promise<{ conversations: number; events: number }> {
  const data = raw as BackupFile;
  if (data?.app !== 'whale-read-buddy' || !Array.isArray(data.conversations) || !Array.isArray(data.events)) {
    throw new Error('不是有效的备份文件');
  }
  await db.transaction('rw', db.conversations, db.events, db.drafts, async () => {
    for (const c of data.conversations) await db.conversations.put(c);
    for (const e of data.events) {
      const { id: _drop, ...rest } = e;
      await db.events.add(rest as StoredEvent);
    }
    for (const d of data.drafts ?? []) await db.drafts.put(d);
  });
  return { conversations: data.conversations.length, events: data.events.length };
}
