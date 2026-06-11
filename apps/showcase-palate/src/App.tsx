// palate. — App root
// Single debounced blob, createLocalNavigation, 1s global tick, intent wires.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';

import { load, save, newId } from './lib/store.ts';
import type { PalateState, Timer, Ferment, Formula, Bake, KitchenNote } from './lib/types.ts';
import { remainingSeconds, q10Remaining } from './lib/engine.ts';

import { Rail } from './screens/Rail.tsx';
import { Dial, type DialState } from './screens/Dial.tsx';
import { Glance, COUNTRY_LOAF_WORKFLOW } from './screens/Glance.tsx';
import { Probe } from './screens/Probe.tsx';
import { Scale } from './screens/Scale.tsx';
import { More } from './screens/More.tsx';
import { FermentDetail } from './screens/FermentDetail.tsx';

export type Screen = 'rail' | 'dial' | 'glance' | 'probe' | 'scale' | 'more';
type NavState = { screen: Screen; fermentId?: string };

const shippie = createShippieIframeSdk({ appId: 'app_palate' });

// ─── Crossed-wifi icon (SVG inline) ──────────────────────────
function OfflineIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 3 }}>
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="currentColor" />
      <path d="M5.5 9.5C6.4 8.6 7.15 8.1 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 7C4.6 5.6 6.2 5 8 5c.5 0 1 .05 1.5.15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [store, setStore] = useState<PalateState>(() => load());
  const [now, setNow] = useState(() => Date.now());
  const [screen, setScreen] = useState<Screen>(() => {
    // Support test harness init via window.__PALATE_INIT_SCREEN
    const init = typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__PALATE_INIT_SCREEN;
    if (init && ['rail','dial','glance','probe','scale','more'].includes(init as string)) return init as Screen;
    return 'rail';
  });
  const [fermentDetailId, setFermentDetailId] = useState<string | null>(null);
  const [photoWarningId, setPhotoWarningId] = useState<string | null>(null);

  // 1s global tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // createLocalNavigation wiring
  const nav = useMemo(
    () =>
      createLocalNavigation<NavState>(
        { screen: 'rail' },
        (next) => {
          setScreen(next.screen);
          setFermentDetailId(next.fermentId ?? null);
        },
        { isEqual: (a, b) => a.screen === b.screen && a.fermentId === b.fermentId },
      ),
    [],
  );
  useEffect(() => () => nav.destroy(), [nav]);

  // Debounced save
  useEffect(() => { save(store); }, [store]);

  // Watch for timer completions → broadcast intent + check ferments
  const prevRunningRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nowRunning = new Set(
      store.timers.filter((t) => t.status === 'running').map((t) => t.id)
    );
    // Detect done timers this tick
    for (const t of store.timers) {
      if (t.status === 'running' && remainingSeconds(t, now) <= 0) {
        // Mark done
        update((s) => ({
          ...s,
          timers: s.timers.map((x) => x.id === t.id ? { ...x, status: 'done' } : x),
        }));
        try {
          void shippie.feel.texture('milestone');
        } catch { /* ignore */ }
      }
    }

    // Check ferment readiness → dough-ready intent
    for (const f of store.ferments) {
      if (f.status !== 'active') continue;
      const elapsed_s = (now - f.started_at) / 1000;
      const rem = f.dough_temp_c != null
        ? q10Remaining(f.target_duration_s, elapsed_s, f.dough_temp_c)
        : Math.max(0, f.target_duration_s - elapsed_s);
      if (rem <= 0) {
        update((s) => ({
          ...s,
          ferments: s.ferments.map((x) => x.id === f.id ? { ...x, status: 'done' } : x),
        }));
        try {
          void shippie.intent.broadcast('dough-ready', [{ id: f.id, name: f.name }]);
        } catch { /* ignore */ }
      }
    }

    prevRunningRef.current = nowRunning;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Intent subscriptions — consume pantry-inventory, shopping-list hints
  useEffect(() => {
    const unsub1 = shippie.intent.subscribe('pantry-inventory', (_b) => {
      // Surface quietly in Scale/More — stored as hint for now
    });
    const unsub2 = shippie.intent.subscribe('shopping-list', (_b) => {
      // Acknowledge incoming shopping list items
    });
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  function update(fn: (s: PalateState) => PalateState) {
    setStore((s) => fn(s));
  }

  // ─── Navigation helpers ───────────────────────────────────
  function goScreen(s: Screen) {
    setScreen(s);
    void nav.navigate({ screen: s }, { kind: 'crossfade' });
  }

  // ─── Timer mutations ──────────────────────────────────────
  function addTimer(label: string, duration_s: number, context?: string) {
    const t: Timer = {
      id: newId(),
      label,
      context,
      duration_s,
      status: 'idle',
      colour: context === 'oven' ? 'red' : 'green',
      created_at: Date.now(),
    };
    update((s) => ({ ...s, timers: [...s.timers, t] }));
  }

  function extendTimer(id: string) {
    update((s) => ({
      ...s,
      timers: s.timers.map((t) => {
        if (t.id !== id) return t;
        if (t.status === 'running') {
          return { ...t, duration_s: t.duration_s + 60 };
        }
        if (t.status === 'paused') {
          return { ...t, duration_s: t.duration_s + 60 };
        }
        return t;
      }),
    }));
  }

  function clearTimer(id: string) {
    update((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }));
  }

  function startTimer(id: string) {
    const nowMs = Date.now();
    update((s) => ({
      ...s,
      timers: s.timers.map((t) => {
        if (t.id !== id || t.status !== 'idle') return t;
        return { ...t, status: 'running', started_at: nowMs, elapsed_before_pause_s: 0 };
      }),
    }));
  }

  // ─── Dial mutations ───────────────────────────────────────
  function handleDialWind(minutes: number) {
    update((s) => ({
      ...s,
      dial: { ...s.dial, minutes, status: 'idle', started_at: undefined, duration_s: undefined },
    }));
  }

  function handleDialStart() {
    const nowMs = Date.now();
    const duration_s = Math.round(store.dial.minutes * 60);
    update((s) => ({
      ...s,
      dial: { ...s.dial, status: 'running', started_at: nowMs, duration_s },
    }));
    // Also add a rail ticket
    addTimer(`Dial`, duration_s, undefined);
  }

  function handleDialStop() {
    update((s) => ({
      ...s,
      dial: { ...s.dial, status: 'idle' },
    }));
  }

  function handleDialReset() {
    update((s) => ({
      ...s,
      dial: { ...s.dial, status: 'idle', started_at: undefined, duration_s: undefined },
    }));
  }

  // ─── Glance mutations ─────────────────────────────────────
  function handleGlanceAdvance(nextIndex: number) {
    update((s) => ({ ...s, glance: { ...s.glance, stepIndex: nextIndex } }));
  }

  function handleGlanceComplete() {
    try {
      void shippie.intent.broadcast('cooked-meal', [{ meal_name: 'Country Loaf', cooked_at: new Date().toISOString() }]);
    } catch { /* ignore */ }
    // Also clear the cooking-now intent by completing
    update((s) => ({ ...s, glance: { ...s.glance, stepIndex: 0 } }));
  }

  // On entering glance, broadcast cooking-now
  useEffect(() => {
    if (screen === 'glance') {
      try {
        void shippie.intent.broadcast('cooking-now', [{ meal: 'Country Loaf' }]);
      } catch { /* ignore */ }
    }
  }, [screen]);

  // ─── Ferment mutations ────────────────────────────────────
  function addFerment(f: Ferment) {
    update((s) => ({ ...s, ferments: [...s.ferments, f] }));
    try {
      void shippie.intent.broadcast('dough-ferment-started', [{ id: f.id, name: f.name, type: f.type }]);
    } catch { /* ignore */ }
  }

  function updateFermentTemp(id: string, dough_temp_c: number) {
    update((s) => ({
      ...s,
      ferments: s.ferments.map((f) => f.id === id ? { ...f, dough_temp_c } : f),
    }));
  }

  function recordFold(id: string) {
    update((s) => ({
      ...s,
      ferments: s.ferments.map((f) =>
        f.id === id ? { ...f, folds: [...(f.folds ?? []), Date.now()] } : f
      ),
    }));
  }

  function recordFeed(id: string) {
    update((s) => ({
      ...s,
      ferments: s.ferments.map((f) => f.id === id ? { ...f, fed_at: Date.now() } : f),
    }));
  }

  function completeFerment(id: string) {
    update((s) => ({
      ...s,
      ferments: s.ferments.map((f) => f.id === id ? { ...f, status: 'done' } : f),
    }));
    setFermentDetailId(null);
    void nav.navigate({ screen: 'rail' }, { kind: 'crossfade' });
  }

  // ─── Scale mutations ──────────────────────────────────────
  function handleTotalChange(g: number) {
    if (!store.formulas.length) return;
    update((s) => ({
      ...s,
      formulas: s.formulas.map((f, i) => i === 0 ? { ...f, total_dough_g: g } : f),
    }));
  }

  function handleFormulaChange(id: string) {
    // No-op for now (single formula active)
  }

  function saveFormula(f: Formula) {
    update((s) => ({
      ...s,
      formulas: s.formulas.map((x) => x.id === f.id ? f : x),
    }));
  }

  // ─── More mutations ───────────────────────────────────────
  function addBake(b: Bake) {
    update((s) => ({ ...s, bakes: [...s.bakes, b] }));
  }

  function handleTonightsNoteChange(content: string) {
    update((s) => ({ ...s, tonightsNote: content }));
  }

  // ─── Render ───────────────────────────────────────────────
  const activeFormula = store.formulas[0];
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1100;

  // Get dial computed state for rendering
  const dialDisplayState: DialState = {
    minutes: store.dial.minutes,
    status: store.dial.status,
    started_at: store.dial.started_at,
    duration_s: store.dial.duration_s,
  };

  // Ferment detail view
  if (fermentDetailId) {
    const ferment = store.ferments.find((f) => f.id === fermentDetailId);
    if (ferment) {
      return (
        <div className="palate-app">
          <FermentDetail
            ferment={ferment}
            now={now}
            onTempUpdate={updateFermentTemp}
            onFold={recordFold}
            onFeed={recordFeed}
            onComplete={completeFerment}
            onBack={() => { setFermentDetailId(null); void nav.navigate({ screen: 'rail' }); }}
          />
        </div>
      );
    }
  }

  if (isDesktop) {
    return <DesktopCounter
      store={store}
      now={now}
      dialState={dialDisplayState}
      screen={screen}
      shippie={shippie}
      onScreenChange={goScreen}
      onDialWind={handleDialWind}
      onDialStart={handleDialStart}
      onDialStop={handleDialStop}
      onDialReset={handleDialReset}
      onAddTimer={addTimer}
      onExtendTimer={extendTimer}
      onClearTimer={clearTimer}
      onStartTimer={startTimer}
      onProbeTemp={(c) => update((s) => ({ ...s, probe: { ...s.probe, current_c: c } }))}
      onProbeCut={(name) => update((s) => ({ ...s, probe: { ...s.probe, cut: name } }))}
      onProbeUnit={() => update((s) => ({ ...s, probe: { ...s.probe, unit: s.probe.unit === 'C' ? 'F' : 'C' } }))}
      tonightsNote={store.tonightsNote}
      onTonightsNoteChange={handleTonightsNoteChange}
      onGlanceAdvance={handleGlanceAdvance}
      onGlanceComplete={handleGlanceComplete}
      onTotalChange={handleTotalChange}
      onFormulaChange={handleFormulaChange}
      onSaveFormula={saveFormula}
      onAddBake={addBake}
      onNoteChange={(content) => {
        const note: KitchenNote = { id: newId(), content, created_at: Date.now() };
        update((s) => ({ ...s, notes: [...s.notes, note] }));
      }}
    />;
  }

  const isFullScreen = screen === 'glance' || screen === 'probe';

  return (
    <div className="palate-app">
      {!isFullScreen && (
        <header className="app-header">
          <span className="wordmark">palate.</span>
          <span className="offline-status">
            <OfflineIcon />
            offline · all local
          </span>
        </header>
      )}

      <main className="screen-content">
        {screen === 'rail' && (
          <Rail
            timers={store.timers}
            ferments={store.ferments}
            now={now}
            onAddTimer={addTimer}
            onExtendTimer={extendTimer}
            onClearTimer={clearTimer}
            onStartTimer={startTimer}
          />
        )}
        {screen === 'dial' && (
          <Dial
            dialState={dialDisplayState}
            now={now}
            size={330}
            onWind={handleDialWind}
            onStart={handleDialStart}
            onStop={handleDialStop}
            onReset={handleDialReset}
          />
        )}
        {screen === 'glance' && (
          <Glance
            stepIndex={store.glance.stepIndex}
            workflowId={store.glance.workflowId}
            shippie={shippie}
            onAdvance={handleGlanceAdvance}
            onComplete={handleGlanceComplete}
            onExit={() => goScreen('rail')}
          />
        )}
        {screen === 'probe' && (
          <Probe
            currentC={store.probe.current_c}
            cut={store.probe.cut}
            unit={store.probe.unit}
            onTempChange={(c) => update((s) => ({ ...s, probe: { ...s.probe, current_c: c } }))}
            onCutChange={(name) => update((s) => ({ ...s, probe: { ...s.probe, cut: name, current_c: (store.probe.current_c) } }))}
            onUnitToggle={() => update((s) => ({ ...s, probe: { ...s.probe, unit: s.probe.unit === 'C' ? 'F' : 'C' } }))}
            onExit={() => goScreen('rail')}
          />
        )}
        {screen === 'scale' && activeFormula && (
          <Scale
            formulas={store.formulas}
            activeFormulaId={activeFormula.id}
            totalDoughG={activeFormula.total_dough_g}
            shippie={shippie}
            onTotalChange={handleTotalChange}
            onFormulaChange={handleFormulaChange}
            onSaveFormula={saveFormula}
          />
        )}
        {screen === 'more' && (
          <More
            bakes={store.bakes}
            formulas={store.formulas}
            notes={store.notes}
            tonightsNote={store.tonightsNote}
            onAddBake={addBake}
            onNoteChange={(content) => {
              const note: KitchenNote = { id: newId(), content, created_at: Date.now() };
              update((s) => ({ ...s, notes: [...s.notes, note] }));
            }}
            onTonightsNoteChange={handleTonightsNoteChange}
          />
        )}
      </main>

      {!isFullScreen && (
        <nav className="screen-switcher">
          {(['rail', 'dial', 'glance', 'probe', 'scale', 'more'] as Screen[]).map((s) => (
            <button
              key={s}
              className={`switcher-btn${screen === s ? ' active' : ''}`}
              onClick={() => goScreen(s)}
            >
              {s}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── Desktop Counter layout ───────────────────────────────────

interface DesktopProps {
  store: PalateState;
  now: number;
  dialState: DialState;
  screen: Screen;
  shippie: ReturnType<typeof createShippieIframeSdk>;
  onScreenChange: (s: Screen) => void;
  onDialWind: (m: number) => void;
  onDialStart: () => void;
  onDialStop: () => void;
  onDialReset: () => void;
  onAddTimer: (l: string, d: number, c?: string) => void;
  onExtendTimer: (id: string) => void;
  onClearTimer: (id: string) => void;
  onStartTimer: (id: string) => void;
  onProbeTemp: (c: number) => void;
  onProbeCut: (name: string) => void;
  onProbeUnit: () => void;
  tonightsNote: string;
  onTonightsNoteChange: (s: string) => void;
  onGlanceAdvance: (nextIndex: number) => void;
  onGlanceComplete: () => void;
  onTotalChange: (g: number) => void;
  onFormulaChange: (id: string) => void;
  onSaveFormula: (f: Formula) => void;
  onAddBake: (b: Bake) => void;
  onNoteChange: (content: string) => void;
}

function DesktopCounter({ store, now, dialState, screen, shippie, onScreenChange, onDialWind, onDialStart, onDialStop, onDialReset, onAddTimer, onExtendTimer, onClearTimer, onStartTimer, onProbeTemp, onProbeCut, onProbeUnit, tonightsNote, onTonightsNoteChange, onGlanceAdvance, onGlanceComplete, onTotalChange, onFormulaChange, onSaveFormula, onAddBake, onNoteChange }: DesktopProps) {
  return (
    <div className="palate-desktop">
      <header className="desktop-header">
        <div className="desktop-header-left">
          <img src="/brand/palate-logo.png" alt="palate" className="desktop-logo" />
          <span className="desktop-wordmark">palate.</span>
        </div>
        <span className="offline-status desktop-offline">
          <OfflineIcon />
          offline · all local
        </span>
      </header>

      {/* Top-level switcher for glance/scale on desktop */}
      <nav className="screen-switcher desktop-switcher">
        {(['rail', 'dial', 'glance', 'probe', 'scale', 'more'] as Screen[]).map((s) => (
          <button
            key={s}
            className={`switcher-btn${screen === s ? ' active' : ''}`}
            onClick={() => onScreenChange(s)}
          >
            {s}
          </button>
        ))}
      </nav>

      {/* Full-bleed screens on desktop */}
      {(screen === 'glance' || screen === 'scale' || screen === 'more') ? (
        <div className="desktop-fullbleed">
          {screen === 'glance' && (
            <Glance stepIndex={store.glance.stepIndex} workflowId={store.glance.workflowId} shippie={shippie}
              onAdvance={onGlanceAdvance} onComplete={onGlanceComplete} onExit={() => onScreenChange('rail')} />
          )}
          {screen === 'scale' && store.formulas[0] && (
            <Scale formulas={store.formulas} activeFormulaId={store.formulas[0].id}
              totalDoughG={store.formulas[0].total_dough_g} shippie={shippie}
              onTotalChange={onTotalChange} onFormulaChange={onFormulaChange} onSaveFormula={onSaveFormula} />
          )}
          {screen === 'more' && (
            <More bakes={store.bakes} formulas={store.formulas} notes={store.notes}
              tonightsNote={tonightsNote}
              onAddBake={onAddBake} onNoteChange={onNoteChange} onTonightsNoteChange={onTonightsNoteChange} />
          )}
        </div>
      ) : (
        <div className="desktop-counter-grid">
          {/* Column 1: Rail */}
          <div className="desktop-col">
            <div className="desktop-col-label">the rail</div>
            <Rail timers={store.timers} ferments={store.ferments} now={now}
              onAddTimer={onAddTimer} onExtendTimer={onExtendTimer}
              onClearTimer={onClearTimer} onStartTimer={onStartTimer} />
          </div>

          {/* Column 2: Probe */}
          <div className="desktop-col">
            <div className="desktop-col-label">live probe</div>
            <Probe currentC={store.probe.current_c} cut={store.probe.cut} unit={store.probe.unit}
              compact
              onTempChange={onProbeTemp} onCutChange={onProbeCut} onUnitToggle={onProbeUnit} />
          </div>

          {/* Column 3: Dial + Tonight's Note */}
          <div className="desktop-col">
            <div className="desktop-col-label">the dial</div>
            <Dial dialState={dialState} now={now} size={240}
              compact
              onWind={onDialWind} onStart={onDialStart} onStop={onDialStop} onReset={onDialReset} />
            <div style={{ fontSize: '10.5px', color: 'var(--tertiary)', textAlign: 'center' }}>
              mirrors the phone dial — wind either one
            </div>
            <div className="desktop-col-label" style={{ marginTop: 20 }}>tonight's note</div>
            <div className="tonights-note-card">
              <textarea
                className="note-textarea"
                placeholder="Salt the duck legs tonight for tomorrow. Wind the dial when the milk goes on."
                value={tonightsNote}
                onChange={(e) => onTonightsNoteChange(e.target.value)}
                onBlur={(e) => onTonightsNoteChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
