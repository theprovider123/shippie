import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { bootAmbientForJournal } from './ambient/init.ts';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Plan E Task 9: kick off ambient analysis on app open. Fire-and-forget.
// The wrapper's observe-init.ts will surface any insights this produces
// via the insight-card on the next render tick.
queueMicrotask(() => {
  void bootAmbientForJournal();
});
