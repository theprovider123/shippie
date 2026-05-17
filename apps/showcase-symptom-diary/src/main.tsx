import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Brand: Shippie design tokens — sunset/sage/marigold, Fraunces, sharp corners.
import '@shippie/design-tokens/tokens.css';
import './styles.css';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
