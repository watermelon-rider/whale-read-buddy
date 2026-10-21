/**
 * 页面划词批注工具条（Shadow DOM 隔离页面样式）。
 * 选中文字 → 跟随选区的「批注」按钮 → 点击上报 quote。
 */
const TOOLBAR_ID = 'deepreader-annotate-toolbar';

export function mountAnnotationToolbar(onAnnotate: (quote: string) => void): void {
  const host = document.createElement('div');
  host.id = TOOLBAR_ID;
  host.style.cssText = 'position:absolute;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const button = document.createElement('button');
  button.textContent = '批注';
  button.style.cssText = [
    'padding:4px 10px',
    'font-size:12px',
    'border:none',
    'border-radius:6px',
    'background:#1a73e8',
    'color:#fff',
    'cursor:pointer',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)',
  ].join(';');
  shadow.appendChild(button);
  document.documentElement.appendChild(host);

  let currentQuote = '';

  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || text.length === 0) {
      host.style.display = 'none';
      currentQuote = '';
      return;
    }
    const anchorNode = selection.anchorNode;
    if (anchorNode && host.contains(anchorNode)) return;
    currentQuote = text;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    host.style.left = `${rect.left + window.scrollX}px`;
    host.style.top = `${rect.bottom + window.scrollY + 6}px`;
    host.style.display = 'block';
  });

  // mousedown 先于 selectionchange 清空选区，用 preventDefault 保住选区。
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentQuote.length > 0) onAnnotate(currentQuote.slice(0, 2000));
    host.style.display = 'none';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') host.style.display = 'none';
  });
}
