import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk, type AgentInsight } from '@shippie/iframe-sdk';

const shippie = createShippieIframeSdk({ appId: 'app_daily_briefing' });

/**
 * P4B-3 — Daily Briefing.
 *
 * Subscribes to ~9 intents from P3 + P4A apps and renders one
 * morning screen summarising what's known about today. Also calls
 * `shippie.agent.insights()` (P1A.2) so any cross-app correlation
 * the local agent has computed surfaces here too.
 *
 * Privacy: every row stays in this app's localStorage cache. Nothing
 * is uploaded. The container's source-data invariant means we only
 * see insights derived from data we (or the user via grants) can
 * already read.
 */

const SUBSCRIBED_INTENTS = [
  'cooked-meal',
  'workout-completed',
  'sleep-logged',
  'caffeine-logged',
  'mood-logged',
  'hydration-logged',
  'body-metrics-logged',
  'symptom-logged',
  'focus-session',
] as const;

type SubscribedIntent = (typeof SUBSCRIBED_INTENTS)[number];

interface IntentEvent {
  intent: SubscribedIntent;
  receivedAt: number;
  /** Free-form summary from the broadcast — title, kind, etc. */
  label: string;
}

const STORAGE_KEY = 'shippie.daily-briefing.v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface PersistedState {
  events: IntentEvent[];
}

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

function save(events: IntentEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events }));
  } catch {
    /* quota errors non-fatal */
  }
}

export function App() {
  const [events, setEvents] = useState<IntentEvent[]>(() => load());
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    save(events);
  }, [events]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    for (const intent of SUBSCRIBED_INTENTS) shippie.requestIntent(intent);
    const offs = SUBSCRIBED_INTENTS.map((intent) =>
      shippie.intent.subscribe(intent, ({ rows }) => {
        const head = (rows[0] ?? null) as Record<string, unknown> | null;
        const label =
          typeof head?.title === 'string'
            ? head.title
            : typeof head?.kind === 'string'
              ? head.kind
              : intent;
        setEvents((prev) =>
          [{ intent, receivedAt: Date.now(), label }, ...prev]
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

  const today = useMemo(() => {
    const cutoff = now - ONE_DAY_MS;
    const counts = new Map<SubscribedIntent, number>();
    const labels = new Map<SubscribedIntent, string>();
    for (const event of events) {
      if (event.receivedAt < cutoff) break;
      counts.set(event.intent, (counts.get(event.intent) ?? 0) + 1);
      if (!labels.has(event.intent)) labels.set(event.intent, event.label);
    }
    return SUBSCRIBED_INTENTS.map((intent) => ({
      intent,
      count: counts.get(intent) ?? 0,
      mostRecentLabel: labels.get(intent) ?? null,
    }));
  }, [events, now]);

  const greeting = useMemo(() => {
    const hour = new Date(now).getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  return (
    <main>
      <header>
        <h1>{greeting}.</h1>
        <p>Here&rsquo;s the rundown from your other apps over the last 24h.</p>
      </header>

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
            <strong>{describeIntent(row.intent)}</strong>
            <span className="count">{row.count}</span>
            {row.mostRecentLabel && (
              <small>Latest: {row.mostRecentLabel}</small>
            )}
          </article>
        ))}
      </section>

      <section className="recent">
        <h2>Most recent</h2>
        {events.length === 0 ? (
          <p className="empty">
            Nothing yet. As your other apps fire intents — Recipe Saver, Workout
            Logger, Caffeine Log, and so on — they show up here.
          </p>
        ) : (
          <ul>
            {events.slice(0, 12).map((event) => (
              <li key={`${event.intent}-${event.receivedAt}`}>
                <strong>{describeIntent(event.intent)}</strong>
                <small>
                  {event.label} · {timeAgo(event.receivedAt, now)}
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
  switch (intent) {
    case 'cooked-meal': return 'Cooked';
    case 'workout-completed': return 'Workouts';
    case 'sleep-logged': return 'Sleep';
    case 'caffeine-logged': return 'Caffeine';
    case 'mood-logged': return 'Mood';
    case 'hydration-logged': return 'Hydration';
    case 'body-metrics-logged': return 'Body metrics';
    case 'symptom-logged': return 'Symptoms';
    case 'focus-session': return 'Focus';
  }
}

function timeAgo(then: number, now: number): string {
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}
