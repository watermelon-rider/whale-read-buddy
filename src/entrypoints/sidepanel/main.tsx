import { createRoot } from 'react-dom/client';
import { App } from '../../ui/App';
import '../../ui/shared/theme.css';
import '../../ui/shared/chat.css';

// 字体非阻塞加载：谷歌优先 → 国内镜像 → 系统字体。
// media='print' 避免阻塞首屏渲染，加载成功后切回 'all'。
(() => {
  const query = 'family=Noto+Sans+SC:wght@400;500;700&display=swap';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.media = 'print';
  link.href = `https://fonts.googleapis.com/css2?${query}`;
  link.addEventListener('load', () => {
    link.media = 'all';
  });
  link.addEventListener('error', () => {
    link.href = `https://fonts.loli.net/css2?${query}`;
  });
  document.head.appendChild(link);
})();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
