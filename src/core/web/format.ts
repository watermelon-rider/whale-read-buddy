/**
 * web_search 结果的多查询合并与模型可读格式化（参照 dsh-tool-web/src/search.ts）。
 */
import { SEARCH_MAX_RESULTS } from '../agent/tools';
import type { WebSource } from './search';

/** 多查询结果轮询合并：按排名交错、URL 去重、截断到 maxResults。 */
export function mergeSearchResults(
  resultsByQuery: WebSource[][],
  maxResults: number = SEARCH_MAX_RESULTS,
): WebSource[] {
  const merged: WebSource[] = [];
  const seen = new Set<string>();
  let round = 0;
  for (;;) {
    let advanced = false;
    for (const results of resultsByQuery) {
      const source = results[round];
      if (!source) continue;
      advanced = true;
      if (seen.has(source.url)) continue;
      if (merged.length >= maxResults) return merged;
      seen.add(source.url);
      merged.push(source);
    }
    if (!advanced) return merged;
    round++;
  }
}

/** 格式化为模型可读文本：每个查询一节 + Sources: 列表 + 引用指引。 */
export function formatSearchResult(queries: string[], merged: WebSource[]): string {
  if (merged.length === 0) {
    return `搜索 ${queries.map((q) => `"${q}"`).join(', ')} 没有找到相关结果。`;
  }
  const lines = merged.map((s, i) => {
    const title = s.title && s.title.length > 0 ? s.title : s.url;
    const parts = [`${i + 1}. [${title}](${s.url})`];
    // summary 是给模型读的长摘要，优先于 snippet。
    const abstract = s.summary ?? s.snippet;
    if (s.siteName) parts.push(`   来源站点：${s.siteName}`);
    if (abstract) parts.push(`   ${abstract}`);
    if (s.publishedAt) parts.push(`   发布于 ${s.publishedAt}`);
    return parts.join('\n');
  });
  return [
    `搜索查询：${queries.map((q) => `"${q}"`).join(', ')}`,
    '',
    'Sources:',
    ...lines,
    '',
    '在回答中引用来源时请带上对应 URL。需要阅读某来源全文时使用 web_fetch。',
  ].join('\n');
}
