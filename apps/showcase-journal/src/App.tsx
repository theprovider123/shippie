import { useEffect, useState } from 'react';
import { WriteEntry } from './pages/WriteEntry.tsx';
import { Browse } from './pages/Browse.tsx';
import { Search } from './pages/Search.tsx';
import { Trends } from './pages/Trends.tsx';
import { YearInReview } from './pages/YearInReview.tsx';
import { Recall } from './pages/Recall.tsx';
import { isLocalAiAvailable } from './ai/runtime.ts';
import { wrapNavigation } from '@shippie/sdk/wrapper';

interface ShippieRoot {
  openYourData?: () => void;
}

type Tab = 'write' | 'browse' | 'search' | 'recall' | 'trends' | 'year';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'browse', label: 'Browse' },
  { id: 'search', label: 'Search' },
  { id: 'recall', label: 'Recall' },
  { id: 'trends', label: 'Trends' },
  { id: 'year', label: 'Year' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('write');
  const [refreshKey, setRefreshKey] = useState(0);
  const [encryptionNotice, setEncryptionNotice] = useState<string | null>(null);

  useEffect(() => {
    // The SQLCipher status is reported by the runtime via `shippie.local.db.usage()` —
    // when the runtime isn't present, we surface a transparent fallback notice.
    if (!isLocalAiAvailable()) {
      setEncryptionNotice('Running in dev mode: AI uses a local fallback (no model). Open the AI app to enable real inference.');
    }
  }, []);

  const navigate = (next: Tab) => {
    void wrapNavigation(() => setTab(next), { kind: 'crossfade' });
  };

  const openYourData = () => {
    if (typeof window === 'undefined') return;
    const shippie = (window as unknown as { shippie?: ShippieRoot }).shippie;
    if (typeof shippie?.openYourData === 'function') shippie.openYourData();
    else window.open('/__shippie/data', '_blank', 'noopener');
  };

  return (
    <div className="app">
      {encryptionNotice ? (
        <div className="banner" role="status">
          {encryptionNotice}
        </div>
      ) : null}

      <main className="app-main">
        {tab === 'write' ? <WriteEntry onSaved={() => setRefreshKey((n) => n + 1)} /> : null}
        {tab === 'browse' ? <Browse refreshKey={refreshKey} /> : null}
        {tab === 'search' ? <Search /> : null}
        {tab === 'recall' ? <Recall /> : null}
        {tab === 'trends' ? <Trends refreshKey={refreshKey} /> : null}
        {tab === 'year' ? <YearInReview refreshKey={refreshKey} /> : null}
      </main>

      <nav className="bottom-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => navigate(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <button type="button" className="your-data-button" onClick={openYourData} aria-label="Your data">
        Your Data
      </button>
    </div>
  );
}
