<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import AppInspector from '$lib/components/marketplace/AppInspector.svelte';
  import LauncherCard from '$lib/components/marketplace/LauncherCard.svelte';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';
  import { ensureAppOffline, refreshCachedSlugs } from '$lib/stores/cached-slugs';
  import {
    hydrateLauncherMemory,
    launcherMemory,
    togglePinnedApp,
  } from '$lib/stores/launcher-memory';

  let { data }: PageProps = $props();
  let selectedSlug = $state<string | null>(null);
  const autoSaving = new Set<string>();

  type LauncherApp = (typeof data.apps)[number];

  const appBySlug = $derived.by(() => new Map(data.apps.map((app) => [app.slug, app])));
  const selectedApp = $derived(selectedSlug ? (appBySlug.get(selectedSlug) ?? null) : null);
  const filtered = $derived(Boolean(data.query || data.kindFilter || data.categoryFilter));
  const pinnedSet = $derived.by(() => new Set($launcherMemory.pinned));
  const pinnedApps = $derived.by(() =>
    $launcherMemory.pinned
      .map((slug) => appBySlug.get(slug))
      .filter((app): app is LauncherApp => Boolean(app)),
  );
  const recentApps = $derived.by(() =>
    $launcherMemory.recents
      .map((recent) => appBySlug.get(recent.slug))
      .filter((app): app is LauncherApp => Boolean(app)),
  );
  const continueApps = $derived.by(() => {
    const source = recentApps.length > 0 ? recentApps : data.apps;
    return source.slice(0, 4);
  });
  const continueSet = $derived.by(() => new Set(continueApps.map((app) => app.slug)));
  const localApps = $derived.by(() =>
    data.apps
      .filter((app) => (app.kind === 'local' || app.kind === 'connected') && !continueSet.has(app.slug))
      .slice(0, 8),
  );
  const localSet = $derived.by(() => new Set(localApps.map((app) => app.slug)));
  const exploreApps = $derived.by(() =>
    data.apps
      .filter((app) => !pinnedSet.has(app.slug) && !continueSet.has(app.slug) && !localSet.has(app.slug))
      .slice(0, 12),
  );

  onMount(() => {
    hydrateLauncherMemory();
    void refreshCachedSlugs(data.apps.map((app) => app.slug));
  });

  $effect(() => {
    for (const slug of $launcherMemory.pinned) {
      keepReady(slug);
    }
    for (const app of recentApps) {
      if (($launcherMemory.launchCounts[app.slug] ?? 0) >= 2) {
        keepReady(app.slug);
      }
    }
  });

  function inspectApp(app: LauncherApp) {
    selectedSlug = app.slug;
  }

  function closeInspector() {
    selectedSlug = null;
  }

  function keepReady(slug: string) {
    if (!appBySlug.has(slug) || autoSaving.has(slug)) return;
    autoSaving.add(slug);
    void ensureAppOffline(slug)
      .catch(() => {})
      .finally(() => {
        autoSaving.delete(slug);
      });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeInspector();
  }

  function recentLabel(slug: string): string {
    const recent = $launcherMemory.recents.find((item) => item.slug === slug);
    if (!recent) return '';
    const opened = new Date(recent.lastOpened);
    if (Number.isNaN(opened.getTime())) return 'Recent';
    const diff = Date.now() - opened.getTime();
    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
  }

  function pageHref(q: string, page: number, kind: string | null | undefined, category: string | null | undefined): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('p', String(page));
    if (kind) params.set('kind', kind);
    if (category) params.set('category', category);
    const qs = params.toString();
    return qs ? `/apps?${qs}` : '/apps';
  }

  function kindHref(kind: string | null): string {
    const params = new URLSearchParams();
    if (data.query) params.set('q', data.query);
    if (kind) params.set('kind', kind);
    if (data.categoryFilter) params.set('category', data.categoryFilter);
    const qs = params.toString();
    return qs ? `/apps?${qs}` : '/apps';
  }

  // Categories are a proper toggle: clicking the active chip removes
  // the filter, clicking another swaps. The href is computed from
  // *current* state so the URL params stay in sync.
  function categoryHref(cat: string | null): string {
    const params = new URLSearchParams();
    if (data.query) params.set('q', data.query);
    if (data.kindFilter) params.set('kind', data.kindFilter);
    if (cat) params.set('category', cat);
    const qs = params.toString();
    return qs ? `/apps?${qs}` : '/apps';
  }
</script>

