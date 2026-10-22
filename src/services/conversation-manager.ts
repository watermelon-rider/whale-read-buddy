/**
 * 会话管理器（background 侧核心编排）：
 * 会话的创建/恢复、Agent 循环托管、页面内容注入、ask_user 桥接。
 */
import { AgentLoop } from '../core/agent/loop';
import { streamChat } from '../core/llm/deepseek';
import { composeUserText, Session } from '../core/session/session';
import {
  contextWindowOf,
  DEFAULT_POLICY,
  estimateTokens,
  maybeCompact,
} from '../core/session/compaction';
import type { SessionEvent } from '../core/session/events';
import { assembleSystemPrompt } from '../core/prompt/system';
import { formatSearchResult, mergeSearchResults } from '../core/web/format';
import { webSearch } from '../core/web/search';
import { webFetch } from '../core/web/fetch';
import type { ToolExecutor, AskUserQuestion } from '../core/agent/tools';
import {
  normalizeUrl,
  originOf,
  type AnnotationItem,
  type ConversationMeta,
  type PageContent,
  type Settings,
} from '../types';
import {
  getConversation,
  listConversationsByOrigin,
  loadSession,
  persistEvent,
  upsertConversation,
} from './storage/sessions';
import { clearDraft, loadDraft, saveDraft } from './storage/drafts';
import { loadConversationInstruction, loadSettings } from './storage/settings';
import { extractPageForTab } from './extract-service';
import type { PanelEvent } from '../types/protocol';

const LAST_CONVERSATION_KEY = 'lastActiveConversationId';

interface LiveConversation {
  meta: ConversationMeta;
  session: Session;
  loop?: AgentLoop;
  thinkingEnabled: boolean;
}

interface PendingAsk {
  conversationId: string;
  resolve: (answers: Record<string, string>) => void;
  reject: (err: Error) => void;
}

export class ConversationManager {
  private live = new Map<string, LiveConversation>();
  private pendingAsks = new Map<string, PendingAsk>();
  /** 最近打开的会话（页面批注草稿的归属）。 */
  currentConversationId?: string;

  constructor(private readonly emit: (event: PanelEvent) => void) {}

  /** 打开（或创建）当前 tab 所属 origin 的最近会话。 */
  async openConversation(tabId: number, url: string): Promise<ConversationMeta> {
    const origin = originOf(url);
    const existing = await listConversationsByOrigin(origin);
    if (existing.length > 0 && existing[0]) {
      await this.ensureLive(existing[0].id);
      this.currentConversationId = existing[0].id;
      await this.markActive(existing[0].id);
      return existing[0];
    }
    return this.createConversation(url);
  }

