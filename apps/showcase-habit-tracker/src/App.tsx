import { useEffect, useMemo, useState } from 'react';
import {
  createShippieIframeSdk,
  type AgentInsight,
  type AppsListEntry,
} from '@shippie/iframe-sdk';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import { cuesToFire, habitsToAutoCheck } from './intent-matcher.ts';
import type { Checkin, CheckStatus, Habit, HabitCheck, PersistedState, WeeklyReview } from './types.ts';
import { load, save } from './store.ts';
import { dayKey } from './lib/streak-math.ts';
import { isoWeekLabel, weekStatsForHabits } from './lib/review-prompt.ts';
import { Today } from './pages/Today.tsx';
import { HabitDetail } from './pages/HabitDetail.tsx';
import { Archive } from './pages/Archive.tsx';
import { Patterns } from './pages/Patterns.tsx';
import { CheckInCard } from './components/CheckInCard.tsx';
import { WeeklyReviewCard } from './components/WeeklyReviewCard.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_habit_tracker' });

/**
 * Habit Tracker — best-in-class polish.
 *
 * Architecture: thin orchestration here, real surfaces under
 * `pages/`, derivations under `lib/`. The component owns:
 *  - persisted state (habits + checks + lastReviewedWeek)
 *  - container RPC (apps.list, agent.insights, intent broadcasts)
 *  - the "should we show the weekly review now?" gate
 *
 * Voice-doc invariant: this file never contains the words "broke",
 * "failed", "crush", or frames a missed day as bad. The metrics layer
 * exposes both continuous streak and return rate; the UI shows the
 * pair, never the chain alone.
 */

const SUGGESTION_INTENT_LABELS: Record<string, string> = {
  'cooked-meal': 'Cooked dinner',
  'workout-completed': 'Exercised',
  'sleep-logged': 'Slept ≥7 hours',
  'caffeine-logged': 'Logged caffeine',
  'shopping-list': 'Did groceries',
  'body-metrics-logged': 'Logged weight',
  'pantry-inventory': 'Restocked pantry',
  'hydration-logged': 'Drank water',
  'coffee-brewed': 'Brewed coffee',
  'meal-logged': 'Logged a meal',
  'mood-logged': 'Logged mood',
};

type Route =
  | { kind: 'today' }
  | { kind: 'habit'; habitId: string }
  | { kind: 'archive' }
  | { kind: 'patterns' };

function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'habit' && b.kind === 'habit') return a.habitId === b.habitId;
  return true;
}

