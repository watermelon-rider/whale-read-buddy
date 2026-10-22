/**
 * i18n：跟随浏览器 UI 语言（chrome.i18n.getUILanguage），支持中文/英文。
 * 在 content script、side panel、service worker 中都可用；非扩展环境（vitest）回退中文。
 * 语言在进程加载时解析一次，运行中不切换（面板重开即刷新）。
 */
import { messages, type MessageKey } from './messages';

export type Locale = 'zh' | 'en';

let cached: Locale | null = null;

export function getLocale(): Locale {
  if (cached) return cached;
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      cached = chrome.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
      return cached;
    }
  } catch {
    // 非扩展环境（测试）回退中文。
  }
  cached = 'zh';
  return cached;
}

/** 取文案；{name} 形式的占位用 vars 替换。 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const table = messages[getLocale()];
  let text: string = table[key] ?? messages.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
