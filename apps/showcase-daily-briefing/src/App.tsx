import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk, type AgentInsight } from '@shippie/iframe-sdk';

const shippie = createShippieIframeSdk({ appId: 'app_daily_briefing' });

/**
 * P4B-3 — Daily Briefing.
 *
 * Subscribes to the launch-slate intent graph and renders one morning
 * screen summarising what's known about today. Also calls
 * `shippie.agent.insights()` (P1A.2) so any cross-app correlation
 * the local agent has computed surfaces here too.
 *
 * Privacy: every row stays in this app's localStorage cache. Nothing
 * is uploaded. The container's source-data invariant means we only
 * see insights derived from data we (or the user via grants) can
 * already read.
 */

const INTENTS = [
  { id: 'cooked-meal', label: 'Cooked', source: 'Recipe / Cooking', group: 'Food' },
  { id: 'cooking-now', label: 'Cooking now', source: 'Recipe / Cooking', group: 'Food' },
  { id: 'coffee-brewed', label: 'Coffee', source: 'Coffee', group: 'Food' },
  { id: 'caffeine-logged', label: 'Caffeine', source: 'Coffee / Sip Log', group: 'Food' },
  { id: 'hydration-logged', label: 'Hydration', source: 'Sip Log', group: 'Food' },
  { id: 'dough-ready', label: 'Dough ready', source: 'Dough', group: 'Food' },
  { id: 'needs-restocking', label: 'Restock', source: 'Shopping List', group: 'Home' },
  { id: 'workout-completed', label: 'Workouts', source: 'Workout Logger', group: 'Move' },
  { id: 'run-planned', label: 'Run plans', source: 'Pace', group: 'Move' },
  { id: 'sleep-logged', label: 'Sleep', source: 'Sleep Logger', group: 'Move' },
  { id: 'mood-logged', label: 'Mood', source: 'Mood Pulse', group: 'Quiet' },
  { id: 'mindful-session', label: 'Breath', source: 'Breath', group: 'Quiet' },
  { id: 'focus-session', label: 'Focus', source: 'Pomodoro', group: 'Quiet' },
  { id: 'body-metrics-logged', label: 'Body metrics', source: 'Body Metrics', group: 'Health' },
  { id: 'symptom-logged', label: 'Symptoms', source: 'Symptom Diary', group: 'Health' },
  { id: 'therapy-checkin', label: 'Therapy', source: 'Therapy Notes', group: 'Health' },
  { id: 'cycle-logged', label: 'Cycle', source: 'Cycle', group: 'Health' },
  { id: 'household-note', label: 'Home notes', source: 'Hearth', group: 'Home' },
  { id: 'chore-done', label: 'Chores', source: 'Hearth', group: 'Home' },
  { id: 'dinner-planned', label: 'Dinner plans', source: 'Hearth', group: 'Home' },
  { id: 'handover-note', label: 'Handover', source: 'Co-Pilot', group: 'Family' },
  { id: 'meds-logged', label: 'Meds', source: 'Co-Pilot', group: 'Family' },
  { id: 'custody-event', label: 'Schedule', source: 'Co-Pilot', group: 'Family' },
  { id: 'story-shared', label: 'Stories', source: 'Story Studio', group: 'Family' },
  { id: 'story-draft', label: 'Story drafts', source: 'Story Studio', group: 'Family' },
  { id: 'dined-out', label: 'Ate out', source: 'Restaurant Memory', group: 'Places' },
  { id: 'trip-note', label: 'Trip notes', source: 'Atlas', group: 'Places' },
  { id: 'place-pinned', label: 'Pins', source: 'Atlas', group: 'Places' },
  { id: 'expense-logged', label: 'Expenses', source: 'Ledger', group: 'Money' },
  { id: 'budget-limit', label: 'Budgets', source: 'Ledger', group: 'Money' },
] as const;

type SubscribedIntent = (typeof INTENTS)[number]['id'];

interface IntentEvent {
  intent: SubscribedIntent;
  receivedAt: number;
  /** Free-form summary from the broadcast — title, kind, etc. */
  label: string;
  providerAppId?: string;
}

const STORAGE_KEY = 'shippie.daily-briefing.v1';
const HIDDEN_KEY = 'shippie.daily-briefing.hidden.v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

interface PersistedState {
  events: IntentEvent[];
}

const intentById = new Map<SubscribedIntent, (typeof INTENTS)[number]>(
  INTENTS.map((intent) => [intent.id, intent]),
);

function load(): IntentEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedState;
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function loadHidden(): Set<SubscribedIntent> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((intent): intent is SubscribedIntent => intentById.has(intent as SubscribedIntent))
        : [],
    );
  } catch {
    return new Set();
  }
}

function save(events: IntentEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events }));
  } catch {
    /* quota errors non-fatal */
  }
}

