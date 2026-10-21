/**
 * 批注协议块的组装与解析（借鉴 dsh-annotation 的消息协议）。
 * 分隔符为「其他信息：」（无方括号），解析与气泡渲染均以此为准。
 */
import type { AnnotationItem } from '../../types';

export const ANNOTATION_DELIMITER = '其他信息：';

/** 组装模型可见的批注协议块（不含提问正文）。 */
export function buildAnnotationProtocol(items: AnnotationItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = [
    ANNOTATION_DELIMITER,
    `我批注了以下 ${items.length} 处内容：`,
  ];
  for (const item of items) {
    lines.push(`${item.index}. 「${item.quote}」`);
    lines.push(`   批注：${item.note || '（仅标记，无批注内容）'}`);
  }
  lines.push('');
  lines.push(
    `请先用「Annotation 1：…」到「Annotation ${items.length}：…」的格式逐条回应我的批注，然后回答我的提问。`,
  );
  return lines.join('\n');
}

/**
 * 从已发送的用户消息文本中拆出 [提问正文, 协议块]。
 * 以最后一个分隔符切分（批注内容里出现分隔符的概率极低，取最后一个更稳）。
 */
export function splitAnnotationProtocol(text: string): { question: string; block?: string } {
  const idx = text.lastIndexOf(`\n${ANNOTATION_DELIMITER}`);
  if (idx === -1) {
    return text.startsWith(ANNOTATION_DELIMITER)
      ? { question: '', block: text }
      : { question: text };
  }
  return {
    question: text.slice(0, idx).replace(/\n+$/, ''),
    block: text.slice(idx + 1),
  };
}

/** 回复中「Annotation N：」标签的匹配，供 UI 替换为 hoverable chip。 */
export const REPLY_ANNOTATION_RE = /Annotation\s+(\d+)\s*[：:]/g;
