/**
 * 页面划词批注（Codex 风格交互，参考 dsh-annotation 的编辑/删除逻辑）：
 * 划词 →「批注」按钮 → 原地编辑卡片（引用 + 输入框 + ✓）→ 回车/打勾确认 → 上报 background。
 * 点击已有高亮/编号标记 → 编辑模式（可改批注、可删除）。
 * 失焦/点击他处/滚动/Esc 都会收起按钮与卡片。
 */
import { initHighlightListeners, rectOfQuote } from './highlight';

export interface PageAnnotationHandlers {
  onAdd: (quote: string, note: string, anchor?: { prefix: string; suffix: string }) => void;
  onUpdate: (quote: string, note: string) => void;
  onRemove: (quote: string) => void;
  /** 查询某 quote 的当前批注内容（编辑模式回填）。 */
  getNote: (quote: string) => string;
}

const HOST_CSS = 'position:absolute;z-index:2147483647;';

/** lucide "check" 图标的 SVG 路径（content script 里不用 React，直接内联 SVG）。 */
const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M20 6 9 17l-5-5"/></svg>';

/** 从选区端点向前/向后收集上下文文本（用于多处出现时消歧）。 */
function captureAnchor(range: Range): { prefix: string; suffix: string } {
  const CONTEXT_LEN = 48;
  const collect = (backwards: boolean, from: Node, offset: number): string => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    const idx = nodes.indexOf(from as Text);
    if (idx === -1) return '';
    let text = '';
    if (backwards) {
      for (let i = idx; i >= 0 && text.length < CONTEXT_LEN; i--) {
        const data = nodes[i]!.data;
        const piece = i === idx ? data.slice(0, offset) : data;
        text = piece + text;
      }
    } else {
      for (let i = idx; i < nodes.length && text.length < CONTEXT_LEN; i++) {
        const data = nodes[i]!.data;
        const piece = i === idx ? data.slice(offset) : data;
        text += piece;
      }
    }
    return text;
  };
  return {
    prefix: collect(true, range.startContainer, range.startOffset),
    suffix: collect(false, range.endContainer, range.endOffset),
  };
}

const SHADOW_CSS = `
:host { all: initial; }
.dr-btn {
  padding: 5px 12px; font: 13px -apple-system, 'PingFang SC', sans-serif;
  border: none; border-radius: 999px; background: #1f2329; color: #fff;
  cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.22);
}
.dr-card {
  width: 300px; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0,0,0,.14); padding: 12px;
  font: 13px/1.5 -apple-system, 'PingFang SC', sans-serif; color: #1f2329;
}
.dr-quote {
  max-height: 44px; overflow: hidden; color: #6b7280; font-size: 12px;
  border-left: 3px solid #2563eb; padding-left: 8px; margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.dr-row { display: flex; align-items: center; gap: 8px; }
.dr-input {
  flex: 1; border: none; outline: none; font-size: 13px; padding: 6px 0;
  font-family: inherit; color: #1f2329; background: transparent;
}
.dr-input::placeholder { color: #9ca3af; }
.dr-ok {
  width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
  background: #4e75df; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
}
.dr-del {
  border: none; background: transparent; color: #d93025; cursor: pointer;
  font-size: 12px; padding: 4px 6px; flex: none;
}
`;

type EditorState =
  | { mode: 'add'; quote: string }
  | { mode: 'edit'; quote: string };

