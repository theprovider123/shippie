<script lang="ts">
  import { onMount } from 'svelte';
  import { listEventsSince, clearStore, type IntentEvent } from '$lib/intent-store/store';
  import { summarise, labelFor, type DailySummary } from '$lib/intent-store/aggregates';
  import { summariseDailyStreak, type DailyStreakSummary } from '$lib/intent-store/daily-streak';
  import { SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';

  type Window = '24h' | '7d' | '30d';
  const WINDOWS: Record<Window, { label: string; ms: number }> = {
    '24h': { label: 'Today', ms: 24 * 60 * 60 * 1000 },
    '7d': { label: 'This week', ms: 7 * 24 * 60 * 60 * 1000 },
    '30d': { label: 'This month', ms: 30 * 24 * 60 * 60 * 1000 },
  };
  const STREAK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  let window: Window = $state('24h');
  let summary: DailySummary | null = $state(null);
  let dailyStreak: DailyStreakSummary | null = $state(null);
  let loading = $state(true);
  let confirmingClear = $state(false);

  // Slugs the platform knows about → for tile lookup. Anything not in
  // here renders with the raw appId, which is fine for third-party.
  const knownSlugs = new Set<string>(SHOWCASE_SLUGS);

  async function refresh() {
    loading = true;
    try {
      const now = Date.now();
      const windowMs = WINDOWS[window].ms;
      const events: IntentEvent[] = await listEventsSince(now - Math.max(windowMs, STREAK_WINDOW_MS), 5_000);
      const windowEvents = events.filter((event) => event.ts >= now - windowMs);
      summary = summarise(windowEvents, windowMs);
      dailyStreak = summariseDailyStreak(events);
    } catch (err) {
      console.warn('[today] could not read intent store', err);
      summary = { windowMs: WINDOWS[window].ms, earliest: null, latest: null, total: 0, apps: [] };
      dailyStreak = summariseDailyStreak([]);
    } finally {
      loading = false;
    }
  }

  async function doClear() {
    await clearStore();
    confirmingClear = false;
    await refresh();
  }

  function appLabel(appId: string): string {
    // Strip `app_` prefix some showcases use; otherwise return slug-y
    // version of the id.
    const slug = appId.replace(/^app_/, '').replace(/_/g, '-');
    return knownSlugs.has(slug) ? slug : appId;
  }

  function appHref(appId: string): string | null {
    const slug = appId.replace(/^app_/, '').replace(/_/g, '-');
    return knownSlugs.has(slug) ? `/${encodeURIComponent(slug)}` : null;
  }

  function fmtRelative(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  onMount(() => {
    void refresh();
  });

  $effect(() => {
    // Re-run when the window changes.
    void window;
    void refresh();
  });
</script>

<svelte:head>
  <title>Today · Shippie</title>
  <meta name="description" content="Cross-app summary of what your Shippie apps did. On your device, never on a Shippie server." />
</svelte:head>

<main class="today">
  <header class="today-head">
    <p class="today-eyebrow">Today</p>
    <h1>What your apps did</h1>
    <p class="today-lede">
      A summary across every Shippie app. The intent stream lives on this device — no Shippie server sees it.
    </p>

    <div class="today-window-tabs" role="radiogroup" aria-label="Window">
      {#each Object.entries(WINDOWS) as [key, w]}
        <button
          type="button"
          role="radio"
          aria-checked={window === key}
          class:today-tab-active={window === key}
          onclick={() => (window = key as Window)}
        >
          {w.label}
        </button>
      {/each}
    </div>
  </header>

  {#if loading}
    <p class="today-empty">Reading the day…</p>
  {:else}
    <section class="today-daily" aria-label="Daily games progress">
      <div>
        <span class="today-streak-badge" aria-label={`${dailyStreak?.current ?? 0} day streak`}>
          Streak {dailyStreak?.current ?? 0} {dailyStreak?.current === 1 ? 'day' : 'days'}
        </span>
        <p>
          Today's Daily <strong>{dailyStreak?.today.done ?? 0}/{dailyStreak?.today.required ?? 3}</strong>
          {#if dailyStreak?.today.complete}
            · set complete
          {:else}
            · complete {Math.max(0, (dailyStreak?.today.required ?? 3) - (dailyStreak?.today.done ?? 0))} more
          {/if}
        </p>
      </div>
      <span class="today-best">Best {dailyStreak?.best ?? 0}</span>
    </section>
  {/if}

  {#if !loading && (!summary || summary.total === 0)}
    <section class="today-empty-card">
      <h2>Nothing logged yet.</h2>
      <p>
        Open an app from <a href="/tools">Tools</a> and do something — a coffee in Palate, a journal entry, a workout in Lift. Whatever fires shows up here.
      </p>
      <p class="today-foot-note">
        The summary builds itself from intents your apps broadcast. Nothing is sent to a Shippie server. There is no admin who could read it.
      </p>
    </section>
  {:else if !loading && summary}
    <section class="today-stat-strip">
      <p>
        <strong>{summary.total}</strong> {summary.total === 1 ? 'event' : 'events'} from <strong>{summary.apps.length}</strong> {summary.apps.length === 1 ? 'app' : 'apps'}
        {#if summary.latest}
          · last activity {fmtRelative(summary.latest)}
        {/if}
      </p>
    </section>

    <section class="today-apps">
      {#each summary.apps as app (app.appId)}
        {@const href = appHref(app.appId)}
        <article class="today-app-card">
          <header class="today-app-head">
            {#if href}
              <a href={href} class="today-app-name">{appLabel(app.appId)}</a>
            {:else}
              <span class="today-app-name">{appLabel(app.appId)}</span>
            {/if}
            <span class="today-app-meta">
              {app.count} {app.count === 1 ? 'event' : 'events'}
              · last {fmtRelative(app.lastSeen)}
            </span>
          </header>
          <ul class="today-intents">
            {#each app.intents as i}
              <li>
                <span class="today-intent-label">{labelFor(i.intent)}</span>
                <span class="today-intent-count">×{i.count}</span>
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  {/if}

  <footer class="today-footer">
    <h3>Privacy</h3>
    <p>
      The intent stream is stored in IndexedDB on this device. Shippie does not aggregate or read it, and clearing this history removes it from this browser.
    </p>
    {#if !confirmingClear}
      <button type="button" class="btn btn--ghost" onclick={() => (confirmingClear = true)}>
        Clear /today history
      </button>
    {:else}
      <p class="today-foot-note">This drops every intent event from this device. Your apps' own data isn't touched.</p>
      <button type="button" class="btn btn--danger" onclick={() => void doClear()}>
        Yes, clear it
      </button>
      <button type="button" class="btn btn--ghost" onclick={() => (confirmingClear = false)}>
        Cancel
      </button>
    {/if}
  </footer>
</main>

<style>
  .today {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px 96px;
    color: var(--text);
  }

  .today-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: var(--text-caption);
    color: var(--text-secondary);
    margin: 0 0 4px;
  }

  .today-head h1 {
    font-family: var(--font-display, 'Fraunces', Georgia, serif);
    font-size: var(--text-title);
    font-weight: 600;
    margin: 0 0 8px;
  }

  .today-lede {
    color: var(--text-secondary);
    margin: 0 0 24px;
    line-height: 1.5;
  }

  .today-window-tabs {
    display: inline-flex;
    border: 1px solid var(--border);
    overflow: hidden;
    margin-bottom: 32px;
  }

  .today-window-tabs button {
    background: transparent;
    border: 0;
    color: var(--text-secondary);
    padding: 8px 16px;
    cursor: pointer;
    font: inherit;
  }

  .today-window-tabs button.today-tab-active {
    background: var(--surface-alt);
    color: var(--sunset);
    box-shadow: inset 0 -2px 0 var(--sunset);
  }

  .today-empty,
  .today-empty-card {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .today-empty-card {
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-lg);
  }

  .today-daily {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 14px 0;
    margin-bottom: 24px;
  }

  .today-daily p {
    margin: 8px 0 0;
    color: var(--text-secondary);
  }

  .today-daily strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .today-streak-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    color: var(--text);
    font-weight: 700;
    font-size: var(--text-body);
  }

  .today-best {
    color: var(--text-light, #7A6B58);
    font-size: var(--text-small);
    white-space: nowrap;
  }

  .today-empty-card h2 {
    margin: 0 0 8px;
    font-weight: 600;
    font-size: var(--text-lede);
  }

  .today-empty-card a {
    color: var(--text);
    text-decoration: underline;
  }

  .today-foot-note {
    color: var(--text-light, #7A6B58);
    font-size: var(--text-small);
    line-height: 1.5;
  }

  .today-stat-strip {
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
    margin-bottom: 24px;
    color: var(--text-secondary);
  }

  .today-stat-strip p {
    margin: 0;
  }

  .today-apps {
    display: grid;
    border-top: 1px solid var(--border-light);
  }

  .today-app-card {
    border-bottom: 1px solid var(--border-light);
    padding: 16px 0;
  }

  .today-app-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .today-app-name {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    font-size: var(--text-body);
  }

  a.today-app-name:hover {
    text-decoration: underline;
  }

  .today-app-meta {
    color: var(--text-light, #7A6B58);
    font-size: var(--text-small);
  }

  .today-intents {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 4px;
  }

  .today-intents li {
    display: flex;
    justify-content: space-between;
    color: var(--text-secondary);
  }

  .today-intent-label {
    font-size: var(--text-body);
  }

  .today-intent-count {
    font-variant-numeric: tabular-nums;
    color: var(--text-light, #7A6B58);
  }

  .today-footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }

  .today-footer h3 {
    margin: 0 0 8px;
    font-size: var(--text-body);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-secondary);
  }

  .today-footer p {
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  /* Footer action buttons use canonical .btn .btn--ghost / .btn--danger.
     Only the layout spacing override stays local. */
  .today-footer .btn + .btn { margin-left: 0.5rem; }

  @media (max-width: 640px) {
    .today {
      padding-inline: 16px;
    }

    .today-daily {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
