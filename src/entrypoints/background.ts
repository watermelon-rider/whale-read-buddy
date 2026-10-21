/**
 * Background service worker 入口：装配各服务、路由消息。
 * Agent 循环与会话日志在此运行，side panel 关闭不中断流式与工具调用。
 */
import { defineBackground } from 'wxt/utils/define-background';
import { ConversationManager } from '../services/conversation-manager';
import {
  deleteConversation,
  listAllConversations,
  listConversationsByOrigin,
  loadSession,
} from '../services/storage/sessions';
import { loadDraft, saveDraft } from '../services/storage/drafts';
import {
  listSiteInstructions,
  loadSettings,
  loadSiteInstruction,
  saveSettings,
  saveSiteInstruction,
} from '../services/storage/settings';
import type { PanelEvent, PanelRequest, PanelSnapshot } from '../types/protocol';
import type { AnnotationItem } from '../types';

export default defineBackground(() => {
  // 点工具栏图标打开 side panel。
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // 安装/更新后，给所有已打开的 http(s) 标签页补注 content script
  //（Chrome 不会对扩展安装前已存在的标签页自动注入）。
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id !== undefined) {
          chrome.scripting
            .executeScript({ target: { tabId: tab.id }, files: ['content-scripts/content.js'] })
            .catch(() => {});
        }
      }
    });
  });

  const panelPorts = new Set<chrome.runtime.Port>();
  const emit = (event: PanelEvent) => {
    for (const port of panelPorts) {
      try {
        port.postMessage(event);
      } catch {
        // 面板已关闭：流式与工具调用继续，重开后由快照重建。
      }
    }
  };

  const manager = new ConversationManager(emit);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') return;
    panelPorts.add(port);
    port.onDisconnect.addListener(() => panelPorts.delete(port));
  });

  const PANEL_REQUEST_KINDS = new Set([
    'openConversation', 'newConversation', 'sendMessage', 'cancelTurn', 'listConversations',
    'deleteConversation', 'loadHistory', 'saveDraft', 'loadDraft', 'restoreHighlights',
    'getSettings', 'saveSettings', 'getSiteInstruction', 'saveSiteInstruction',
    'listSiteInstructions', 'answerAskUser',
  ]);

  chrome.runtime.onMessage.addListener((raw: PanelRequest, sender, sendResponse) => {
    // 只处理面板请求；content script 的上报由下方另一个监听器接管。
    if (!PANEL_REQUEST_KINDS.has((raw as { kind: string }).kind)) return false;
    void handleRequest(raw, sender).then(
      sendResponse,
      (err) => sendResponse({ error: String(err instanceof Error ? err.message : err) }),
    );
    return true; // 异步响应
  });

  async function handleRequest(req: PanelRequest, sender: chrome.runtime.MessageSender) {
    switch (req.kind) {
      case 'openConversation': {
        await manager.refreshSystemPrompt(new URL(req.url).origin);
        return manager.openConversation(req.tabId, req.url);
      }
      case 'newConversation': {
        const meta = await manager.createConversation(req.url);
        await manager.refreshSystemPrompt(meta.origin);
        return meta;
      }
      case 'sendMessage': {
        // 需要 tabId 来提取页面：side panel 不知道 tab，发送时由面板附带当前 tabId。
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) throw new Error('无法定位当前标签页');
        await manager.refreshSystemPrompt(new URL(tab.url).origin);
        await manager.sendMessage(
          req.conversationId,
          tab.id,
          tab.url,
          req.question,
          req.annotations,
          req.thinkingEnabled,
        );
        return { ok: true };
      }
      case 'cancelTurn':
        manager.cancelTurn(req.conversationId);
        return { ok: true };
      case 'listConversations':
        return req.origin ? listConversationsByOrigin(req.origin) : listAllConversations();
      case 'deleteConversation':
        await deleteConversation(req.conversationId);
        return { ok: true };
      case 'loadHistory': {
        const session = await loadSession(req.conversationId);
        const draft = await loadDraft(req.conversationId);
        const snapshot: PanelSnapshot = {
          conversation: (await manager.ensureLive(req.conversationId)).meta,
          events: session.snapshot(),
          draft: {
            question: draft?.question ?? '',
            annotations: draft?.annotations ?? [],
          },
        };
        return snapshot;
      }
      case 'saveDraft':
        await saveDraft(req.conversationId, req.question, req.annotations);
        await syncHighlightsToActiveTab(req.annotations);
        return { ok: true };
      case 'loadDraft':
        return (await loadDraft(req.conversationId)) ?? { question: '', annotations: [] };
      case 'restoreHighlights': {
        const draft = await loadDraft(req.conversationId);
        await syncHighlightsToActiveTab(draft?.annotations ?? []);
        return { ok: true };
      }
      case 'getSettings':
        return loadSettings();
      case 'saveSettings':
        await saveSettings(req.settings);
        return { ok: true };
      case 'getSiteInstruction':
        return (await loadSiteInstruction(req.origin)) ?? '';
      case 'saveSiteInstruction':
        await saveSiteInstruction(req.origin, req.text);
        return { ok: true };
      case 'listSiteInstructions':
        return listSiteInstructions();
      case 'answerAskUser':
        manager.answerAskUser(req.requestId, req.answers);
        return { ok: true };
      default:
        throw new Error(`未知请求：${JSON.stringify(req)}`);
    }
  }

  // 把页面批注草稿同步高亮到当前标签页的 content script。
  async function syncHighlightsToActiveTab(annotations: AnnotationItem[]): Promise<void> {
    const pageAnnotations = annotations.filter((a) => a.source.kind === 'page');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs
        .sendMessage(tab.id, { kind: 'syncHighlights', annotations: pageAnnotations })
        .catch(() => {});
    }
  }

  // content script 上报的页面划词批注：写入当前会话草稿（background 是草稿的唯一写入口），
  // 广播给 side panel，并把最新列表回同步给页面重画高亮。
  chrome.runtime.onMessage.addListener((raw) => {
    const report = raw as {
      kind: string;
      quote?: string;
      note?: string;
      anchor?: { prefix: string; suffix: string };
    };
    if (typeof report.quote !== 'string') return;
    if (report.kind === 'pageSelected') {
      void manager
        .addPageAnnotation(report.quote, report.note ?? '', report.anchor)
        .then(() => resyncCurrentDraft());
    } else if (report.kind === 'pageAnnotationUpdated') {
      void manager.updatePageAnnotation(report.quote, report.note ?? '');
    } else if (report.kind === 'pageAnnotationRemoved') {
      void manager.removePageAnnotation(report.quote).then(() => resyncCurrentDraft());
    }
  });

  async function resyncCurrentDraft(): Promise<void> {
    const id = await manager.resolveCurrentConversationId();
    if (!id) return;
    const draft = await loadDraft(id);
    await syncHighlightsToActiveTab(draft?.annotations ?? []);
  }
});
