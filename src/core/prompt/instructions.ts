/**
 * 全局指令 + per-origin 站点指令（借鉴 dsh-agent-instructions），带字节预算。
 * 预算耗尽时先省略宽泛（全局）指令，站点指令最后截断。
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
  siteInstructions: string | undefined,
  maxBytes: number = INSTRUCTIONS_MAX_BYTES,
): string | undefined {
  const global = globalInstructions.trim();
  const site = siteInstructions?.trim() ?? '';

  const siteSection = site.length > 0 ? `【针对当前站点的阅读指令】\n${site}` : '';
  const globalSection = global.length > 0 ? `【全局阅读指令】\n${global}` : '';

  const combined = [siteSection, globalSection].filter((s) => s.length > 0).join('\n\n');
  if (combined.length === 0) return undefined;
  if (byteLength(combined) <= maxBytes) return combined;

  // 超预算：先尝试只保留站点指令。
  if (siteSection.length > 0 && byteLength(siteSection) <= maxBytes) return siteSection;
  // 站点指令也超了：截断站点指令本身。
  const target = siteSection.length > 0 ? siteSection : globalSection;
  const bytes = new TextEncoder().encode(target);
  const truncated = new TextDecoder().decode(bytes.slice(0, maxBytes));
  return `${truncated}\n（指令过长，已截断）`;
}
