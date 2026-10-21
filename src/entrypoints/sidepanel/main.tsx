import { createRoot } from 'react-dom/client';
import { App } from '../../ui/App';
import '../../ui/shared/theme.css';
import '../../ui/shared/chat.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
