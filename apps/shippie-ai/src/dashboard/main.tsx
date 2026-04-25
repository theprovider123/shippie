/**
 * React entry for the Shippie AI dashboard.
 *
 * Mounts the App into #root and registers the service worker (which caches
 * model files and the dashboard shell so the app works offline once
 * installed).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing — broken HTML shell');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  // The vite-plugin-pwa toolchain emits the service worker; register lazily
  // so the first paint isn't blocked.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failures shouldn't surface to the user; the app
      // still works without offline caching.
    });
  });
}