function saveHidden(hidden: Set<SubscribedIntent>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  } catch {
    /* quota errors non-fatal */
  }
}

export function App() {
  const [events, setEvents] = useState<IntentEvent[]>(() => load());
  const [hiddenIntents, setHiddenIntents] = useState<Set<SubscribedIntent>>(() => loadHidden());
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    save(events);
  }, [events]);

  useEffect(() => {
    saveHidden(hiddenIntents);
  }, [hiddenIntents]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    for (const { id } of INTENTS) shippie.requestIntent(id);
    const offs = INTENTS.map(({ id }) =>
      shippie.intent.subscribe(id, ({ rows, providerAppId }) => {
        const head = (rows[0] ?? null) as Record<string, unknown> | null;
        const label =
          typeof head?.title === 'string'
            ? head.title
          : typeof head?.kind === 'string'
              ? head.kind
              : describeIntent(id);
        setEvents((prev) =>
          [{ intent: id, receivedAt: Date.now(), label, providerAppId }, ...prev]
            .slice(0, 200),
        );
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }, []);

  // Pull insights immediately + every 5 minutes — gives the user
  // fresh agent output without spamming the bridge.
  useEffect(() => {
    let cancelled = false;
    function refresh() {
      shippie.agent
        .insights()
        .then((next) => {
          if (!cancelled) setInsights(next);
        })
        .catch(() => {
          /* offline — empty insights array stays */
        });
    }
    refresh();
    const id = window.setInterval(refresh, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const visibleEvents = useMemo(
    () => events.filter((event) => !hiddenIntents.has(event.intent)),
    [events, hiddenIntents],
  );

  const today = useMemo(() => {
    const cutoff = now - ONE_DAY_MS;
    const counts = new Map<SubscribedIntent, number>();
    const labels = new Map<SubscribedIntent, string>();
    for (const event of visibleEvents) {
      if (event.receivedAt < cutoff) break;
      counts.set(event.intent, (counts.get(event.intent) ?? 0) + 1);
      if (!labels.has(event.intent)) labels.set(event.intent, event.label);
    }
    return INTENTS.map(({ id, label, source, group }) => ({
      intent: id,
      label,
      source,
      group,
      count: counts.get(id) ?? 0,
      mostRecentLabel: labels.get(id) ?? null,
    }));
  }, [visibleEvents, now]);

  const summary = useMemo(() => {
    const dayCutoff = now - ONE_DAY_MS;
    const weekCutoff = now - ONE_WEEK_MS;
    const lastDay = visibleEvents.filter((event) => event.receivedAt >= dayCutoff);
    const lastWeek = visibleEvents.filter((event) => event.receivedAt >= weekCutoff);
    const activeGroups = new Set(
      lastDay.flatMap((event) => {
        const group = intentById.get(event.intent)?.group;
        return group ? [group] : [];
      }),
    );
    const apps = new Set(
      lastDay.flatMap((event) => {
        const source = intentById.get(event.intent)?.source;
        return source ? [source] : [];
      }),
    );
    return {
      lastDayCount: lastDay.length,
      lastWeekCount: lastWeek.length,
      activeGroupCount: activeGroups.size,
      sourceCount: apps.size,
    };
  }, [visibleEvents, now]);

  const groupRows = useMemo(() => {
    const groups = new Map<string, { group: string; count: number; sources: Set<string>; latest: string | null }>();
    for (const event of visibleEvents) {
      const meta = intentById.get(event.intent);
      if (!meta) continue;
      const current = groups.get(meta.group) ?? {
        group: meta.group,
        count: 0,
        sources: new Set<string>(),
        latest: null,
      };
      current.count += 1;
      current.sources.add(meta.source);
      current.latest ??= event.label;
      groups.set(meta.group, current);
    }
    return [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [visibleEvents]);

  const connections = useMemo(() => {
    const counts = new Map<SubscribedIntent, number>();
    for (const event of visibleEvents) {
      counts.set(event.intent, (counts.get(event.intent) ?? 0) + 1);
    }
    return [
      {
        title: 'Recovery loop',
        detail: 'Move and Quiet can compare workouts, sleep, focus, mood, and caffeine.',
        active: hasAny(counts, ['workout-completed', 'sleep-logged', 'mood-logged', 'caffeine-logged', 'focus-session']),
      },
      {
        title: 'Household loop',
        detail: 'Hearth can respond to meals, restocks, dinner plans, and chores.',
        active: hasAny(counts, ['cooked-meal', 'needs-restocking', 'dinner-planned', 'chore-done', 'household-note']),
      },
      {
        title: 'Health handoff',
        detail: 'Cycle, Therapy Notes, and Symptom Diary build exportable local context.',
        active: hasAny(counts, ['symptom-logged', 'therapy-checkin', 'cycle-logged', 'body-metrics-logged']),
      },
      {
        title: 'Travel money trail',
        detail: 'Atlas, Restaurant Memory, and Ledger connect places to expenses without an aggregator.',
        active: hasAny(counts, ['trip-note', 'place-pinned', 'dined-out', 'expense-logged', 'budget-limit']),
      },
    ];
  }, [visibleEvents]);

  const greeting = useMemo(() => {
    const hour = new Date(now).getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  function toggleIntent(intent: SubscribedIntent) {
    setHiddenIntents((current) => {
      const next = new Set(current);
      if (next.has(intent)) next.delete(intent);
      else next.add(intent);
      return next;
    });
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Daily</p>
        <h1>{greeting}.</h1>
        <p>One local readout from the apps you already use.</p>
        <button type="button" className="data-button" onClick={() => shippie.openYourData({ appSlug: 'daily-briefing' })}>
          Your Data
        </button>
      </header>

      <section className="summary" aria-label="Daily summary">
        <div>
          <span>{summary.lastDayCount}</span>
          <small>signals today</small>
        </div>
        <div>
          <span>{summary.activeGroupCount}</span>
          <small>areas active</small>
        </div>
        <div>
          <span>{summary.sourceCount}</span>
          <small>app sources</small>
        </div>
        <div>
          <span>{summary.lastWeekCount}</span>
          <small>this week</small>
        </div>
      </section>

      <section className="graph" aria-label="Daily graph">
        <div className="section-title">
          <h2>Graph lanes</h2>
          <p>Daily groups local signals by where they came from, not by who can monetize them.</p>
        </div>
        {groupRows.length === 0 ? (
          <p className="empty">No lanes active yet. Open a few apps and save entries to light up the graph.</p>
        ) : (
          <div className="lanes">
            {groupRows.map((row) => (
              <article key={row.group} className="lane">
                <span>{row.count}</span>
                <strong>{row.group}</strong>
                <small>{row.sources.size} source{row.sources.size === 1 ? '' : 's'}</small>
                {row.latest ? <small>Latest: {row.latest}</small> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="connections" aria-label="Cross-app connections">
        <div className="section-title">
          <h2>Connections</h2>
          <p>The useful part is the relationship between apps, not another isolated tracker.</p>
        </div>
        {connections.map((connection) => (
          <article key={connection.title} className={connection.active ? 'connection active' : 'connection'}>
            <strong>{connection.title}</strong>
            <small>{connection.detail}</small>
          </article>
        ))}
      </section>

      {insights.length > 0 && (
        <section className="insights">
          <h2>Agent insights</h2>
          {insights.slice(0, 3).map((insight) => (
            <article key={insight.id} className={`insight insight-${insight.urgency}`}>
              <strong>{insight.title}</strong>
              {insight.body && <p>{insight.body}</p>}
            </article>
          ))}
        </section>
      )}

      <section className="grid" aria-label="Activity by intent">
        {today.map((row) => (
          <article key={row.intent} className={row.count > 0 ? 'cell active' : 'cell idle'}>
            <strong>{row.label}</strong>
            <span className="count">{row.count}</span>
            <small>{row.source}</small>
            {row.mostRecentLabel && (
              <small>Latest: {row.mostRecentLabel}</small>
            )}
          </article>
        ))}
      </section>

      <section className="privacy">
        <div>
          <h2>Visible sources</h2>
          <p>Hide a signal from Daily without changing the source app.</p>
        </div>
        <div className="toggles">
          {INTENTS.map((intent) => (
            <button
              key={intent.id}
              type="button"
              className={hiddenIntents.has(intent.id) ? 'toggle muted' : 'toggle'}
              onClick={() => toggleIntent(intent.id)}
            >
              {intent.label}
            </button>
          ))}
        </div>
      </section>

      <section className="recent">
        <h2>Most recent</h2>
        {visibleEvents.length === 0 ? (
          <p className="empty">
            Nothing visible yet. As Recipe, Coffee, Move, Quiet, and the rest
            emit local intents, they show up here.
          </p>
        ) : (
          <ul>
            {visibleEvents.slice(0, 12).map((event) => (
              <li key={`${event.intent}-${event.receivedAt}`}>
                <strong>{describeIntent(event.intent)}</strong>
                <small>
                  {event.label} - {sourceForIntent(event.intent)} - {timeAgo(event.receivedAt, now)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function describeIntent(intent: SubscribedIntent): string {
  return intentById.get(intent)?.label ?? intent;
}

function sourceForIntent(intent: SubscribedIntent): string {
  return intentById.get(intent)?.source ?? 'Unknown source';
}

function timeAgo(then: number, now: number): string {
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

function hasAny(counts: Map<SubscribedIntent, number>, intents: SubscribedIntent[]): boolean {
  return intents.some((intent) => (counts.get(intent) ?? 0) > 0);
}
