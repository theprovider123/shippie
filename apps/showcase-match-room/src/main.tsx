import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    void navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
      // App remains fully usable without the offline shell.
    });
  });
}
