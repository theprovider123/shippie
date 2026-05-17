import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import { App } from './app.tsx';

mountShowcase(<App />, { manifest });
