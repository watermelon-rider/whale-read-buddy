/**
 * 批注协议块的组装与解析（借鉴 dsh-annotation 的消息协议）。
 * 分隔符恒为「其他信息：」（跨语言稳定，历史消息可解析），批注正文文案跟随界面语言。
 */
import type { AnnotationItem } from '../../types';
import { t } from '../../i18n';

export const ANNOTATION_DELIMITER = '其他信息：';

/** 组装模型可见的批注协议块（不含提问正文）。 */
export function buildAnnotationProtocol(items: AnnotationItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = [
    ANNOTATION_DELIMITER,
    t('annotationProtocolBody', { n: items.length }),
  ];
  for (const item of items) {
    lines.push(`${item.index}. 「${item.quote}」`);
    lines.push(
      `   ${t('annotationProtocolNote', { note: item.note || t('annotationProtocolOnlyMark') })}`,
    );
  }
  lines.push('');
  lines.push(t('annotationProtocolAsk', { n: items.length }));
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
