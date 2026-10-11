import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');
createRoot(root).render(null);
