import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import '@shippie/design-tokens/tokens.css';
import './styles.css';
import { App } from './App.tsx';

mountShowcase(<App />, { manifest });
