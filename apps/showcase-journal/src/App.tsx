import { useEffect, useState } from 'react';
import { WriteEntry } from './pages/WriteEntry.tsx';
import { QuickEntry } from './pages/QuickEntry.tsx';
import { Browse } from './pages/Browse.tsx';
import { Search } from './pages/Search.tsx';
import { Trends } from './pages/Trends.tsx';
import { YearInReview } from './pages/YearInReview.tsx';
import { Recall } from './pages/Recall.tsx';
import { isLocalAiAvailable } from './ai/runtime.ts';
import { readImportFragment } from '@shippie/share';
import { ImportCard } from './share/ImportCard.tsx';
import { checkJournalImport, type JournalImportCheck } from './share/journal-share.ts';
import { wrapNavigation } from '@shippie/sdk/wrapper';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

const shippie = createShippieIframeSdk({ appId: 'app_journal' });

type Tab = 'quick' | 'write' | 'browse' | 'search' | 'recall' | 'trends' | 'year';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quick', label: 'Quick' },
  { id: 'write', label: 'Write' },
  { id: 'browse', label: 'Browse' },
  { id: 'search', label: 'Search' },
  { id: 'recall', label: 'Recall' },
  { id: 'trends', label: 'Trends' },
  { id: 'year', label: 'Year' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('quick');
  const [refreshKey, setRefreshKey] = useState(0);
  const [encryptionNotice, setEncryptionNotice] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<
    Extract<JournalImportCheck, { ok: true }> | null
  >(null);

  useEffect(() => {
    // The SQLCipher status is reported by the runtime via `shippie.local.db.usage()` —
    // when the runtime isn't present, we surface a transparent fallback notice.
    if (!isLocalAiAvailable()) {
      setEncryptionNotice('Running in dev mode: AI uses a local fallback (no model). Open the AI app to enable real inference.');
    }
  }, []);

  // Detect a #shippie-import=… fragment carrying a journal entry. Pure
  // client-side — fragments don't reach servers. The card verifies the
  // signature, previews the entry, then either imports (creates a fresh
  // entry with a provenance footer) or discards. Either path clears the
  // fragment so a reload doesn't re-prompt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      const blob = await readImportFragment(window.location.href);
      if (!blob || cancelled) return;
      const check = await checkJournalImport(blob);
      if (!check.ok) return; // wrong type — silently ignore
      if (!cancelled) setPendingImport(check);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = (next: Tab) => {
    void wrapNavigation(() => setTab(next), { kind: 'crossfade' });
  };

  const openYourData = () => {
    shippie.openYourData({ appSlug: 'journal' });
  };

  return (
    <div className="app">
      {encryptionNotice ? (
        <div className="banner" role="status">
          {encryptionNotice}
        </div>
      ) : null}

      <main className="app-main">
        {tab === 'quick' ? <QuickEntry onSaved={() => setRefreshKey((n) => n + 1)} /> : null}
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

      {pendingImport ? (
        <ImportCard
          check={pendingImport}
          onImported={() => {
            setPendingImport(null);
            setRefreshKey((n) => n + 1);
            navigate('browse');
          }}
          onDiscard={() => setPendingImport(null)}
        />
      ) : null}
    </div>
  );
}
