/**
 * 草稿持久化：未发送的批注列表 + 输入框草稿，按会话存取。
 */
import type { AnnotationItem } from '../../types';
import { db, type Draft } from './db';

export async function loadDraft(conversationId: string): Promise<Draft | undefined> {
  return db.drafts.get(conversationId);
}

export async function saveDraft(
  conversationId: string,
  question: string,
  annotations: AnnotationItem[],
): Promise<void> {
  if (question.trim().length === 0 && annotations.length === 0) {
    await db.drafts.delete(conversationId);
    return;
  }
  await db.drafts.put({ conversationId, question, annotations, updatedAt: Date.now() });
}

export async function clearDraft(conversationId: string): Promise<void> {
  await db.drafts.delete(conversationId);
}
