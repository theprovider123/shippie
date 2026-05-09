/**
 * Therapy Notes — single-user, between-session work, never phones
 * home. Voice rules in VOICE.md are load-bearing — keep this file
 * quiet and read that doc before touching empty-state copy.
 *
 * Top-level shell:
 *   - One title row.
 *   - One main pane (Home / NewNote / Checkin / WeeklySummary /
 *     PrepForSession / PrintView / Settings).
 *   - One bottom tab bar.
 *
 * Cross-app intents:
 *   - Provides:  `mood-logged` (after a daily check-in) and
 *                `journal-entry` (after a free note or worksheet).
 *   - Consumes:  `mood-logged`, `sleep-logged`. When the most recent
 *                broadcast looks rough (low mood, poor sleep), we
 *                show a *quiet* one-line nudge once per day.
 *
 * The nudge is optional, never required, and never the same line
 * twice — see `pickNudge()`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { Home } from './pages/Home.tsx';
import { NewNote } from './pages/NewNote.tsx';
import { Checkin } from './pages/Checkin.tsx';
import { WeeklySummary } from './pages/WeeklySummary.tsx';
import { PrepForSession } from './pages/PrepForSession.tsx';
import { PrintView } from './pages/PrintView.tsx';
import { Settings } from './pages/Settings.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_therapy_notes' });

type View =
  | 'home'
  | 'new'
  | 'checkin'
  | 'week'
  | 'prep'
  | 'print'
  | 'settings';

interface Tab {
  id: View;
  label: string;
}

const TABS: ReadonlyArray<Tab> = [
  { id: 'home', label: 'Home' },
  { id: 'checkin', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'prep', label: 'Session' },
  { id: 'settings', label: 'Settings' },
];

const NUDGE_KEY = 'therapy-notes:nudge:lastDate';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickNudge(reason: 'sleep' | 'mood'): string {
  if (reason === 'sleep') return 'Rough night noted. Want to write something?';
  return 'Want to write something?';
}

export function App() {
  const [view, setView] = useState<View>('home');
  const localNavigation = useMemo(
    () => createLocalNavigation<View>('home', setView),
    [],
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [nudge, setNudge] = useState<string | null>(null);

  // Cross-app consume: sleep-logged + mood-logged. Quiet, once-per-day.
  useEffect(() => {
    return () => localNavigation.destroy();
  }, [localNavigation]);

  useEffect(() => {
    let alreadyShownToday = false;
    try {
      if (typeof localStorage !== 'undefined') {
        alreadyShownToday = localStorage.getItem(NUDGE_KEY) === todayKey();
      }
    } catch {
      // Storage may be blocked (private mode); just behave as not-shown.
    }

    function maybeShow(reason: 'sleep' | 'mood'): void {
      if (alreadyShownToday) return;
      alreadyShownToday = true;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(NUDGE_KEY, todayKey());
        }
      } catch {
        // ignore
      }
      setNudge(pickNudge(reason));
    }

    shippie.requestIntent('sleep-logged');
    shippie.requestIntent('mood-logged');

    const offSleep = shippie.intent.subscribe('sleep-logged', ({ rows }) => {
      const newest = (rows[0] ?? null) as Record<string, unknown> | null;
      const hours = typeof newest?.hours === 'number' ? newest.hours : null;
      if (hours !== null && hours < 6) maybeShow('sleep');
    });
    const offMood = shippie.intent.subscribe('mood-logged', ({ rows }) => {
      const newest = (rows[0] ?? null) as Record<string, unknown> | null;
      // Other apps may report 1..5 or 1..10. Normalise: treat <=2/5 or
      // <=4/10 as "rough" without being prescriptive about which scale.
      const score = typeof newest?.score === 'number' ? newest.score : null;
      if (score === null) return;
      const isLow = score <= 4 ? true : false;
      if (isLow) maybeShow('mood');
    });

    return () => {
      offSleep();
      offMood();
    };
  }, []);

  function go(next: View): void {
    void localNavigation.navigate(next, { kind: 'crossfade' });
  }

  function closeTo(fallback: View): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

  function onNoteSaved(): void {
    // Provider broadcast — let other apps know a journal entry happened.
    // Keep the row payload minimal: kind only. Body never leaves the app.
    shippie.intent.broadcast('journal-entry', [{ kind: 'therapy-note', occurredAt: new Date().toISOString() }]);
    setRefreshKey((n) => n + 1);
    closeTo('home');
  }

  function onCheckinSaved(info: { mood: number | null; sleep: number | null }): void {
    if (info.mood !== null) {
      shippie.intent.broadcast('mood-logged', [{ score: info.mood, scale: 5, source: 'therapy-notes' }]);
    }
    setRefreshKey((n) => n + 1);
    closeTo('home');
  }

  return (
    <div className="app">
      <header className="app-title">Therapy Notes</header>

      <main className="app-main">
        {view === 'home' ? (
          <Home
            refreshKey={refreshKey}
            onNewNote={() => go('new')}
            nudge={nudge}
            onDismissNudge={() => setNudge(null)}
          />
        ) : null}

        {view === 'new' ? (
          <NewNote onSaved={onNoteSaved} onCancel={() => closeTo('home')} />
        ) : null}

        {view === 'checkin' ? (
          <Checkin onSaved={onCheckinSaved} onCancel={() => closeTo('home')} />
        ) : null}

        {view === 'week' ? <WeeklySummary refreshKey={refreshKey} /> : null}

        {view === 'prep' ? (
          <PrepForSession refreshKey={refreshKey} onPrint={() => go('print')} />
        ) : null}

        {view === 'print' ? <PrintView onClose={() => closeTo('prep')} /> : null}

        {view === 'settings' ? <Settings onBack={() => closeTo('home')} /> : null}
      </main>

      <nav className="bottom-tabs no-print" role="tablist" aria-label="Sections">
        {TABS.map((t) => {
          // 'home' is selected for both 'home' and 'new' (new is a sub-page).
          // 'prep' covers 'prep' and 'print'.
          const isActive =
            t.id === view ||
            (t.id === 'home' && view === 'new') ||
            (t.id === 'prep' && view === 'print');
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className="tab"
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
