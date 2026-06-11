import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { IntentToastHost, type IntentSubscription } from '@shippie/showcase-kit-v2';
import { MATCHERS } from './IntentMatchers';
import { loadState, debouncedSave } from './lib/store';
import { maybeGenerateLetter } from './lib/letter';
import type { ChiwitState, AmbientEvent, MoodWord } from './lib/store';
import { Today } from './screens/Today';
import { Garden } from './screens/Garden';
import { Letter } from './screens/Letter';
import { DataScreen } from './screens/DataScreen';
import { NavBar } from './components/NavBar';
import { createChiwitBackupStore } from './backup-store';

export type Screen = 'today' | 'garden' | 'letter' | 'data';

const shippie = createShippieIframeSdk({ appId: 'app_chiwit' });

// Adapt shippie.intent.subscribe (per-kind) to the IntentSubscription shape
// expected by IntentToastHost. IntentBroadcast has `intent` + `rows`;
// IntentLike has `kind`. We register one listener per matched kind.
const MATCHED_KINDS = MATCHERS.map((m) => m.kind);

const intentSource: IntentSubscription = {
  subscribe(cb) {
    const unsubs = MATCHED_KINDS.map((kind) =>
      shippie.intent.subscribe(kind, (broadcast) => {
        cb({
          kind: broadcast.intent,
          payload: (broadcast.rows?.[0] as Record<string, unknown>) ?? {},
        });
      })
    );
    return () => unsubs.forEach((u) => u());
  },
};

export function App() {
  const [state, setState] = useState<ChiwitState>(() => {
    const loaded = loadState();
    return maybeGenerateLetter(loaded);
  });

  // Debounced persistence
  useEffect(() => {
    debouncedSave(state);
  }, [state]);

  // Screen navigation
  const [screen, setScreen] = useState<Screen>('today');
  const nav = useMemo(
    () =>
      createLocalNavigation<Screen>(
        'today',
        (next) => setScreen(next),
      ),
    [],
  );
  useEffect(() => () => nav.destroy(), [nav]);

  // Subscribe to matched intents and fold into ambient state
  useEffect(() => {
    const unsubs = MATCHED_KINDS.map((kind) =>
      shippie.intent.subscribe(kind, (broadcast) => {
        const event: AmbientEvent = {
          kind: broadcast.intent,
          sourceApp: broadcast.providerAppId ?? 'unknown',
          at: Date.now(),
          payload: (broadcast.rows?.[0] as Record<string, unknown>) ?? {},
        };
        setState((prev) => ({ ...prev, ambient: [...prev.ambient, event] }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Mood broadcast
  function broadcastMood(word: MoodWord, note?: string) {
    const RANK: Record<MoodWord, number> = { heavy: 1, low: 2, okay: 3, light: 4, bright: 5 };
    shippie.intent.broadcast('mood-logged', [{
      score: RANK[word],
      label: word,
      note,
      logged_at: new Date().toISOString(),
    }]);
  }

  function broadcastHydration() {
    shippie.intent.broadcast('hydration-logged', [{ amountMl: 250, logged_at: new Date().toISOString() }]);
  }

  function broadcastSleep(hours: number) {
    shippie.intent.broadcast('sleep-logged', [{ hours, logged_at: new Date().toISOString() }]);
  }

  function broadcastMovement() {
    shippie.intent.broadcast('workout-completed', [{ logged_at: new Date().toISOString() }]);
  }

  const backupStore = useMemo(() => createChiwitBackupStore(), []);

  return (
    <div className="chiwit-app">
      <IntentToastHost source={intentSource} matchers={MATCHERS} position="top" />
      {screen === 'today' && (
        <Today
          state={state}
          setState={setState}
          onBroadcastMood={broadcastMood}
          onBroadcastHydration={broadcastHydration}
          onBroadcastSleep={broadcastSleep}
          onBroadcastMovement={broadcastMovement}
          shippie={shippie}
        />
      )}
      {screen === 'garden' && <Garden state={state} setState={setState} />}
      {screen === 'letter' && <Letter state={state} setState={setState} />}
      {screen === 'data' && <DataScreen state={state} setState={setState} backupStore={backupStore} />}
      <NavBar current={screen} onChange={(s) => { void nav.navigate(s); setScreen(s); }} />
    </div>
  );
}
