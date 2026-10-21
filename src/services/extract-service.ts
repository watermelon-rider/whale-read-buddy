/**
 * 页面提取编排（background 侧）：
 * - HTML：向 tab 的 content script 发提取请求（Defuddle 在页面内执行）。
 * - PDF：fetch 原始字节 → offscreen document 里跑 pdf.js。
 */
import { contentHash, truncateMarkdown } from '../core/extract/html';
import { normalizeUrl, originOf, type PageContent } from '../types';

const OFFSCREEN_PATH = 'offscreen.html';

function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

export async function extractPageForTab(tabId: number, url: string): Promise<PageContent | null> {
  if (isPdfUrl(url)) return extractPdf(url);
  return extractHtml(tabId, url);
}

async function extractHtml(tabId: number, url: string): Promise<PageContent | null> {
  try {
    const result = (await chrome.tabs.sendMessage(tabId, { kind: 'extractPage' })) as
      | { title: string; markdown: string }
      | { error: string };
    if ('error' in result) return null;
    const { text, truncated } = truncateMarkdown(result.markdown);
    return {
      origin: originOf(url),
      url: normalizeUrl(url),
      title: result.title,
      markdown: text,
      contentHash: contentHash(result.markdown),
      truncated,
      kind: 'html',
    };
  } catch {
    return null;
  }
}

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS'],
    justification: '在 offscreen document 中运行 pdf.js 提取 PDF 文本层',
  });
}

async function extractPdf(url: string): Promise<PageContent | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    await ensureOffscreen();
    // chrome 消息通道只支持 JSON 序列化，ArrayBuffer 需转 base64。
    const bytes = new Uint8Array(data);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const result = (await chrome.runtime.sendMessage({
      kind: 'extractPdf',
      dataBase64: btoa(binary),
    })) as { text: string } | { error: string };
    if ('error' in result) return null;
    const markdown = result.text.trim();
    if (markdown.length === 0) return null; // 扫描版 PDF：无文字层。
    const { text, truncated } = truncateMarkdown(markdown);
    const title = decodeURIComponent(url.split('/').pop() ?? 'PDF 文档');
    return {
      origin: originOf(url),
      url: normalizeUrl(url),
      title,
      markdown: text,
      contentHash: contentHash(markdown),
      truncated,
      kind: 'pdf',
    };
  } catch {
    return null;
  }
}
