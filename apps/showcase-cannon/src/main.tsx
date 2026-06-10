// Standalone boot — cannon declares `lifecycle: "manual"` in shippie.json,
// so it owns its own mount (golazo idiom). The container marks the frame
// ready on the iframe's native load event.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Offline shell: network-first SW, registered only in production builds.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* SW is progressive enhancement only */
    });
  });
}
