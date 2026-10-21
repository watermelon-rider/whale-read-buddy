/**
 * 草稿批注的页面高亮 + 编号标记渲染（Codex 风格蓝色数字圆点）。
 * 数据源是 background 同步过来的 canonical 草稿列表（syncHighlights），
 * 全量重绘；精确匹配不到的 quote 跳过（页面已变）。
 */
import type { AnnotationItem } from '../types';

const HIGHLIGHT_CLASS = 'deepreader-draft-highlight';
const MARKER_CLASS = 'deepreader-draft-marker';

const STYLE = `
.${HIGHLIGHT_CLASS} {
  background: rgba(37, 99, 235, 0.12);
  border-bottom: 1.5px solid rgba(37, 99, 235, 0.55);
  border-radius: 2px;
  cursor: pointer;
}
.${MARKER_CLASS} {
  position: absolute;
  z-index: 2147483646;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font: 600 11px/20px -apple-system, 'PingFang SC', sans-serif;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  user-select: none;
}
`;

let styleInjected = false;
const rendered: Array<{ quote: string; spans: HTMLElement[]; marker: HTMLElement; range: Range }> = [];

function ensureStyle(): void {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  styleInjected = true;
}

function dispatchEdit(quote: string): void {
  document.dispatchEvent(new CustomEvent('deepreader:edit-annotation', { detail: { quote } }));
}

function clearHighlights(): void {
  for (const item of rendered) {
    for (const span of item.spans) {
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    }
    item.marker.remove();
  }
  rendered.length = 0;
}

function positionMarkers(): void {
  for (const item of rendered) {
    const rects = item.range.getClientRects();
    const last = rects[rects.length - 1];
    if (!last) continue;
    item.marker.style.left = `${last.right + window.scrollX + 4}px`;
    item.marker.style.top = `${last.top + window.scrollY - 8}px`;
  }
}

/** 单文本节点内的精确匹配高亮；跨节点 quote 只取首个完整命中，找不到就跳过。 */
function highlightOne(quote: string, index: number): boolean {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const at = textNode.data.indexOf(quote);
    if (at === -1) continue;
    const target = textNode.splitText(at);
    target.splitText(quote.length);
    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS;
    span.title = `批注 #${index}（未发送）`;
    target.parentNode?.replaceChild(span, target);
    span.appendChild(target);

    const range = document.createRange();
    range.selectNodeContents(span);

    const marker = document.createElement('div');
    marker.className = MARKER_CLASS;
    marker.textContent = String(index);
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchEdit(quote);
    });
    span.addEventListener('click', () => dispatchEdit(quote));
    document.body.appendChild(marker);

    rendered.push({ quote, spans: [span], marker, range });
    return true;
  }
  return false;
}

/** 全量重绘草稿高亮（canonical 列表由 background 同步）。 */
export function renderHighlights(annotations: AnnotationItem[]): void {
  ensureStyle();
  clearHighlights();
  for (const a of annotations) {
    if (a.source.kind === 'page') highlightOne(a.quote, a.index);
  }
  positionMarkers();
}

let listenersReady = false;

export function initHighlightListeners(): void {
  if (listenersReady) return;
  listenersReady = true;
  window.addEventListener('scroll', positionMarkers, { passive: true, capture: true });
  window.addEventListener('resize', positionMarkers, { passive: true });
}

/** 供 annotate.ts 读取某条草稿批注当前的屏幕位置（编辑卡片定位用）。 */
export function rectOfQuote(quote: string): DOMRect | undefined {
  const item = rendered.find((r) => r.quote === quote);
  if (!item) return undefined;
  const rects = item.range.getClientRects();
  return rects[0];
}
