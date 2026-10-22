/**
 * 草稿批注的页面高亮 + 编号标记渲染（Codex 风格蓝色数字圆点）。
 * 数据源是 background 同步过来的 canonical 草稿列表（syncHighlights），
 * 全量重绘；精确匹配不到的 quote 跳过（页面已变）。
 */
import type { AnnotationItem } from '../types';
import { t } from '../i18n';

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
  // 全局清理：不按实例记——扩展重载/重复注入可能留下孤儿实例的旧标记。
  document.querySelectorAll(`.${MARKER_CLASS}`).forEach((n) => n.remove());
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });
  rendered.length = 0;
}

function positionMarkers(): void {
  for (const item of rendered) {
    const rects = item.range.getClientRects();
    const last = rects[rects.length - 1];
    if (!last) continue;
    item.marker.style.left = `${last.right + window.scrollX + 4}px`;
    item.marker.style.top = `${last.top + window.scrollY - 13}px`;
  }
}

interface TextNodeEntry {
  node: Text;
  /** 在拼接全文中的起始偏移。 */
  start: number;
}

/** 收集 body 下所有文本节点并拼接全文（跳过我们自己的 UI）。 */
function collectPageText(): { full: string; nodes: TextNodeEntry[] } {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: TextNodeEntry[] = [];
  let full = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (textNode.data.trim().length === 0) continue;
    nodes.push({ node: textNode, start: full.length });
    full += textNode.data;
  }
  return { full, nodes };
}

/** 在全文里找 quote 的所有出现位置，用前后文锚点选出最匹配的一处。 */
function locateQuote(
  full: string,
  quote: string,
  anchor?: { prefix: string; suffix: string },
): number {
  const occurrences: number[] = [];
  let from = 0;
  for (;;) {
    const at = full.indexOf(quote, from);
    if (at === -1) break;
    occurrences.push(at);
    from = at + 1;
  }
  if (occurrences.length === 0) return -1;
  if (occurrences.length === 1 || !anchor) return occurrences[0] ?? -1;

  // 多处出现：按前后文匹配度打分（精确匹配前缀/后缀各记 1 分）。
  let best = -1;
  let bestScore = -1;
  for (const at of occurrences) {
    let score = 0;
    const before = full.slice(Math.max(0, at - anchor.prefix.length), at);
    const after = full.slice(at + quote.length, at + quote.length + anchor.suffix.length);
    if (anchor.prefix && before === anchor.prefix) score++;
    if (anchor.suffix && after === anchor.suffix) score++;
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }
  return best;
}

/** 把全文偏移映射回文本节点；跨节点的 quote 暂不包裹（MVP 限制）。 */
function wrapAt(nodes: TextNodeEntry[], fullStart: number, length: number, index: number, quote: string): boolean {
  const entry = nodes.find((n) => fullStart >= n.start && fullStart + length <= n.start + n.node.data.length);
  if (!entry) return false;
  const at = fullStart - entry.start;
  const target = entry.node.splitText(at);
  target.splitText(length);
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS;
  span.title = t('annotationMarkerTitle', { n: index });
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

/** 精确 + 前后文锚定的高亮；找不到就跳过（页面已变）。 */
function highlightOne(annotation: AnnotationItem): boolean {
  const { full, nodes } = collectPageText();
  const at = locateQuote(full, annotation.quote, annotation.anchor);
  if (at === -1) return false;
  return wrapAt(nodes, at, annotation.quote.length, annotation.index, annotation.quote);
}

/** 全量重绘草稿高亮（canonical 列表由 background 同步）。 */
export function renderHighlights(annotations: AnnotationItem[]): void {
  ensureStyle();
  clearHighlights();
  for (const a of annotations) {
    if (a.source.kind === 'page') highlightOne(a);
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
