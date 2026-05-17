import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import { App } from './app.tsx';
import './styles.css';

mountShowcase(<App />, { manifest });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    void navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
      // App remains fully usable without the offline shell.
    });
  });
}
