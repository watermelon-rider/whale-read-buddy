/**
 * 设置存储：小体积配置走 chrome.storage.local（不上 sync，避免 key 被同步到云端）。
 * 站点指令体积可能较大，存 IndexedDB（见 db.siteInstructions）。
 */
import { DEFAULT_SETTINGS, type Settings } from '../../types';
import { db } from './db';

const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = raw[SETTINGS_KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    // 端点固定默认（设置页不再暴露；历史存档里的自定义值忽略）。
    baseURL: DEFAULT_SETTINGS.baseURL,
    toolsBaseURL: DEFAULT_SETTINGS.toolsBaseURL,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadSiteInstruction(origin: string): Promise<string | undefined> {
  return (await db.siteInstructions.get(origin))?.text;
}

export async function saveSiteInstruction(origin: string, text: string): Promise<void> {
  if (text.trim().length === 0) {
    await db.siteInstructions.delete(origin);
    return;
  }
  await db.siteInstructions.put({ origin, text });
}

export async function listSiteInstructions(): Promise<Array<{ origin: string; text: string }>> {
  return db.siteInstructions.toArray();
}
