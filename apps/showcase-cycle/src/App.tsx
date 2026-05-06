/**
 * Cycle — root component.
 *
 * Wiring:
 *   - Local DB resolved once at mount; passed down to pages.
 *   - Iframe SDK created with the shared appId so intents flow through
 *     the platform's shippie.intent bus.
 *   - Provides:
 *       * cycle-logged on every save.
 *       * cycle-window-predicted whenever the prediction range changes
 *         (rate-limited to once per save, not per render).
 *   - Consumes:
 *       * mood-logged: when a recent mood reading is "low" (<=2 on a
 *         5-scale) within 5 days of the predicted period, surface a
 *         soft "PMS-pattern" hint with an explicit "this might be a
 *         coincidence" caveat per the voice doc.
 *
 * Solo invariant: when prefs.share_with_partner is false, the partner
 * mesh module is never imported lazily and no relay socket opens. The
 * dynamic import keeps Yjs out of the bundle for solo-only users.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { resolveLocalDb } from './db/runtime.ts';
import { Today } from './pages/Today.tsx';
import { History } from './pages/History.tsx';
import { Predict } from './pages/Predict.tsx';
import { Settings } from './pages/Settings.tsx';
import { PrintView } from './pages/PrintView.tsx';
import {
  cycleDayFor,
  daysBetween,
  getActiveCycle,
  getDayByDate,
  isoDate,
  listCycles,
  loadPrefs,
} from './db/queries.ts';
import { fertileWindowFor, predictNextCycle } from './lib/predict.ts';
import type { PartnerProjection } from './sync/partner-doc.ts';

type Route = 'today' | 'history' | 'predict' | 'settings' | 'print';

const TABS: Array<{ id: Route; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'predict', label: 'Predict' },
  { id: 'settings', label: 'Settings' },
  { id: 'print', label: 'Print' },
];

const shippie = createShippieIframeSdk({ appId: 'app_cycle' });

interface PartnerHandle {
  destroy: () => void;
  publish: (projection: PartnerProjection) => void;
}

export function App() {
  const db = useMemo(() => resolveLocalDb(), []);
  const [route, setRoute] = useState<Route>('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const [moodHint, setMoodHint] = useState<string | null>(null);
  const partnerRef = useRef<PartnerHandle | null>(null);
  const lastPredictedRef = useRef<string>('');

  const bumpRefresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // Provide cycle-logged on every save. We pass an entry payload so
  // downstream consumers (Body Metrics, Mood) can correlate.
  const onLogged = useCallback(
    (entry: {
      cycle_id: string;
      date: string;
      flow: number | null;
      symptoms: string[];
      note: string | null;
    }) => {
      shippie.intent.broadcast('cycle-logged', [
        {
          source: 'cycle',
          ...entry,
        },
      ]);
    },
    [],
  );

  // Recompute the prediction once per refreshKey bump. Broadcast
  // cycle-window-predicted only when the predicted-start range
  // actually changes, so we don't spam the bus on every re-render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cycles = await listCycles(db);
      if (cancelled) return;
      const prediction = predictNextCycle(cycles);
      if (!prediction) return;
      const sig = `${prediction.range[0]}|${prediction.range[1]}|${prediction.confidence}`;
      if (sig === lastPredictedRef.current) return;
      lastPredictedRef.current = sig;
      shippie.intent.broadcast('cycle-window-predicted', [
        {
          predicted_start: prediction.predictedStart,
          range: prediction.range,
          confidence: prediction.confidence,
          mean_days: prediction.mean,
          stddev_days: prediction.stddev,
          sample_size: prediction.sampleSize,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refreshKey]);

  // Consume mood-logged. If recent mood is low (<=2/5) and we're within
  // ~5 days of the predicted period start, surface a soft hint. Voice
  // doc: explicit "this might be a coincidence" caveat.
  useEffect(() => {
    shippie.requestIntent('mood-logged');
    shippie.requestIntent('body-metrics-logged');
    const offMood = shippie.intent.subscribe('mood-logged', async ({ rows }) => {
      const lows = rows
        .map((r) => r as { value?: number; mood?: number; score?: number; createdAt?: number })
        .filter((r) => {
          const v = r.value ?? r.mood ?? r.score;
          return typeof v === 'number' && v <= 2;
        });
      if (lows.length === 0) return;
      const cycles = await listCycles(db);
      const prediction = predictNextCycle(cycles);
      if (!prediction) return;
      const today = isoDate();
      const days = daysBetween(today, prediction.predictedStart);
      if (days >= 0 && days <= 5) {
        setMoodHint(
          `Mood read low ${lows.length === 1 ? 'once' : `${lows.length} times`} recently — predicted period in about ${days} ${days === 1 ? 'day' : 'days'}.`,
        );
      }
    });
    return () => offMood();
  }, [db]);

  // Partner mesh — STRUCTURALLY off when share_with_partner is false.
  // The dynamic import means Yjs never loads in solo mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await loadPrefs(db);
      if (cancelled) return;
      // Tear down whenever prefs change; rebuild only if needed.
      if (partnerRef.current) {
        partnerRef.current.destroy();
        partnerRef.current = null;
      }
      if (!prefs.share_with_partner || !prefs.partner_pair_code) return;
      try {
        const [Y, { roomIdFor }, { bindRelayProvider }, { publishPartnerView }] = await Promise.all([
          import('yjs'),
          import('./sync/crypto.ts'),
          import('./sync/relay-provider.ts'),
          import('./sync/partner-doc.ts'),
        ]);
        if (cancelled) return;
        const doc = new Y.Doc();
        const roomId = roomIdFor(prefs.partner_pair_code);
        const relay = bindRelayProvider({ doc, roomId, pairCode: prefs.partner_pair_code });
        partnerRef.current = {
          destroy: () => {
            relay.destroy();
            doc.destroy();
          },
          publish: (projection) => publishPartnerView(doc, projection, prefs.partner_seen_fields),
        };
        // Push the current projection on bind so the partner gets a fresh view.
        const projection = await buildProjection(db);
        partnerRef.current.publish(projection);
      } catch (err) {
        console.warn('[cycle] partner mesh failed to bind', err);
      }
    })();
    return () => {
      cancelled = true;
      if (partnerRef.current) {
        partnerRef.current.destroy();
        partnerRef.current = null;
      }
    };
  }, [db, refreshKey]);

  // Republish the projection on every refresh — covers the
  // log-today-then-share case without needing a separate hook.
  useEffect(() => {
    if (!partnerRef.current) return;
    void buildProjection(db).then((projection) => {
      partnerRef.current?.publish(projection);
    });
  }, [db, refreshKey]);

  return (
    <main className="cycle-app" data-route={route}>
      <header className="app-bar">
        <h1>Cycle</h1>
        <button
          type="button"
          className="data-btn"
          onClick={() => shippie.openYourData({ appSlug: 'cycle' })}
        >
          Your Data
        </button>
      </header>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === route ? 'tab active' : 'tab'}
            onClick={() => setRoute(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="page-frame">
        {route === 'today' ? (
          <Today
            db={db}
            refreshKey={refreshKey}
            onChange={bumpRefresh}
            onLogged={onLogged}
            onMoodCorrelation={setMoodHint}
            moodCorrelationHint={moodHint}
          />
        ) : null}
        {route === 'history' ? <History db={db} refreshKey={refreshKey} /> : null}
        {route === 'predict' ? <Predict db={db} refreshKey={refreshKey} /> : null}
        {route === 'settings' ? <Settings db={db} onChange={bumpRefresh} /> : null}
        {route === 'print' ? <PrintView db={db} refreshKey={refreshKey} /> : null}
      </div>
    </main>
  );
}

async function buildProjection(db: ReturnType<typeof resolveLocalDb>): Promise<PartnerProjection> {
  const today = isoDate();
  const [active, cycles, day] = await Promise.all([
    getActiveCycle(db),
    listCycles(db),
    getDayByDate(db, today),
  ]);
  const dayNum = active ? await cycleDayFor(db, today) : null;
  const prediction = predictNextCycle(cycles);
  const fertile = fertileWindowFor(prediction);
  return {
    cycle_day: dayNum ?? undefined,
    fertile_window: fertile ? { start: fertile.range[0], end: fertile.range[1] } : undefined,
    predicted_period: prediction
      ? { start: prediction.range[0], end: prediction.range[1] }
      : undefined,
    flow_today: typeof day?.flow === 'number' ? day.flow : undefined,
  };
}