<svelte:head>
  <title>Apps on Shippie</title>
  <meta name="description" content="Vibecoded apps, on your phone in 60 seconds. No app store. Just the web, installed." />
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="page">
  <header class="head wrap">
    <p class="eyebrow">
      <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
      App launcher
    </p>
    <div class="head-grid">
      <div>
        <h1 class="title">Shippie</h1>
        <p class="lede">
          Open your local-first apps, inspect their data shape, and share what is worth keeping.
        </p>
      </div>
      <div class="search-row">
        <SearchBar initial={data.query} placeholder="Launch or find an app..." />
      </div>
    </div>
    <ul class="kind-filter" aria-label="Filter by app kind">
      <li>
        <a class="chip" class:active={!data.kindFilter} href={kindHref(null)}>All</a>
      </li>
      <li>
        <a class="chip kind-local" class:active={data.kindFilter === 'local'} href={kindHref('local')}>Local</a>
      </li>
      <li>
        <a class="chip kind-connected" class:active={data.kindFilter === 'connected'} href={kindHref('connected')}>Connected</a>
      </li>
      <li>
        <a class="chip kind-cloud" class:active={data.kindFilter === 'cloud'} href={kindHref('cloud')}>Cloud</a>
      </li>
      {#if filtered}
        <li>
          <a class="chip reset" href="/apps">Reset</a>
        </li>
      {/if}
    </ul>
    {#if data.categories.length > 0}
      <ul class="cats" aria-label="Browse categories">
        <li>
          <a class="cat-chip" class:active={!data.categoryFilter} href={categoryHref(null)}>All</a>
        </li>
        {#each data.categories as cat (cat)}
          {@const isActive = data.categoryFilter === cat}
          <li>
            <a
              class="cat-chip"
              class:active={isActive}
              href={categoryHref(isActive ? null : cat)}
              aria-current={isActive ? 'page' : undefined}
            >
              {cat}{#if isActive} ✕{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </header>

  <section class="results wrap">
    {#if filtered}
      <section class="launcher-section primary" aria-labelledby="results-title">
        <div class="section-head">
          <div>
            <h2 id="results-title">{data.query ? `Results for "${data.query}"` : 'Results'}</h2>
            <p>
              {data.apps.length === 0
                ? 'No matching apps yet.'
                : `${data.apps.length} app${data.apps.length === 1 ? '' : 's'} ready to launch.`}
            </p>
          </div>
        </div>
        {#if data.apps.length > 0}
          <ul class="launcher-grid compact-grid" role="list">
            {#each data.apps as app (app.slug)}
              <li>
                <LauncherCard
                  {app}
                  pinned={pinnedSet.has(app.slug)}
                  compact
                  recentLabel={recentLabel(app.slug)}
                  onInspect={() => inspectApp(app)}
                  onTogglePin={togglePinnedApp}
                />
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if data.page > 1 || data.hasMore}
        <nav class="pager" aria-label="Pagination">
          {#if data.page > 1}
            <a class="page-link" href={pageHref(data.query, data.page - 1, data.kindFilter, data.categoryFilter)} rel="prev">← Previous</a>
          {:else}
            <span></span>
          {/if}
          {#if data.hasMore}
            <a class="page-link" href={pageHref(data.query, data.page + 1, data.kindFilter, data.categoryFilter)} rel="next">Next →</a>
          {/if}
        </nav>
      {/if}
    {:else}
      <section class="launcher-section primary" aria-labelledby="continue-title">
        <div class="section-head">
          <div>
            <h2 id="continue-title">{recentApps.length > 0 ? 'Continue' : 'Start'}</h2>
            <p>{recentApps.length > 0 ? 'Most recently opened.' : 'Fast paths into the catalogue.'}</p>
          </div>
          <a href="/container">Switch apps</a>
        </div>
        <ul class="launcher-grid featured" role="list">
          {#each continueApps as app (app.slug)}
            <li>
              <LauncherCard
                {app}
                pinned={pinnedSet.has(app.slug)}
                recentLabel={recentLabel(app.slug)}
                onInspect={() => inspectApp(app)}
                onTogglePin={togglePinnedApp}
              />
            </li>
          {/each}
        </ul>
      </section>

      {#if pinnedApps.length > 0}
        <section class="launcher-section" aria-labelledby="pinned-title">
          <div class="section-head">
            <div>
              <h2 id="pinned-title">Pinned</h2>
              <p>Your saved launch row.</p>
            </div>
          </div>
          <ul class="launcher-grid compact-grid" role="list">
            {#each pinnedApps as app (app.slug)}
              <li>
                <LauncherCard
                  {app}
                  pinned
                  compact
                  recentLabel={recentLabel(app.slug)}
                  onInspect={() => inspectApp(app)}
                  onTogglePin={togglePinnedApp}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if localApps.length > 0}
        <section class="launcher-section" aria-labelledby="local-title">
          <div class="section-head">
            <div>
              <h2 id="local-title">Local</h2>
              <p>Apps with local or nearby-first behaviour.</p>
            </div>
            <a href={kindHref('local')}>View local</a>
          </div>
          <ul class="launcher-grid compact-grid" role="list">
            {#each localApps as app (app.slug)}
              <li>
                <LauncherCard
                  {app}
                  pinned={pinnedSet.has(app.slug)}
                  compact
                  recentLabel={recentLabel(app.slug)}
                  onInspect={() => inspectApp(app)}
                  onTogglePin={togglePinnedApp}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="launcher-section" aria-labelledby="explore-title">
        <div class="section-head">
          <div>
            <h2 id="explore-title">Explore</h2>
            <p>Everything else ready to launch.</p>
          </div>
        </div>
        <ul class="launcher-grid compact-grid" role="list">
          {#each exploreApps as app (app.slug)}
            <li>
              <LauncherCard
                {app}
                pinned={pinnedSet.has(app.slug)}
                compact
                onInspect={() => inspectApp(app)}
                onTogglePin={togglePinnedApp}
              />
            </li>
          {/each}
        </ul>
      </section>

      {#if data.page > 1 || data.hasMore}
        <nav class="pager" aria-label="Pagination">
          {#if data.page > 1}
            <a class="page-link" href={pageHref(data.query, data.page - 1, data.kindFilter, data.categoryFilter)} rel="prev">← Previous</a>
          {:else}
            <span></span>
          {/if}
          {#if data.hasMore}
            <a class="page-link" href={pageHref(data.query, data.page + 1, data.kindFilter, data.categoryFilter)} rel="next">Next →</a>
          {/if}
        </nav>
      {/if}
    {/if}
  </section>
</div>

<AppInspector
  app={selectedApp}
  pinned={selectedApp ? pinnedSet.has(selectedApp.slug) : false}
  onClose={closeInspector}
/>

<style>
  .page {
    padding-top: var(--space-xl);
    padding-bottom: var(--space-3xl);
  }
  .head { padding-bottom: var(--space-lg); }
  .head-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 480px);
    gap: var(--space-xl);
    align-items: end;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0 0 0.55rem;
  }
  .eyebrow img { display: block; }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 4vw, 2.85rem);
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede {
    color: var(--text-secondary);
    margin: 0.65rem 0 0;
    max-width: 620px;
    font-size: var(--small-size);
  }
  .search-row {
    display: flex;
    justify-content: flex-end;
  }
  .kind-filter {
    list-style: none;
    margin: 0 0 var(--space-md);
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    padding: 4px 12px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-light);
    border: 1px solid var(--border);
    border-radius: 0;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .chip:hover { color: var(--sunset); border-color: var(--sunset); }
  .chip.active {
    background: var(--text);
    color: var(--bg-pure);
    border-color: var(--text);
  }
  .chip.kind-local.active { background: var(--sage-moss); border-color: var(--sage-moss); }
  .chip.kind-connected.active { background: var(--sunset); border-color: var(--sunset); color: var(--text); }
  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .cats a,
  .cats .cat-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    border: 1px solid var(--border-light);
    border-radius: 0;
    text-decoration: none;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .cats a:hover,
  .cats .cat-chip:hover { color: var(--sunset); border-color: var(--sunset); }
  .cats .cat-chip.active {
    color: var(--bg-pure);
    background: var(--text);
    border-color: var(--text);
  }
  .results { padding-top: 0; }
  .launcher-section {
    display: grid;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }
  .launcher-section.primary {
    margin-bottom: var(--space-xl);
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--space-md);
  }
  .section-head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.35rem;
    letter-spacing: -0.01em;
  }
  .section-head p {
    margin: 0.3rem 0 0;
    color: var(--text-light);
    font-size: var(--small-size);
  }
  .section-head a {
    flex-shrink: 0;
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.45rem 0.7rem;
    cursor: pointer;
  }
  .section-head a:hover {
    color: var(--sunset);
    border-color: var(--sunset);
  }
  .launcher-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-md);
  }
  .launcher-grid.featured {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .compact-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
  .pager {
    margin-top: var(--space-2xl);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
  }
  .page-link {
    font-family: var(--font-mono);
    font-size: var(--small-size);
    color: var(--sunset);
  }
  @media (max-width: 820px) {
    .head-grid,
    .launcher-grid.featured {
      grid-template-columns: 1fr;
    }
    .search-row {
      justify-content: stretch;
    }
  }
  @media (max-width: 560px) {
    .section-head {
      align-items: start;
      flex-direction: column;
    }
    .compact-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
