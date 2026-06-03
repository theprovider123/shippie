import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import { App } from './App.tsx';
import './styles.css';

mountShowcase(<App />, { manifest });
