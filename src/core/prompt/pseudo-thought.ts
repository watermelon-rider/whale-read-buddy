/**
 * 伪思维链（脑回路）：从助手输出中提取「脑回路：…」行用于展示，
 * 正文部分去掉该行。真实 reasoning 仍只留日志不展示。
 */

/** 模型忘写时的占位（人设口吻）。 */
export const PSEUDO_THOUGHT_FALLBACK = '脑回路不外借，哼。';

/**
 * 提取脑回路行：只认前 300 字符内的独立行，防止正文误伤。
 * 流式中途（行未结束）也会返回部分 thought，此时正文为空串。
 * 容忍模型加的修饰：「脑回路：」、**脑回路：**、"脑回路：" 等变体。
 */
export function extractPseudoThought(content: string): { thought?: string; content: string } {
  const head = content.slice(0, 300);
  const match = head.match(/[「"'\*]*脑回路[」"'\*\s]*[:：]\s*(.+)/);
  if (!match || match.index === undefined) return { content };

  const lineEnd = content.indexOf('\n', match.index);
  if (lineEnd === -1) {
    // 行未写完（流式中）：整行都是进行中的脑回路。
    const partial = stripDecorations(content.slice(match.index));
    return { thought: partial, content: '' };
  }
  const thought = stripDecorations(content.slice(match.index, lineEnd));
  if (thought.length === 0) return { content };
  // 保留脑回路行之前的文本（约定是在最前面，但模型偶尔先写一句开场白）。
  const before = content.slice(0, match.index).replace(/\s+$/, '');
  const after = content.slice(lineEnd + 1).replace(/^\s*\n/, '');
  const rest = before.length > 0 ? `${before}\n\n${after}` : after;
  return { thought, content: rest };
}

function stripDecorations(line: string): string {
  return line
    .replace(/^[「"'\*\s]*脑回路[」"'\*\s]*[:：]\s*/, '')
    .replace(/^[」"'\*\s]+/, '')
    .replace(/[」"'\*]+\s*$/, '')
    .trim();
}
