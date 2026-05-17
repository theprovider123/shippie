import { mountShowcase } from '@shippie/showcase-kit/boot';
import manifest from '../shippie.json';
import { App } from './App.tsx';
import { bootAmbientForJournal } from './ambient/init.ts';
import './styles.css';

mountShowcase(<App />, { manifest });

// Plan E Task 9: kick off ambient analysis on app open. Fire-and-forget.
// The wrapper's observe-init.ts will surface any insights this produces
// via the insight-card on the next render tick.
queueMicrotask(() => {
  void bootAmbientForJournal();
});
