import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import './styles.css';
import { App } from './app.tsx';

mountShowcase(<App />, { manifest });