export function mountAnnotationFlow(handlers: PageAnnotationHandlers): void {
  initHighlightListeners();

  const host = document.createElement('div');
  host.id = 'deepreader-annotate-host';
  host.style.cssText = HOST_CSS + 'display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  shadow.appendChild(style);
  document.documentElement.appendChild(host);

  let currentQuote = '';
  let currentAnchor: { prefix: string; suffix: string } | undefined;
  let editor: EditorState | null = null;

  const hide = () => {
    host.style.display = 'none';
    shadow.querySelectorAll('.dr-live').forEach((n) => n.remove());
  };
  const closeEditor = () => {
    editor = null;
    hide();
  };

  const clamp = (x: number, y: number, w: number, h: number) => ({
    left: Math.max(8, Math.min(x, window.scrollX + window.innerWidth - w - 8)),
    top: Math.max(window.scrollY + 8, Math.min(y, window.scrollY + window.innerHeight - h - 8)),
  });

  const showButton = (rect: DOMRect) => {
    hide();
    const btn = document.createElement('button');
    btn.className = 'dr-btn dr-live';
    btn.textContent = '批注';
    shadow.appendChild(btn);
    host.style.left = `${rect.left + window.scrollX}px`;
    host.style.top = `${rect.bottom + window.scrollY + 6}px`;
    host.style.display = 'block';
    // mousedown 先于 selectionchange 清空选区，preventDefault 保住选区。
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      editor = { mode: 'add', quote: currentQuote };
      openEditor(rect);
    });
  };

  const openEditor = (rect: DOMRect) => {
    if (!editor) return;
    const state: EditorState = editor;
    hide();
    const card = document.createElement('div');
    card.className = 'dr-card dr-live';

    const quoteEl = document.createElement('div');
    quoteEl.className = 'dr-quote';
    quoteEl.textContent = state.quote.length > 100 ? `${state.quote.slice(0, 100)}…` : state.quote;
    card.appendChild(quoteEl);

    const row = document.createElement('div');
    row.className = 'dr-row';
    const input = document.createElement('input');
    input.className = 'dr-input';
    input.placeholder = '添加可选评论…';
    input.value = state.mode === 'edit' ? handlers.getNote(state.quote) : '';
    row.appendChild(input);

    if (state.mode === 'edit') {
      const del = document.createElement('button');
      del.className = 'dr-del';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        handlers.onRemove(state.quote);
        closeEditor();
      });
      row.appendChild(del);
    }

    const ok = document.createElement('button');
    ok.className = 'dr-ok';
    ok.innerHTML = CHECK_SVG;
    const confirm = () => {
      const note = input.value.trim();
      if (state.mode === 'add') handlers.onAdd(state.quote, note, currentAnchor);
      else handlers.onUpdate(state.quote, note);
      closeEditor();
    };
    ok.addEventListener('click', confirm);
    row.appendChild(ok);
    card.appendChild(row);

    // IME 组词中 Enter 不确认。
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        confirm();
      }
      if (e.key === 'Escape') closeEditor();
    });

    shadow.appendChild(card);
    const pos = clamp(rect.left + window.scrollX, rect.bottom + window.scrollY + 6, 300, 120);
    host.style.left = `${pos.left}px`;
    host.style.top = `${pos.top}px`;
    host.style.display = 'block';
    input.focus();
  };

  document.addEventListener('selectionchange', () => {
    if (editor) return; // 编辑器打开时选区变化不收起。
    const selection = document.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || text.length === 0) {
      hide();
      currentQuote = '';
      return;
    }
    const anchorNode = selection.anchorNode;
    if (anchorNode && host.contains(anchorNode)) return;
    currentQuote = text.slice(0, 2000);
    currentAnchor = captureAnchor(selection.getRangeAt(0));
    showButton(selection.getRangeAt(0).getBoundingClientRect());
  });

  // 点击已有高亮/编号标记 → 编辑模式。
  document.addEventListener('deepreader:edit-annotation', (e) => {
    const quote = (e as CustomEvent<{ quote: string }>).detail.quote;
    const rect = rectOfQuote(quote);
    if (!rect) return;
    editor = { mode: 'edit', quote };
    openEditor(rect);
  });

  // 失焦/点击他处/滚动/Esc 收起（修复"框选后失焦按钮不消失"）。
  document.addEventListener('mousedown', (e) => {
    if (!host.contains(e.target as Node) && !editor) hide();
    if (editor && !host.contains(e.target as Node)) closeEditor();
  });
  window.addEventListener('blur', closeEditor);
  window.addEventListener('scroll', () => { if (!editor) hide(); }, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditor();
  });
}
