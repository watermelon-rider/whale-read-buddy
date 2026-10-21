/**
 * Side panel 应用根组件：视图路由（chat / history / settings）。
 */
import { useCallback, useEffect, useState } from 'react';
import { originOf, type ConversationMeta } from '../types';
import { request } from './shared/backend';
import { ChatView } from './chat/ChatView';
import { HistoryView } from './history/HistoryView';
import { SettingsView } from './settings/SettingsView';

type View = { name: 'chat' } | { name: 'history' } | { name: 'settings' };

export function App() {
  const [view, setView] = useState<View>({ name: 'chat' });
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  // 启动：定位当前标签页，打开（或创建）其 origin 的最近会话。
  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) return;
      setCurrentUrl(tab.url);
      const meta = await request<ConversationMeta>({
        kind: 'openConversation',
        tabId: tab.id,
        url: tab.url,
      });
      setConversation(meta);
    })();
  }, []);

  const handleNew = useCallback(async () => {
    if (!currentUrl) return;
    const meta = await request<ConversationMeta>({ kind: 'newConversation', url: currentUrl });
    setConversation(meta);
    setView({ name: 'chat' });
  }, [currentUrl]);

  if (!conversation) {
    return <div className="dr-empty">正在打开会话…</div>;
  }

  const currentOrigin = originOf(currentUrl || conversation.origin);

  switch (view.name) {
    case 'history':
      return (
        <HistoryView
          currentOrigin={currentOrigin}
          onOpen={(meta) => {
            setConversation(meta);
            setView({ name: 'chat' });
          }}
          onNew={() => void handleNew()}
          onBack={() => setView({ name: 'chat' })}
        />
      );
    case 'settings':
      return <SettingsView currentOrigin={currentOrigin} onBack={() => setView({ name: 'chat' })} />;
    default:
      return (
        <ChatView
          conversation={conversation}
          onOpenHistory={() => setView({ name: 'history' })}
          onOpenSettings={() => setView({ name: 'settings' })}
        />
      );
  }
}
