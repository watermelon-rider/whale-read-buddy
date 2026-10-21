/**
 * 跨 context 消息协议（side panel ↔ background ↔ content script）。
 */
import type { AnnotationItem, ConversationMeta, PageContent, Settings } from './index';
import type { AskUserQuestion } from '../core/agent/tools';
import type { StreamDelta } from '../core/llm/stream';
import type { SessionEvent } from '../core/session/events';

/** side panel → background 请求。 */
export type PanelRequest =
  | { kind: 'openConversation'; tabId: number; url: string }
  | { kind: 'newConversation'; url: string }
  | { kind: 'sendMessage'; conversationId: string; question: string; annotations: AnnotationItem[]; thinkingEnabled: boolean }
  | { kind: 'cancelTurn'; conversationId: string }
  | { kind: 'listConversations'; origin?: string }
  | { kind: 'deleteConversation'; conversationId: string }
  | { kind: 'renameConversation'; conversationId: string; title: string }
  | { kind: 'loadHistory'; conversationId: string }
  | { kind: 'saveDraft'; conversationId: string; question: string; annotations: AnnotationItem[] }
  | { kind: 'loadDraft'; conversationId: string }
  | { kind: 'restoreHighlights'; conversationId: string }
  | { kind: 'getSettings' }
  | { kind: 'saveSettings'; settings: Settings }
  | { kind: 'getSiteInstruction'; origin: string }
  | { kind: 'saveSiteInstruction'; origin: string; text: string }
  | { kind: 'listSiteInstructions' }
  | { kind: 'answerAskUser'; requestId: string; answers: Record<string, string> };

/** background → side panel 推送。 */
export type PanelEvent =
  | { kind: 'streamDelta'; conversationId: string; delta: StreamDelta }
  | { kind: 'turnState'; conversationId: string; state: 'running' | 'idle'; step?: number; toolNames?: string[]; error?: string }
  | { kind: 'sessionEvent'; conversationId: string; event: SessionEvent }
  | { kind: 'draftUpdated'; conversationId: string; annotations: AnnotationItem[] }
  | { kind: 'askUser'; conversationId: string; requestId: string; questions: AskUserQuestion[] }
  | { kind: 'pageContext'; conversationId: string; page: PageContent };

/** side panel → content script（经 background 中转）。 */
export type ContentRequest =
  | { kind: 'extractPage' }
  | { kind: 'syncHighlights'; annotations: AnnotationItem[] };

/** content script → background 上报。 */
export type ContentReport =
  | { kind: 'pageExtracted'; page: PageContent }
  | { kind: 'pageSelected'; quote: string; note: string }
  | { kind: 'pageAnnotationUpdated'; quote: string; note: string }
  | { kind: 'pageAnnotationRemoved'; quote: string }
  | { kind: 'extractionFailed'; error: string };

export interface PanelSnapshot {
  conversation: ConversationMeta;
  events: SessionEvent[];
  draft: { question: string; annotations: AnnotationItem[] };
}
