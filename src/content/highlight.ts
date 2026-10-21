/**
 * 未发送批注草稿的页面高亮恢复（精确匹配）。
 * 匹配不上（页面已变）就跳过，chip 内容仍在草稿里。
 */
import type { AnnotationItem } from '../types';

const HIGHLIGHT_CLASS = 'deepreader-draft-highlight';

const STYLE = `
.${HIGHLIGHT_CLASS} {
  background: rgba(255, 213, 79, 0.45);
  border-bottom: 2px solid #f9a825;
  border-radius: 2px;
}
`;

let styleInjected = false;

function ensureStyle(): void {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  styleInjected = true;
}

/** 用 TreeWalker 在文本节点里精确查找 quote 并包一层高亮 span。 */
export function restoreHighlights(annotations: AnnotationItem[]): void {
  const pageQuotes = annotations
    .filter((a) => a.source.kind === 'page')
    .map((a) => ({ index: a.index, quote: a.quote }));
  if (pageQuotes.length === 0) return;
  ensureStyle();

  for (const { index, quote } of pageQuotes) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let done = false;
    while ((node = walker.nextNode()) && !done) {
      const textNode = node as Text;
      const at = textNode.data.indexOf(quote);
      if (at === -1) continue;
      // 找到精确匹配：切分文本节点并包裹高亮。
      const target = textNode.splitText(at);
      target.splitText(quote.length);
      const mark = document.createElement('span');
      mark.className = HIGHLIGHT_CLASS;
      mark.dataset.annotationIndex = String(index);
      mark.title = `批注 #${index}（未发送）`;
      target.parentNode?.replaceChild(mark, target);
      mark.appendChild(target);
      done = true;
    }
  }
}
