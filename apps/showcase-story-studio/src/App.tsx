import { useEffect, useState } from 'react';
import type { ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import { resolveLocalDb } from './db/runtime.ts';
import { resolveLocalFiles } from './files/runtime.ts';
import { ensureSchema } from './db/queries.ts';
import { type Mode, type Route } from './router.ts';
import {
  loadPairings,
  savePairings,
  loadSettings,
  type FamilyPairing,
} from './sync/pairing.ts';
import { SetupPage } from './pages/Setup.tsx';
import { KidHome } from './pages/KidHome.tsx';
import { StudioPage } from './pages/Studio.tsx';
import { ReaderPage } from './pages/Reader.tsx';
import { ParentHome } from './pages/ParentHome.tsx';
import { SharePage } from './pages/Share.tsx';
import { PairingPage } from './pages/Pairing.tsx';

export function App() {
  const [db, setDb] = useState<ShippieLocalDb | null>(null);
  const [files, setFiles] = useState<ShippieLocalFiles | null>(null);
  const [kidName, setKidName] = useState<string>(() => loadSettings().kidName);
  const [pairings, setPairings] = useState<FamilyPairing[]>(() => loadPairings());
  const [mode, setMode] = useState<Mode>('parent');
  const [route, setRoute] = useState<Route>('parent-home');
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [d, f] = await Promise.all([resolveLocalDb(), resolveLocalFiles()]);
      await ensureSchema(d);
      setDb(d);
      setFiles(f);
    })();
  }, []);

  if (!kidName) {
    return (
      <SetupPage
        onDone={(name) => {
          setKidName(name);
          setMode('kid');
          setRoute('kid-home');
        }}
      />
    );
  }

  if (!db || !files) {
    return <p className="ss-empty">Loading…</p>;
  }

  function updatePairings(next: FamilyPairing[]) {
    savePairings(next);
    setPairings(next);
  }

  // Kid-mode flow
  if (mode === 'kid') {
    return (
      <div className="ss-app ss-mode-kid">
        {route === 'kid-home' && (
          <KidHome
            db={db}
            kidName={kidName}
            onNew={() => { setOpenStoryId(null); setRoute('studio'); }}
            onOpen={(id) => { setOpenStoryId(id); setRoute('reader'); }}
          />
        )}
        {route === 'studio' && (
          <StudioPage
            db={db}
            files={files}
            kidName={kidName}
            storyId={openStoryId}
            onDone={() => { setRoute('kid-home'); setOpenStoryId(null); }}
          />
        )}
        {route === 'reader' && openStoryId && (
          <ReaderPage
            db={db}
            files={files}
            storyId={openStoryId}
            onBack={() => setRoute('kid-home')}
          />
        )}

        <button
          type="button"
          className="ss-mode-switch"
          onClick={() => { setMode('parent'); setRoute('parent-home'); }}
          aria-label="Switch to parent view"
        >
          parent
        </button>
      </div>
    );
  }

  // Parent-mode flow
  return (
    <div className="ss-app ss-mode-parent">
      {route === 'parent-home' && (
        <ParentHome
          db={db}
          onOpen={(id) => { setOpenStoryId(id); setRoute('reader'); }}
          onShare={(id) => { setOpenStoryId(id); setRoute('share'); }}
          onPair={() => setRoute('pairing')}
          onSwitchToKid={() => { setMode('kid'); setRoute('kid-home'); }}
        />
      )}
      {route === 'reader' && openStoryId && (
        <ReaderPage
          db={db}
          files={files}
          storyId={openStoryId}
          onBack={() => setRoute('parent-home')}
        />
      )}
      {route === 'share' && openStoryId && (
        <SharePage
          db={db}
          files={files}
          storyId={openStoryId}
          pairings={pairings}
          onDone={() => setRoute('parent-home')}
        />
      )}
      {route === 'pairing' && (
        <PairingPage
          pairings={pairings}
          onChange={updatePairings}
          onBack={() => setRoute('parent-home')}
        />
      )}
    </div>
  );
}