  async createConversation(url: string): Promise<ConversationMeta> {
    const meta: ConversationMeta = {
      id: crypto.randomUUID(),
      origin: originOf(url),
      title: '新会话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await upsertConversation(meta);
    await this.ensureLive(meta.id);
    this.currentConversationId = meta.id;
    await this.markActive(meta.id);
    return meta;
  }

  /** 最近活跃的会话（供面板重开时恢复）；不存在或已被删除时返回 undefined。 */
  async getLastActiveConversation(): Promise<ConversationMeta | undefined> {
    const raw = await chrome.storage.local.get(LAST_CONVERSATION_KEY);
    const id = raw[LAST_CONVERSATION_KEY] as string | undefined;
    if (!id) return undefined;
    const meta = await getConversation(id);
    if (!meta) return undefined;
    await this.ensureLive(id);
    this.currentConversationId = id;
    return meta;
  }

  private async markActive(conversationId: string): Promise<void> {
    await chrome.storage.local.set({ [LAST_CONVERSATION_KEY]: conversationId });
  }

  /**
   * MV3 service worker 空闲会被回收，重启后内存里的 currentConversationId 丢失。
   * 丢失时按当前活跃标签页找回（或创建）会话，保证页面批注不被静默丢弃。
   */
  async resolveCurrentConversationId(): Promise<string | undefined> {
    if (this.currentConversationId) return this.currentConversationId;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return undefined;
    const meta = await this.openConversation(tab.id, tab.url);
    return meta.id;
  }

  /** 页面划词批注进入当前会话草稿（canonical index 在此分配）。 */
  async addPageAnnotation(
    quote: string,
    note: string,
    anchor?: { prefix: string; suffix: string },
  ): Promise<AnnotationItem[]> {
    const conversationId = await this.resolveCurrentConversationId();
    if (!conversationId) return [];
    const draft = await loadDraft(conversationId);
    const annotations = draft?.annotations ?? [];
    const next: AnnotationItem[] = [
      ...annotations,
      {
        index: annotations.length + 1,
        quote,
        note,
        source: { kind: 'page' },
        ...(anchor ? { anchor } : {}),
      },
    ];
    await saveDraft(conversationId, draft?.question ?? '', next);
    this.emit({ kind: 'draftUpdated', conversationId, annotations: next });
    return next;
  }

  async updatePageAnnotation(quote: string, note: string): Promise<void> {
    const conversationId = await this.resolveCurrentConversationId();
    if (!conversationId) return;
    const draft = await loadDraft(conversationId);
    if (!draft) return;
    const next = draft.annotations.map((a) =>
      a.source.kind === 'page' && a.quote === quote ? { ...a, note } : a,
    );
    await saveDraft(conversationId, draft.question, next);
    this.emit({ kind: 'draftUpdated', conversationId, annotations: next });
  }

  async removePageAnnotation(quote: string): Promise<void> {
    const conversationId = await this.resolveCurrentConversationId();
    if (!conversationId) return;
    const draft = await loadDraft(conversationId);
    if (!draft) return;
    const next = draft.annotations
      .filter((a) => !(a.source.kind === 'page' && a.quote === quote))
      .map((a, i) => ({ ...a, index: i + 1 }));
    await saveDraft(conversationId, draft.question, next);
    this.emit({ kind: 'draftUpdated', conversationId, annotations: next });
  }

  async ensureLive(conversationId: string): Promise<LiveConversation> {
    const cached = this.live.get(conversationId);
    if (cached) return cached;
    const meta = await getConversation(conversationId);
    if (!meta) throw new Error(`会话不存在：${conversationId}`);
    const session = await loadSession(conversationId);
    // 持久化挂载：每个新事件同时落 IndexedDB。
    session.onAppend((e) => void persistEvent(conversationId, e));
    // 实时推送：side panel 关闭时 postMessage 静默失败，重开后由快照重建。
    session.onAppend((e) => this.emit({ kind: 'sessionEvent', conversationId, event: e }));
    // 任何路径接触到会话都记为最近活跃（面板重开时恢复用）。
    void this.markActive(conversationId);
    const live: LiveConversation = {
      meta,
      session,
      thinkingEnabled: (await loadSettings()).thinkingEnabled,
    };
    this.live.set(conversationId, live);
    return live;
  }

  /** 发送用户消息：注入页面内容（如需）→ 提交 user/message → 跑 turn。 */
  async sendMessage(
    conversationId: string,
    tabId: number,
    pageUrl: string,
    question: string,
    annotations: AnnotationItem[],
    thinkingEnabled: boolean,
  ): Promise<void> {
    const live = await this.ensureLive(conversationId);
    live.thinkingEnabled = thinkingEnabled;

    const text = composeUserText(question, annotations);
    const settings = await loadSettings();
    // 用户消息先入日志，页面注入随后——UI 时间线按真实动作顺序呈现。
    live.session.append('user/message', {
      text,
      ...(annotations.length > 0 ? { annotations } : {}),
    });

    await this.injectPageIfNeeded(live, tabId, pageUrl);

    await this.touchMeta(live);
    await clearDraft(conversationId);

    const loop = this.buildLoop(live, settings);
    live.loop = loop;
    this.emit({ kind: 'turnState', conversationId, state: 'running', step: 0 });
    const { error } = await loop.runTurn({ question, thinkingEnabled });
    this.emit({ kind: 'turnState', conversationId, state: 'idle', ...(error ? { error } : {}) });
    await this.touchMeta(live);

    // 首轮对话后由 LLM 命名（用户手动改过标题的除外）。
    const userTurns = live.session
      .snapshot()
      .filter((e) => e.type === 'user/message').length;
    if (userTurns === 1 && !live.meta.titleLocked) {
      void this.generateTitle(live, question, settings);
    }
  }

  /** 用第一条用户消息生成简短会话标题（非思考模式，失败静默保留原标题）。 */
  private async generateTitle(
    live: LiveConversation,
    question: string,
    settings: Settings,
  ): Promise<void> {
    try {
      const result = await streamChat(
        settings,
        {
          messages: [
            {
              role: 'user',
              content: `请为这段对话起一个简短标题（不超过 12 个字，只输出标题本身，不要引号）：\n\n${question.slice(0, 500)}`,
            },
          ],
          model: settings.model,
          thinkingEnabled: false,
          reasoningEffort: 'low',
        },
        () => {},
      );
      const title = result.content.trim().replace(/^["'「『]+|["'」』]+$/g, '').slice(0, 20);
      if (title.length === 0) return;
      live.meta.title = title;
      await upsertConversation(live.meta);
      this.emit({ kind: 'conversationRenamed', conversationId: live.meta.id, title });
    } catch {
      // 命名失败不影响对话，保留原标题。
    }
  }

  cancelTurn(conversationId: string): void {
    this.live.get(conversationId)?.loop?.cancel();
  }

  /** 上下文用量（进度环）：当前投影 token 估值 / 窗口大小 / 是否已压缩过。 */
  async getContextUsage(conversationId: string): Promise<{
    tokens: number;
    window: number;
    ratio: number;
    compacted: boolean;
  }> {
    const live = await this.ensureLive(conversationId);
    const settings = await loadSettings();
    const tokens = estimateTokens(live.session.deriveMessages());
    const window = contextWindowOf(settings.model);
    const compacted = live.session.snapshot().some((e) => e.type === 'compaction/summary');
    return { tokens, window, ratio: tokens / window, compacted };
  }

  /** 手动触发压缩（不管阈值，测试压缩机制用）。 */
  async compactConversation(conversationId: string): Promise<boolean> {
    const live = await this.ensureLive(conversationId);
    const settings = await loadSettings();
    return maybeCompact(live.session, settings, undefined, DEFAULT_POLICY, true);
  }

  /** ask_user 的回答回流。 */
  answerAskUser(requestId: string, answers: Record<string, string>): void {
    const pending = this.pendingAsks.get(requestId);
    if (!pending) return;
    this.pendingAsks.delete(requestId);
    pending.resolve(answers);
  }

  private buildLoop(live: LiveConversation, settings: Settings): AgentLoop {
    const conversationId = live.meta.id;
    const executor = this.buildExecutor(settings, conversationId);
    return new AgentLoop({
      session: live.session,
      settings,
      executor,
      onDelta: (delta) => this.emit({ kind: 'streamDelta', conversationId, delta }),
      onStep: (info) =>
        this.emit({
          kind: 'turnState',
          conversationId,
          state: 'running',
          step: info.step,
          ...(info.toolNames ? { toolNames: info.toolNames } : {}),
        }),
      buildSystemPrompt: () =>
        // 会话提示词读取是异步的，这里读同步缓存：sendMessage 前已由 refreshSystemPrompt 填充。
        this.systemPromptCache.get(conversationId) ??
        assembleSystemPrompt({ persona: '', globalInstructions: '', toolsEnabled: true }),
    });
  }

  private systemPromptCache = new Map<string, string>();

  /** 在 sendMessage 前刷新系统提示词缓存（persona / 系统提示词 / 会话提示词按当前设置组装）。 */
  async refreshSystemPrompt(conversationId: string): Promise<void> {
    const settings = await loadSettings();
    const conversationInstructions = await loadConversationInstruction(conversationId);
    this.systemPromptCache.set(
      conversationId,
      assembleSystemPrompt({
        persona: settings.persona,
        globalInstructions: settings.globalInstructions,
        ...(conversationInstructions ? { conversationInstructions } : {}),
        toolsEnabled: true,
      }),
    );
  }

  private buildExecutor(settings: Settings, conversationId: string): ToolExecutor {
    return {
      webSearch: async (queries, ctx) => {
        // 多查询并发；任一失败则整批失败（错误模型可读）。
        const results = await Promise.all(
          queries.map((q) => webSearch(settings, q, 8, ctx.originalQuestion, ctx.signal)),
        );
        return formatSearchResult(queries, mergeSearchResults(results));
      },
      webFetch: (url, ctx) => webFetch(settings, url, ctx.signal),
      askUser: (questions, ctx) => this.askUser(conversationId, questions, ctx.signal),
    };
  }

  private askUser(
    conversationId: string,
    questions: AskUserQuestion[],
    signal?: AbortSignal,
  ): Promise<string> {
    const requestId = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      this.pendingAsks.set(requestId, {
        conversationId,
        resolve: (answers) => {
          const lines = questions.map((q) => {
            const answer = answers[q.id] ?? '（用户未回答）';
            return `- ${q.question}\n  回答：${answer}`;
          });
          resolve(`用户的回答：\n${lines.join('\n')}`);
        },
        reject,
      });
      this.emit({ kind: 'askUser', conversationId, requestId, questions });
      signal?.addEventListener('abort', () => {
        const pending = this.pendingAsks.get(requestId);
        if (pending) {
          this.pendingAsks.delete(requestId);
          pending.reject(new DOMException('Aborted', 'AbortError'));
        }
      });
    });
  }

  /** 页面注入去重：无页面节点，或 URL/内容变化时重新提取注入。 */
  private async injectPageIfNeeded(
    live: LiveConversation,
    tabId: number,
    pageUrl: string,
  ): Promise<void> {
    const latest = live.session.latestPageContext();
    const normalized = normalizeUrl(pageUrl);
    if (latest && latest.data.url === normalized) return;

    const page = await extractPageForTab(tabId, pageUrl);
    if (!page) return; // 提取失败不阻塞对话（模型会说明没有页面内容）。
    if (latest && latest.data.url === page.url && latest.data.contentHash === page.contentHash) {
      return;
    }
    live.session.append('context/page', page);
    live.meta.title = page.title || live.meta.title;
    this.emit({ kind: 'pageContext', conversationId: live.meta.id, page });
  }

  private async touchMeta(live: LiveConversation): Promise<void> {
    live.meta.updatedAt = Date.now();
    await upsertConversation(live.meta);
  }
}

export type { SessionEvent };
