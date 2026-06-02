<script lang="ts">
  import { onMount } from 'svelte';
  import { listEventsSince, type IntentEvent } from '$lib/intent-store/store';
  import { summarise, labelFor, type DailySummary } from '$lib/intent-store/aggregates';
  import {
    buildDailyNarrative,
    buildSevenDayPattern,
    findQuietApps,
    type DailyNarrative,
    type SevenDayPattern,
    type QuietApp,
  } from '$lib/intent-store/narrative';
  import { SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';

  const knownSlugs = new Set<string>(SHOWCASE_SLUGS);
  const DAY_MS = 24 * 60 * 60 * 1000;

  let loading = $state(true);
  let narrative: DailyNarrative | null = $state(null);
  let todaySummary: DailySummary | null = $state(null);
  let pattern: SevenDayPattern[] = $state([]);
  let quiet: QuietApp[] = $state([]);

  function appSlug(appId: string): string {
    return appId.replace(/^app_/, '').replace(/_/g, '-');
  }
  function appLabel(appId: string): string {
    const s = appSlug(appId);
    return knownSlugs.has(s) ? s.replace(/-/g, ' ') : appId;
  }
  function appHref(appId: string): string | null {
    const s = appSlug(appId);
    return knownSlugs.has(s) ? `/dock?app=${encodeURIComponent(s)}` : null;
  }

  async function refresh() {
    loading = true;
    try {
      const todayEvents: IntentEvent[] = await listEventsSince(Date.now() - DAY_MS);
      const weekEvents: IntentEvent[] = await listEventsSince(Date.now() - 30 * DAY_MS);
      narrative = buildDailyNarrative(todayEvents);
      todaySummary = summarise(todayEvents, DAY_MS);
      pattern = buildSevenDayPattern(weekEvents);
      quiet = findQuietApps(weekEvents);
    } catch (err) {
      console.warn('[glance] could not read intent store', err);
      narrative = { headline: 'Nothing yet today.', fragments: [], empty: true };
      todaySummary = { windowMs: DAY_MS, earliest: null, latest: null, total: 0, apps: [] };
      pattern = [];
      quiet = [];
    } finally {
      loading = false;
    }
  }

  function dayLabel(daysAgoFromNow: number): string {
    if (daysAgoFromNow === 0) return 'today';
    if (daysAgoFromNow === 1) return 'yesterday';
    const date = new Date(Date.now() - daysAgoFromNow * DAY_MS);
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  onMount(() => {
    void refresh();
  });
</script>

<svelte:head>
  <title>Glance · Shippie</title>
  <meta
    name="description"
    content="A morning glance at what your apps did. On your device, never on a Shippie server."
  />
</svelte:head>

<main class="glance">
  <header class="glance-head">
    <p class="glance-eyebrow">Glance</p>
    <h1 class="glance-headline">
      {#if loading}
        Reading the day…
      {:else if narrative}
        {narrative.headline}
      {/if}
    </h1>
    <p class="glance-sub">
      A summary across every Shippie app. The intent stream lives on this device — no Shippie server sees it.
      <a href="/today" class="glance-detail-link">See full activity →</a>
    </p>
  </header>

  {#if !loading && narrative?.empty}
    <section class="glance-empty">
      <h2>Nothing logged yet.</h2>
      <p>
        Open an app from <a href="/tools">Tools</a> and do something — a coffee in Palate, a journal entry, a workout in Lift. Whatever fires shows up here.
      </p>
    </section>
  {:else if !loading}
    <section class="glance-section">
      <h2 class="glance-section-title">Most-used apps today</h2>
      {#if todaySummary && todaySummary.apps.length > 0}
        <div class="glance-app-grid">
          {#each todaySummary.apps.slice(0, 6) as app (app.appId)}
            {@const href = appHref(app.appId)}
            <article class="glance-app-card">
              <header>
                {#if href}
                  <a href={href} class="glance-app-name">{appLabel(app.appId)}</a>
                {:else}
                  <span class="glance-app-name">{appLabel(app.appId)}</span>
                {/if}
                <span class="glance-app-count">{app.count}</span>
              </header>
              {#if app.intents[0]}
                <p class="glance-app-top-intent">{labelFor(app.intents[0]!.intent)}</p>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <p class="glance-muted">Nothing in the last 24 hours.</p>
      {/if}
    </section>

    <section class="glance-section">
      <h2 class="glance-section-title">This week's pattern</h2>
      {#if pattern.length > 0}
        <ul class="glance-pattern">
          {#each pattern.slice(0, 8) as p (p.appId)}
            {@const href = appHref(p.appId)}
            <li class="glance-pattern-row">
              <div class="glance-pattern-label">
                {#if href}
                  <a href={href}>{appLabel(p.appId)}</a>
                {:else}
                  <span>{appLabel(p.appId)}</span>
                {/if}
                <span class="glance-pattern-total">{p.total}</span>
              </div>
              <div class="glance-pattern-bars" aria-label={`Last 7 days for ${appLabel(p.appId)}`}>
                {#each p.daily as count, i}
                  <span
                    class="glance-pattern-bar"
                    style:height={`${Math.min(100, count * 16 + (count > 0 ? 6 : 2))}%`}
                    data-empty={count === 0}
                    title={`${dayLabel(6 - i)}: ${count}`}
                  ></span>
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="glance-muted">Need a few days of activity before this fills in.</p>
      {/if}
    </section>

    {#if quiet.length > 0}
      <section class="glance-section">
        <h2 class="glance-section-title">Gone quiet</h2>
        <p class="glance-muted">Apps you haven't opened in over a week. Use them or hide them — your call.</p>
        <ul class="glance-quiet">
          {#each quiet.slice(0, 5) as q (q.appId)}
            {@const href = appHref(q.appId)}
            <li>
              {#if href}
                <a href={href}>{appLabel(q.appId)}</a>
              {:else}
                <span>{appLabel(q.appId)}</span>
              {/if}
              <span class="glance-quiet-since">{q.daysSinceLastUse}d ago</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}

  <footer class="glance-footer">
    <p class="glance-foot-note">
      Glance reads from IndexedDB on this device. Nothing is sent to a Shippie server. There is no admin who could read it.
    </p>
  </footer>
</main>

<style>
  .glance {
    max-width: 760px;
    margin: 0 auto;
    padding: 32px 24px 96px;
    color: var(--text);
  }
  .glance-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin: 0 0 8px;
  }
  .glance-headline {
    font-family: var(--font-display, 'Fraunces', Georgia, serif);
    font-size: clamp(1.6rem, 5vw, 2.4rem);
    font-weight: 600;
    margin: 0 0 12px;
    line-height: 1.25;
  }
  .glance-sub {
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 32px;
  }
  .glance-detail-link {
    color: var(--text);
    text-decoration: underline;
    margin-left: 8px;
  }
  .glance-section {
    margin-bottom: 40px;
  }
  .glance-section-title {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-secondary);
    margin: 0 0 12px;
    font-weight: 600;
  }
  .glance-empty {
    border: 1px solid var(--border);
    padding: 24px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .glance-empty h2 {
    margin: 0 0 8px;
  }
  .glance-empty a {
    color: var(--text);
    text-decoration: underline;
  }
  .glance-muted {
    color: var(--text-light, #7A6B58);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0 0 12px;
  }
  .glance-app-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .glance-app-card {
    border: 1px solid var(--border);
    padding: 14px 16px;
  }
  .glance-app-card header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .glance-app-name {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    text-transform: capitalize;
  }
  a.glance-app-name:hover {
    text-decoration: underline;
  }
  .glance-app-count {
    font-variant-numeric: tabular-nums;
    color: var(--text-light, #7A6B58);
    font-size: 0.875rem;
  }
  .glance-app-top-intent {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }
  .glance-pattern {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .glance-pattern-row {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 16px;
    align-items: center;
  }
  .glance-pattern-label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    color: var(--text);
    text-transform: capitalize;
  }
  .glance-pattern-label a {
    color: var(--text);
    text-decoration: none;
  }
  .glance-pattern-label a:hover {
    text-decoration: underline;
  }
  .glance-pattern-total {
    color: var(--text-light, #7A6B58);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .glance-pattern-bars {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    height: 32px;
    align-items: end;
  }
  .glance-pattern-bar {
    background: var(--text);
    width: 100%;
    transition: height 0.2s ease;
    align-self: end;
  }
  .glance-pattern-bar[data-empty='true'] {
    background: var(--border);
  }
  .glance-quiet {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .glance-quiet li {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-light, var(--border));
    text-transform: capitalize;
  }
  .glance-quiet a {
    color: var(--text);
    text-decoration: none;
  }
  .glance-quiet a:hover {
    text-decoration: underline;
  }
  .glance-quiet-since {
    color: var(--text-light, #7A6B58);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }
  .glance-footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }
  .glance-foot-note {
    color: var(--text-light, #7A6B58);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }
</style>
