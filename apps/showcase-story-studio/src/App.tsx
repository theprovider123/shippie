import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
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

interface Screen {
  mode: Mode;
  route: Route;
  storyId: string | null;
}

function sameScreen(a: Screen, b: Screen): boolean {
  return a.mode === b.mode && a.route === b.route && a.storyId === b.storyId;
}

export function App() {
  const [db, setDb] = useState<ShippieLocalDb | null>(null);
  const [files, setFiles] = useState<ShippieLocalFiles | null>(null);
  const [kidName, setKidName] = useState<string>(() => loadSettings().kidName);
  const [pairings, setPairings] = useState<FamilyPairing[]>(() => loadPairings());
  const [mode, setMode] = useState<Mode>('parent');
  const [route, setRoute] = useState<Route>('parent-home');
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Screen>(
        { mode: 'parent', route: 'parent-home', storyId: null },
        (next) => {
          setMode(next.mode);
          setRoute(next.route);
          setOpenStoryId(next.storyId);
        },
        { isEqual: sameScreen },
      ),
    [],
  );

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Screen, kind: 'crossfade' | 'rise' = 'crossfade'): void {
    void localNavigation.navigate(next, { kind });
  }

  function closeTo(fallback: Screen): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

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
          void localNavigation.replace(
            { mode: 'kid', route: 'kid-home', storyId: null },
            { kind: 'crossfade' },
          );
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
            onNew={() => navigate({ mode: 'kid', route: 'studio', storyId: null }, 'rise')}
            onOpen={(id) => navigate({ mode: 'kid', route: 'reader', storyId: id }, 'rise')}
          />
        )}
        {route === 'studio' && (
          <StudioPage
            db={db}
            files={files}
            kidName={kidName}
            storyId={openStoryId}
            onDone={() => closeTo({ mode: 'kid', route: 'kid-home', storyId: null })}
          />
        )}
        {route === 'reader' && openStoryId && (
          <ReaderPage
            db={db}
            files={files}
            storyId={openStoryId}
            onBack={() => closeTo({ mode: 'kid', route: 'kid-home', storyId: null })}
          />
        )}

        <button
          type="button"
          className="ss-mode-switch"
          onClick={() => navigate({ mode: 'parent', route: 'parent-home', storyId: null })}
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
          onOpen={(id) => navigate({ mode: 'parent', route: 'reader', storyId: id }, 'rise')}
          onShare={(id) => navigate({ mode: 'parent', route: 'share', storyId: id }, 'rise')}
          onPair={() => navigate({ mode: 'parent', route: 'pairing', storyId: null }, 'rise')}
          onSwitchToKid={() => navigate({ mode: 'kid', route: 'kid-home', storyId: null })}
        />
      )}
      {route === 'reader' && openStoryId && (
        <ReaderPage
          db={db}
          files={files}
          storyId={openStoryId}
          onBack={() => closeTo({ mode: 'parent', route: 'parent-home', storyId: null })}
        />
      )}
      {route === 'share' && openStoryId && (
        <SharePage
          db={db}
          files={files}
          storyId={openStoryId}
          pairings={pairings}
          onDone={() => closeTo({ mode: 'parent', route: 'parent-home', storyId: null })}
        />
      )}
      {route === 'pairing' && (
        <PairingPage
          pairings={pairings}
          onChange={updatePairings}
          onBack={() => closeTo({ mode: 'parent', route: 'parent-home', storyId: null })}
        />
      )}
    </div>
  );
}
