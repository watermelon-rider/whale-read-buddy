/**
 * DeepSeek Search API 提供方（参照 dsh-web-deepseek-api/src/search.ts）。
 * 直连 {toolsBaseURL}/search，一次 HTTP 请求完成，不消耗模型轮次。
 */
import type { Settings } from '../../types';

export interface WebSource {
  url: string;
  title?: string;
  snippet?: string;
  /** 长摘要（600-800 字符，官方说明适用于给模型阅读）。 */
  summary?: string;
  siteName?: string;
  publishedAt?: string;
}

export class WebProviderError extends Error {
  constructor(
    readonly code: 'WEB_PROVIDER_CREDENTIAL_MISSING' | 'WEB_PROVIDER_ERROR' | 'WEB_ABORTED',
    message: string,
  ) {
    super(message);
    this.name = 'WebProviderError';
  }
}

const ORIGINAL_QUESTION_MAX_CHARS = 128;

function boundedQuestion(question: string | undefined): string | undefined {
  const collapsed = question?.replace(/\s+/gu, ' ').trim() ?? '';
  if (collapsed.length === 0) return undefined;
  return Array.from(collapsed).slice(0, ORIGINAL_QUESTION_MAX_CHARS).join('');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 校验并投影 Search API 响应。 */
export function mapSearchResponse(response: unknown): WebSource[] {
  if (!isRecord(response) || !Array.isArray(response.results)) {
    throw new WebProviderError('WEB_PROVIDER_ERROR', 'Search API 返回了无法识别的响应。');
  }
  return (response.results as unknown[]).map((item) => {
    if (
      !isRecord(item) ||
      typeof item.url !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.snippet !== 'string' ||
      (item.summary !== undefined && item.summary !== null && typeof item.summary !== 'string') ||
      (item.site_name !== undefined && item.site_name !== null && typeof item.site_name !== 'string') ||
      (item.date !== null && typeof item.date !== 'string')
    ) {
      throw new WebProviderError('WEB_PROVIDER_ERROR', 'Search API 响应条目格式非法。');
    }
    const source: WebSource = { url: item.url };
    if (item.title.length > 0) source.title = item.title;
    if (item.snippet.length > 0) source.snippet = item.snippet;
    if (typeof item.summary === 'string' && item.summary.length > 0) source.summary = item.summary;
    if (typeof item.site_name === 'string' && item.site_name.length > 0) source.siteName = item.site_name;
    if (item.date !== null && item.date.length > 0) source.publishedAt = item.date;
    return source;
  });
}

export async function webSearch(
  settings: Pick<Settings, 'apiKey' | 'toolsBaseURL'>,
  query: string,
  maxResults: number,
  originalQuestion?: string,
  signal?: AbortSignal,
): Promise<WebSource[]> {
  if (!settings.apiKey) {
    throw new WebProviderError(
      'WEB_PROVIDER_CREDENTIAL_MISSING',
      '未配置 API Key。请引导用户前往扩展设置页填写 DeepSeek API Key。',
    );
  }
  const question = boundedQuestion(originalQuestion);
  let response: Response;
  try {
    response = await fetch(`${settings.toolsBaseURL.replace(/\/+$/, '')}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        query,
        count: Math.min(Math.max(1, maxResults), 50),
        need_content: false,
        ...(question === undefined ? {} : { ori_question: question }),
      }),
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new WebProviderError('WEB_ABORTED', '搜索已被取消。');
    }
    throw new WebProviderError('WEB_PROVIDER_ERROR', `Search API 请求失败：${String(err)}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new WebProviderError(
      'WEB_PROVIDER_ERROR',
      `Search API HTTP ${response.status}：${text.slice(0, 200)}（端点：${settings.toolsBaseURL}，可在设置页修改）`,
    );
  }
  return mapSearchResponse(await response.json());
}
