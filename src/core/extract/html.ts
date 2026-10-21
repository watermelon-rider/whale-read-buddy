/**
 * HTML 正文的预算截断（纯函数）。Defuddle 调用在 content script 侧（core 不碰 DOM）。
 * 策略：超预算时保留开头与结尾，掐掉中间。
 */
export const PAGE_MARKDOWN_BUDGET_CHARS = 100_000;

export function truncateMarkdown(
  markdown: string,
  budgetChars: number = PAGE_MARKDOWN_BUDGET_CHARS,
): { text: string; truncated: boolean } {
  if (markdown.length <= budgetChars) return { text: markdown, truncated: false };
  const headChars = Math.floor(budgetChars * 0.6);
  const tailChars = budgetChars - headChars;
  const head = markdown.slice(0, headChars);
  const tail = markdown.slice(markdown.length - tailChars);
  return {
    text: `${head}\n\n[……中间 ${markdown.length - budgetChars} 字符已省略……]\n\n${tail}`,
    truncated: true,
  };
}

/** 简易内容哈希（FNV-1a），用于同会话内重复注入去重。 */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