// Sibling intents the tracker watches even when no habit cue points at
// them — they backfill check-in fields. e.g. a Sleep app broadcasting
// `sleep-logged` lets us record the duration without the user re-typing
// it on the check-in slider.
const CHECKIN_INPUT_INTENTS = new Set([
  'sleep-logged',
  'hydration-logged',
  'caffeine-logged',
  'body-metrics-logged',
  'cycle-logged',
  'meal-logged',
  'cooked-meal',
]);

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp1to5(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function App() {
  const [{ habits, checks, checkins, reviews, lastReviewedWeek }, setState] = useState<PersistedState>(() => load());
  const [draft, setDraft] = useState('');
  const [route, setRoute] = useState<Route>({ kind: 'today' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Route>(
        { kind: 'today' },
        setRoute,
        { isEqual: sameRoute },
      ),
    [],
  );
  const [overlappingApps, setOverlappingApps] = useState<AppsListEntry[]>([]);
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [pendingCues, setPendingCues] = useState<Map<string, string>>(new Map());
  const [reviewDismissedThisSession, setReviewDismissedThisSession] = useState(false);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Route, kind: 'crossfade' | 'rise' = 'crossfade'): void {
    void localNavigation.navigate(next, { kind });
  }

  function closeTo(fallback: Route): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

  // Persist on every change. The store handles legacy migration on load.
  useEffect(() => {
    save({ habits, checks, checkins, reviews, lastReviewedWeek });
  }, [habits, checks, checkins, reviews, lastReviewedWeek]);

  // Container overlap-scoped app list — for the cue-anchor picker AND
  // the "suggested habits" surface.
  useEffect(() => {
    let cancelled = false;
    shippie.apps
      .list()
      .then((apps) => {
        if (!cancelled) setOverlappingApps(apps);
      })
      .catch(() => {
        /* offline / standalone is fine */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      shippie.agent
        .insights()
        .then((next) => {
          if (!cancelled) setInsights(next);
        })
        .catch(() => {
          /* offline */
        });
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Build the union of intents we care about for granting + subscription.
  // Includes every habit cue PLUS the check-in-input intents we use to
  // backfill sleep/hydration/caffeine etc. from sibling apps.
  const watchedIntents = useMemo(() => {
    const out = new Set<string>(CHECKIN_INPUT_INTENTS);
    for (const h of habits) {
      if (h.archivedAt) continue;
      const i = h.cue?.intent;
      if (i) out.add(i);
    }
    return Array.from(out);
  }, [habits]);

  // Request consume permission for every watched intent. Keep this
  // dependent on `watchedIntents` so a fresh cue triggers the prompt.
  useEffect(() => {
    for (const intent of watchedIntents) shippie.requestIntent(intent);
  }, [watchedIntents]);

  // Subscribe to forwarded broadcasts. The matcher distinguishes:
  //  - auto-check eligible (cue.autoCheck=true) → record a `done` check
  //  - reminder-only (cue.autoCheck=false) → enqueue a cue prompt the
  //    user can confirm or dismiss
  //
  // Cross-app intents in CHECKIN_INPUT_INTENTS also backfill the
  // matching field on today's check-in (sleep-logged → sleepHours).
  useEffect(() => {
    function handle(intent: string, payload?: unknown) {
      const today = dayKey(new Date());

      // Backfill check-in fields from sibling apps when their broadcast
      // carries a duration / value. Best-effort — payload shape is not
      // contractually fixed yet, so we sniff for the obvious fields.
      if (CHECKIN_INPUT_INTENTS.has(intent)) {
        backfillCheckin(intent, payload, today);
      }

      const autoIds = habitsToAutoCheck(intent, habits, checks, today);
      if (autoIds.length > 0) {
        const stamp = Date.now();
        const next: HabitCheck[] = autoIds.map((habitId, i) => ({
          id: `${habitId}_${stamp}_${i}`,
          habitId,
          checkedAt: new Date().toISOString(),
          status: 'done',
          source: 'cross-app',
        }));
        setState((s) => ({ ...s, checks: [...s.checks, ...next] }));
        for (const id of autoIds) broadcastHabitLogged(id, 'done', 'cross-app');
      }
      const promptIds = cuesToFire(intent, habits, checks, today);
      if (promptIds.length > 0) {
        setPendingCues((prev) => {
          const m = new Map(prev);
          for (const id of promptIds) m.set(id, intent);
          return m;
        });
      }
    }

    const offs = watchedIntents.map((intent) =>
      shippie.intent.subscribe(intent, (broadcast) =>
        handle(broadcast.intent, broadcast.rows?.[0]),
      ),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [watchedIntents, habits, checks]);

  // Eligible cue-anchor intents: every intent provided by the user's
  // overlapping apps, labelled where we have a copy entry. The picker
  // also receives the unlabelled ones — better to show "coffee-brewed"
  // than to hide it.
  const eligibleIntents = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ intent: string; label: string }> = [];
    for (const app of overlappingApps) {
      for (const intent of app.provides) {
        if (seen.has(intent)) continue;
        seen.add(intent);
        out.push({ intent, label: SUGGESTION_INTENT_LABELS[intent] ?? intent });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [overlappingApps]);

  // Suggested habits: intents the user's overlapping apps provide that
  // aren't already wired to one of our habits.
  const suggestedHabits = useMemo(() => {
    const existing = new Set(
      habits
        .filter((h) => !h.archivedAt)
        .map((h) => h.cue?.intent)
        .filter((i): i is string => Boolean(i)),
    );
    return eligibleIntents.filter(
      ({ intent }) => !existing.has(intent) && SUGGESTION_INTENT_LABELS[intent],
    );
  }, [eligibleIntents, habits]);

  // Weekly review gate — show on Sunday/Monday once per ISO week.
  const today = useMemo(() => dayKey(new Date()), []);
  const currentWeek = useMemo(() => isoWeekLabel(today), [today]);
  const showWeeklyReview =
    !reviewDismissedThisSession &&
    lastReviewedWeek !== currentWeek &&
    habits.some((h) => !h.archivedAt) &&
    checks.length > 0;
  const weekStats = useMemo(
    () => (showWeeklyReview ? weekStatsForHabits(habits, today, checks) : []),
    [showWeeklyReview, habits, today, checks],
  );

  // Today's check-in (single row keyed by ISO day).
  const todayCheckin = useMemo(
    () => checkins.find((c) => c.date === today) ?? null,
    [checkins, today],
  );

  const cuePromptList = useMemo(() => {
    const out: Array<{ habit: Habit; firedIntent: string }> = [];
    for (const [habitId, firedIntent] of pendingCues) {
      const h = habits.find((x) => x.id === habitId);
      if (h && !h.archivedAt) out.push({ habit: h, firedIntent });
    }
    return out;
  }, [pendingCues, habits]);

  // Commands ----------------------------------------------------------

  function addHabit(name: string, opts: Partial<Habit> = {}) {
    const id = `h_${Date.now()}`;
    const habit: Habit = {
      id,
      name,
      difficulty: 'easy',
      createdAt: new Date().toISOString(),
      ...opts,
    };
    setState((s) => ({ ...s, habits: [...s.habits, habit] }));
    if (habit.cue?.intent) shippie.requestIntent(habit.cue.intent);
    shippie.feel.texture('install');
  }

  function recordCheck(habit: Habit, status: CheckStatus, source: HabitCheck['source'] = 'manual') {
    const today = dayKey(new Date());
    setState((s) => {
      // Replace today's check rather than stack — the user's latest
      // call is the truth for that day.
      const others = s.checks.filter(
        (c) => !(c.habitId === habit.id && c.checkedAt.slice(0, 10) === today),
      );
      const next: HabitCheck = {
        id: `${habit.id}_${Date.now()}`,
        habitId: habit.id,
        checkedAt: new Date().toISOString(),
        status,
        source,
      };
      return { ...s, checks: [...others, next] };
    });
    setPendingCues((prev) => {
      if (!prev.has(habit.id)) return prev;
      const m = new Map(prev);
      m.delete(habit.id);
      return m;
    });
    shippie.feel.texture(status === 'done' ? 'confirm' : 'toggle');
    if (status === 'done' || status === 'partial') {
      broadcastHabitLogged(habit.id, status, source);
    }
  }

  // Today's check-in (mood / energy / stress / sleep / body / note).
  // Last write wins for the day; partial fills are explicitly allowed.
  function updateTodayCheckin(patch: Partial<Omit<Checkin, 'id' | 'date' | 'createdAt'>>) {
    const today = dayKey(new Date());
    let written: Checkin | null = null;
    setState((s) => {
      const existing = s.checkins.find((c) => c.date === today);
      const merged: Checkin = existing
        ? { ...existing, ...patch }
        : {
            id: `ci_${Date.now()}`,
            date: today,
            createdAt: new Date().toISOString(),
            ...patch,
          };
      written = merged;
      const others = s.checkins.filter((c) => c.date !== today);
      return { ...s, checkins: [...others, merged] };
    });
    shippie.feel.texture('toggle');
    if (written) broadcastCheckin(written, patch);
  }

  // Helper: emit `habit-logged` on every manual or cross-app tick so
  // sibling apps (Chiwit, Journal, Cycle…) can light up their cards.
  function broadcastHabitLogged(habitId: string, status: CheckStatus, source: HabitCheck['source']) {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    try {
      shippie.intent.broadcast('habit-logged', [
        {
          habitId,
          name: habit.name,
          status,
          source,
          at: new Date().toISOString(),
        },
      ]);
    } catch {
      /* host may not be ready in standalone preview */
    }
  }

  // Helper: emit feeling-logged + (when present) mood-logged so other
  // apps that subscribe to feelings get the latest reading.
  function broadcastCheckin(
    checkin: Checkin,
    patch: Partial<Omit<Checkin, 'id' | 'date' | 'createdAt'>>,
  ) {
    try {
      shippie.intent.broadcast('feeling-logged', [
        {
          date: checkin.date,
          mood: checkin.mood,
          energy: checkin.energy,
          stress: checkin.stress,
          body: checkin.body,
          sleepHours: checkin.sleepHours,
          note: checkin.note,
        },
      ]);
    } catch {
      /* host may not be ready */
    }
    if ('mood' in patch && typeof patch.mood === 'number') {
      try {
        shippie.intent.broadcast('mood-logged', [{ date: checkin.date, mood: patch.mood }]);
      } catch {
        /* host may not be ready */
      }
    }
  }

  /**
   * Backfill helper for sibling-app broadcasts. The payload shape isn't
   * contractually fixed across showcases so we sniff for the obvious
   * fields. Last write wins; the user can always overwrite via the
   * check-in card.
   */
  function backfillCheckin(intent: string, payload: unknown, day: string) {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const patch: Partial<Checkin> = {};
    if (intent === 'sleep-logged') {
      const hours = readNumber(p.hours ?? p.sleepHours ?? p.durationHours);
      if (hours != null) patch.sleepHours = roundTenth(hours);
    }
    if (intent === 'cycle-logged') {
      const mood = readNumber(p.mood);
      if (mood != null) patch.mood = clamp1to5(mood);
    }
    if (intent === 'body-metrics-logged') {
      const body = readNumber(p.body);
      if (body != null) patch.body = clamp1to5(body);
    }
    if (Object.keys(patch).length === 0) return;
    setState((s) => {
      const existing = s.checkins.find((c) => c.date === day);
      const merged: Checkin = existing
        ? { ...existing, ...patch }
        : {
            id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            date: day,
            createdAt: new Date().toISOString(),
            ...patch,
          };
      const others = s.checkins.filter((c) => c.date !== day);
      return { ...s, checkins: [...others, merged] };
    });
  }

  function toggleHabit(habit: Habit) {
    const today = dayKey(new Date());
    const existing = checks.find(
      (c) => c.habitId === habit.id && c.checkedAt.slice(0, 10) === today,
    );
    if (existing && existing.status !== 'missed') {
      // untick — remove today's check
      setState((s) => ({
        ...s,
        checks: s.checks.filter((c) => c.id !== existing.id),
      }));
      shippie.feel.texture('toggle');
    } else {
      recordCheck(habit, 'done');
    }
  }

  function partialHabit(habit: Habit) {
    recordCheck(habit, 'partial');
  }

  function updateHabit(next: Habit) {
    setState((s) => ({
      ...s,
      habits: s.habits.map((h) => (h.id === next.id ? next : h)),
    }));
    if (next.cue?.intent) shippie.requestIntent(next.cue.intent);
  }

  function archiveHabit(habit: Habit) {
    updateHabit({ ...habit, archivedAt: new Date().toISOString() });
    void localNavigation.replace({ kind: 'today' }, { kind: 'crossfade' });
    shippie.feel.texture('toggle');
  }

  function reactivateHabit(habit: Habit) {
    const { archivedAt, ...rest } = habit;
    void archivedAt;
    updateHabit(rest as Habit);
  }

  function dismissCue(habitId: string) {
    setPendingCues((prev) => {
      const m = new Map(prev);
      m.delete(habitId);
      return m;
    });
  }

  function acknowledgeReview() {
    const review: WeeklyReview = {
      id: `r_${currentWeek}`,
      isoWeek: currentWeek,
      createdAt: new Date().toISOString(),
    };
    setState((s) => {
      const others = s.reviews.filter((r) => r.isoWeek !== currentWeek);
      return {
        ...s,
        lastReviewedWeek: currentWeek,
        reviews: [...others, review],
      };
    });
    setReviewDismissedThisSession(true);
    shippie.feel.texture('confirm');
    try {
      shippie.intent.broadcast('weekly-review-created', [
        {
          isoWeek: currentWeek,
          at: new Date().toISOString(),
        },
      ]);
    } catch {
      /* host may not be ready */
    }
  }

  function dismissReview() {
    setReviewDismissedThisSession(true);
  }

  // Render ------------------------------------------------------------

  const activeHabit = route.kind === 'habit' ? habits.find((h) => h.id === route.habitId) : null;

  // If we're on a habit route but the habit no longer exists (deleted,
  // archived elsewhere, stale deep-link), fall back to the today list
  // rather than rendering an empty shell.
  useEffect(() => {
    if (route.kind === 'habit' && !activeHabit) {
      closeTo({ kind: 'today' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind, activeHabit]);

  return (
    <div className="app">
      {insights.length > 0 && route.kind === 'today' ? (
        <section className="insights" aria-label="Insights from the local agent">
          {insights.slice(0, 2).map((insight) => (
            <article key={insight.id} className={`insight insight-${insight.urgency}`}>
              <h2>{insight.title}</h2>
              {insight.body && <p>{insight.body}</p>}
            </article>
          ))}
        </section>
      ) : null}

      {route.kind === 'today' && suggestedHabits.length > 0 ? (
        <section className="suggestions" aria-label="Suggested habits from your other apps">
          <h2>From your other apps</h2>
          <div className="chips">
            {suggestedHabits.map(({ intent, label }) => (
              <button
                key={intent}
                type="button"
                className="chip"
                onClick={() =>
                  addHabit(label, {
                    cue: { intent, autoCheck: true },
                    difficulty: 'easy',
                  })
                }
                title={`Auto-checks when an app fires ${intent}`}
              >
                + {label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {route.kind === 'today' && showWeeklyReview ? (
        <WeeklyReviewCard
          stats={weekStats}
          habits={habits}
          onAcknowledge={acknowledgeReview}
          onDismiss={dismissReview}
        />
      ) : null}

      {route.kind === 'today' ? (
        <CheckInCard today={todayCheckin} onChange={updateTodayCheckin} />
      ) : null}

      {route.kind === 'today' ? (
        <Today
          habits={habits}
          checks={checks}
          draft={draft}
          onDraftChange={setDraft}
          onAddHabit={() => {
            const name = draft.trim();
            if (!name) return;
            addHabit(name);
            setDraft('');
          }}
          onTick={toggleHabit}
          onPartial={partialHabit}
          onOpen={(habit) => navigate({ kind: 'habit', habitId: habit.id }, 'rise')}
          cuePrompts={cuePromptList}
          onDismissCue={dismissCue}
        />
      ) : null}

      {route.kind === 'habit' && activeHabit ? (
        <HabitDetail
          habit={activeHabit}
          checks={checks}
          eligibleIntents={eligibleIntents}
          onUpdate={updateHabit}
          onArchive={() => archiveHabit(activeHabit)}
          onBack={() => closeTo({ kind: 'today' })}
        />
      ) : null}

      {route.kind === 'archive' ? (
        <Archive
          habits={habits}
          onReactivate={reactivateHabit}
          onBack={() => closeTo({ kind: 'today' })}
        />
      ) : null}

      {route.kind === 'patterns' ? (
        <Patterns
          habits={habits}
          checks={checks}
          checkins={checkins}
          onBack={() => closeTo({ kind: 'today' })}
        />
      ) : null}

      <nav className="bottom-tabs" role="tablist" aria-label="Sections">
        <button
          type="button"
          role="tab"
          aria-selected={route.kind === 'today'}
          className={`tab ${route.kind === 'today' ? 'tab-active' : ''}`}
          onClick={() => navigate({ kind: 'today' })}
        >
          Today
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route.kind === 'patterns'}
          className={`tab ${route.kind === 'patterns' ? 'tab-active' : ''}`}
          onClick={() => navigate({ kind: 'patterns' })}
        >
          Patterns
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={route.kind === 'archive'}
          className={`tab ${route.kind === 'archive' ? 'tab-active' : ''}`}
          onClick={() => navigate({ kind: 'archive' })}
        >
          Archive
        </button>
      </nav>
    </div>
  );
}
