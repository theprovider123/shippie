/**
 * App shell — pairing → main app with bottom tab nav.
 * Routes are state-driven (no URL routing yet).
 */
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { PairingScreen } from './PairingScreen.tsx';
import { TabNav } from '@/components/TabNav.tsx';
import { PulseFab } from '@/components/PulseFab.tsx';
import { PulseInbox } from '@/components/PulseInbox.tsx';
import { InstallNudge } from '@/components/InstallNudge.tsx';
import { HomePage } from '@/pages/HomePage.tsx';
import { SchedulePage } from '@/pages/SchedulePage.tsx';
import { JournalPage } from '@/pages/JournalPage.tsx';
import { SurprisesPage } from '@/pages/SurprisesPage.tsx';
import { MorePage } from '@/pages/MorePage.tsx';
import { GiftsPage } from '@/pages/GiftsPage.tsx';
import { TodosPage } from '@/pages/TodosPage.tsx';
import { MemoriesPage } from '@/pages/MemoriesPage.tsx';
import { GamesPage } from '@/pages/GamesPage.tsx';
import { GlimpsesPage } from '@/pages/GlimpsesPage.tsx';
import { AfterHoursPage } from '@/pages/AfterHoursPage.tsx';
import { bindCoupleDoc } from '@/sync/couple-doc.ts';
import {
  loadPairing,
  type Pairing,
  roomIdFor,
  savePairing,
} from '@/sync/pairing.ts';
import {
  partnerOf,
  readCoupleMeta,
  setProfileName,
} from '@/features/couple/couple-state.ts';
import { readSurprises } from '@/features/surprises/surprises-state.ts';
import { isSurpriseUnlocked } from '@/lib/surprises.ts';
import { isAnniversaryToday } from '@/lib/anniversary.ts';
import { usePresenceHeartbeat } from '@/features/presence/usePresenceHeartbeat.ts';
import { readImportFragment } from '@shippie/share';
import { ImportCard as MemoryImportCard } from '@/share/ImportCard.tsx';
import {
  checkMemoryImport,
  type MemoryImportCheck,
} from '@/share/memory-share.ts';
import { useYjs } from '@/sync/useYjs.ts';
import type { Route } from '@/router.ts';
import { TOP_LEVEL_ROUTES } from '@/router.ts';

export function App() {
  const [pairing, setPairingState] = useState<Pairing | null>(() => loadPairing());
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [synced, setSynced] = useState(false);
  const [route, setRoute] = useState<Route>('home');

  useEffect(() => {
    if (!pairing) {
      setDoc(null);
      setSynced(false);
      return;
    }
    const bound = bindCoupleDoc(roomIdFor(pairing.coupleCode), pairing.coupleCode);
    setDoc(bound.doc);
    setSynced(false);
    void bound.whenSynced.then(() => setSynced(true));
    return () => {
      bound.destroy();
    };
  }, [pairing]);

  if (!pairing) {
    return (
      <PairingScreen
        onPaired={(p) => {
          savePairing(p);
          setPairingState(p);
        }}
      />
    );
  }

  if (!doc || !synced) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          opening your space…
        </p>
      </main>
    );
  }

  return (
    <Bound
      pairing={pairing}
      doc={doc}
      route={route}
      onRoute={setRoute}
      onUnpair={() => setPairingState(null)}
    />
  );
}

function Bound({
  pairing,
  doc,
  route,
  onRoute,
  onUnpair,
}: {
  pairing: Pairing;
  doc: Y.Doc;
  route: Route;
  onRoute: (r: Route) => void;
  onUnpair: () => void;
}) {
  // Heartbeat presence — pings every 5s while visible.
  usePresenceHeartbeat(doc, pairing.deviceId);

  // Detect a #shippie-import=… fragment carrying a single memory shared
  // from outside this couple-doc. Verifies the signature, previews the
  // memory, and on accept saves it into this couple's timeline as a
  // new row authored by this device — original sender is preserved in
  // the content body via the provenance footer.
  const [pendingImport, setPendingImport] = useState<
    Extract<MemoryImportCheck, { ok: true }> | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      const blob = await readImportFragment(window.location.href);
      if (!blob || cancelled) return;
      const check = await checkMemoryImport(blob);
      if (!check.ok) return;
      if (!cancelled) setPendingImport(check);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Self-introduce on first run if name not set yet
  const meta = useYjs(doc, readCoupleMeta);
  useEffect(() => {
    if (!meta.profiles[pairing.deviceId]) {
      // Default to "me" so the partner sees something other than the device id
      setProfileName(doc, pairing.deviceId, 'me');
    }
  }, [doc, pairing.deviceId, meta.profiles]);

  // Toggle the love-coral palette on anniversary day.
  useEffect(() => {
    const root = document.documentElement;
    if (isAnniversaryToday(meta.anniversary_date)) {
      root.setAttribute('data-anniversary', 'true');
    } else {
      root.removeAttribute('data-anniversary');
    }
    return () => root.removeAttribute('data-anniversary');
  }, [meta.anniversary_date]);

  const partner = partnerOf(meta, pairing.deviceId);
  const surprises = useYjs(doc, readSurprises);
  const unread = surprises.filter(
    (s) =>
      s.author_device !== pairing.deviceId &&
      !s.read_at &&
      isSurpriseUnlocked(s, meta.next_visit_date),
  ).length;

  const tabActive: Route = TOP_LEVEL_ROUTES.includes(route) ? route : 'more';

  return (
    <div className="min-h-dvh flex flex-col pb-24">
      <main className="flex-1 mx-auto w-full max-w-md">
        {route === 'home' && (
          <HomePage doc={doc} myDeviceId={pairing.deviceId} onNavigate={onRoute} />
        )}
        {route === 'schedule' && <SchedulePage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'journal' && <JournalPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'surprises' && <SurprisesPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'more' && (
          <MorePage
            doc={doc}
            myDeviceId={pairing.deviceId}
            pairing={pairing}
            onNavigate={onRoute}
            onUnpair={onUnpair}
          />
        )}
        {route === 'gifts' && <GiftsPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'todos' && <TodosPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'memories' && <MemoriesPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'glimpses' && <GlimpsesPage doc={doc} myDeviceId={pairing.deviceId} />}
        {route === 'games' && (
          <GamesPage doc={doc} myDeviceId={pairing.deviceId} onNavigate={onRoute} />
        )}
        {route === 'after-hours' && (
          <AfterHoursPage doc={doc} myDeviceId={pairing.deviceId} onNavigate={onRoute} />
        )}
      </main>

      <PulseInbox doc={doc} myDeviceId={pairing.deviceId} />
      <PulseFab doc={doc} myDeviceId={pairing.deviceId} />
      <InstallNudge />

      <TabNav
        current={tabActive}
        onChange={onRoute}
        partnerName={partner?.display_name ?? null}
        unreadCount={unread}
      />

      {pendingImport ? (
        <MemoryImportCard
          doc={doc}
          myDeviceId={pairing.deviceId}
          check={pendingImport}
          onImported={() => {
            setPendingImport(null);
            onRoute('memories');
          }}
          onDiscard={() => setPendingImport(null)}
        />
      ) : null}
    </div>
  );
}
