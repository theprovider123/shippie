import { mountShowcase } from '@shippie/showcase-kit/boot';
import { App } from './App.tsx';
import manifest from '../shippie.json';
import './styles.css';

mountShowcase(<App />, { manifest });
