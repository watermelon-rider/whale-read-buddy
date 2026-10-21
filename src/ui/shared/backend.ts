/**
 * side panel ↔ background 通信客户端。
 * 请求/响应用 sendMessage；实时推送（流式增量等）用长连接 Port。
 */
import type { PanelEvent, PanelRequest } from '../../types/protocol';

export function request<T>(req: PanelRequest): Promise<T> {
  return chrome.runtime.sendMessage(req) as Promise<T>;
}

/** 建立推送通道；断线自动重连（service worker 可能被回收）。 */
export function connectPanelEvents(onEvent: (e: PanelEvent) => void): () => void {
  let port: chrome.runtime.Port | undefined;
  let closed = false;
  const connect = () => {
    if (closed) return;
    port = chrome.runtime.connect({ name: 'sidepanel' });
    port.onMessage.addListener(onEvent);
    port.onDisconnect.addListener(() => {
      port = undefined;
      if (!closed) setTimeout(connect, 500);
    });
  };
  connect();
  return () => {
    closed = true;
    port?.disconnect();
  };
}
