/**
 * 系统提示词（全局）+ 会话提示词（仅当前会话），带字节预算。
 * 预算耗尽时先省略全局部分，会话提示词最后截断。
 */

export const INSTRUCTIONS_MAX_BYTES = 8192;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 在字节预算内组装指令链。
 * @returns 组合后的指令文本；为空时返回 undefined（空指令链不添加任何内容）。
 */
export function assembleInstructions(
  globalInstructions: string,
  conversationInstructions: string | undefined,
  maxBytes: number = INSTRUCTIONS_MAX_BYTES,
): string | undefined {
  const global = globalInstructions.trim();
  const conv = conversationInstructions?.trim() ?? '';

  const convSection = conv.length > 0 ? `【当前会话的提示词】\n${conv}` : '';
  const globalSection = global.length > 0 ? `【用户自定义系统提示词】\n${global}` : '';

  const combined = [convSection, globalSection].filter((s) => s.length > 0).join('\n\n');
  if (combined.length === 0) return undefined;
  if (byteLength(combined) <= maxBytes) return combined;

  // 超预算：先尝试只保留会话提示词。
  if (convSection.length > 0 && byteLength(convSection) <= maxBytes) return convSection;
  // 会话提示词也超了：截断会话提示词本身。
  const target = convSection.length > 0 ? convSection : globalSection;
  const bytes = new TextEncoder().encode(target);
  const truncated = new TextDecoder().decode(bytes.slice(0, maxBytes));
  return `${truncated}\n（指令过长，已截断）`;
}
