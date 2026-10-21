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

  chrome.runtime.onMessage.addListener((raw: PanelRequest, sender, sendResponse) => {
    void handleRequest(raw, sender).then(sendResponse);
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
        return { ok: true };
      case 'loadDraft':
        return (await loadDraft(req.conversationId)) ?? { question: '', annotations: [] };
      case 'restoreHighlights': {
        const draft = await loadDraft(req.conversationId);
        const pageAnnotations = (draft?.annotations ?? []).filter((a) => a.source.kind === 'page');
        if (pageAnnotations.length === 0) return { ok: true };
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs
            .sendMessage(tab.id, { kind: 'restoreHighlights', annotations: pageAnnotations })
            .catch(() => {});
        }
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

  // content script 上报的页面划词，广播给 side panel（由面板加入当前会话草稿 chip 列表）。
  chrome.runtime.onMessage.addListener((raw) => {
    const report = raw as { kind: string; quote?: string };
    if (report.kind !== 'pageSelected' || typeof report.quote !== 'string') return;
    emit({ kind: 'pageAnnotationCandidate', quote: report.quote });
  });
});
