import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import { App } from './app.tsx';
import './styles.css';

mountShowcase(<App />, { manifest });
