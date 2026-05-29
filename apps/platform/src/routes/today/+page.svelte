<script lang="ts">
  import { onMount } from 'svelte';
  import { listEventsSince, clearStore, type IntentEvent } from '$lib/intent-store/store';
  import { summarise, labelFor, type DailySummary } from '$lib/intent-store/aggregates';
  import { SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';

  type Window = '24h' | '7d' | '30d';
  const WINDOWS: Record<Window, { label: string; ms: number }> = {
    '24h': { label: 'Today', ms: 24 * 60 * 60 * 1000 },
    '7d': { label: 'This week', ms: 7 * 24 * 60 * 60 * 1000 },
    '30d': { label: 'This month', ms: 30 * 24 * 60 * 60 * 1000 },
  };

  let window: Window = $state('24h');
  let summary: DailySummary | null = $state(null);
  let loading = $state(true);
  let confirmingClear = $state(false);

  // Slugs the platform knows about → for tile lookup. Anything not in
  // here renders with the raw appId, which is fine for third-party.
  const knownSlugs = new Set<string>(SHOWCASE_SLUGS);

  async function refresh() {
    loading = true;
    try {
      const since = Date.now() - WINDOWS[window].ms;
      const events: IntentEvent[] = await listEventsSince(since);
      summary = summarise(events, WINDOWS[window].ms);
    } catch (err) {
      console.warn('[today] could not read intent store', err);
      summary = { windowMs: WINDOWS[window].ms, earliest: null, latest: null, total: 0, apps: [] };
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
    return knownSlugs.has(slug) ? `/run/${slug}` : null;
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
  {:else if !summary || summary.total === 0}
    <section class="today-empty-card">
      <h2>Nothing logged yet.</h2>
      <p>
        Open an app from <a href="/apps">the marketplace</a> and do something — a coffee in Field Kitchen, a journal entry, a workout in Move. Whatever fires shows up here.
      </p>
      <p class="today-foot-note">
        The summary builds itself from intents your apps broadcast. Nothing is sent to a Shippie server. There is no admin who could read it.
      </p>
    </section>
  {:else}
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
      The intent stream is stored in IndexedDB on this device. It never leaves. Shippie has no copy, no aggregator, no cron job that reads it. If you clear it, it's gone.
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
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 0 0 4px;
  }

  .today-head h1 {
    font-family: var(--font-display, 'Fraunces', Georgia, serif);
    font-size: clamp(1.6rem, 4vw, 2.2rem);
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
    background: var(--text);
    color: var(--bg, #14120F);
  }

  .today-empty,
  .today-empty-card {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .today-empty-card {
    border: 1px solid var(--border);
    padding: 24px;
  }

  .today-empty-card h2 {
    margin: 0 0 8px;
    font-weight: 600;
    font-size: 1.2rem;
  }

  .today-empty-card a {
    color: var(--text);
    text-decoration: underline;
  }

  .today-foot-note {
    color: var(--text-light, #7A6B58);
    font-size: 0.875rem;
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
    gap: 12px;
  }

  .today-app-card {
    border: 1px solid var(--border);
    padding: 16px 20px;
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
    font-size: 1.05rem;
  }

  a.today-app-name:hover {
    text-decoration: underline;
  }

  .today-app-meta {
    color: var(--text-light, #7A6B58);
    font-size: 0.875rem;
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
    font-size: 0.95rem;
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
    font-size: 0.95rem;
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
</style>
