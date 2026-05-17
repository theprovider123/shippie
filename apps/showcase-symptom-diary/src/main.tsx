import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
// Brand: Shippie design tokens — sunset/sage/marigold, Fraunces, sharp corners.
import '@shippie/design-tokens/tokens.css';
import './styles.css';
import { App } from './App.tsx';

mountShowcase(<App />, { manifest });
