<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import AppInspector from '$lib/components/marketplace/AppInspector.svelte';
  import InstallNudge from '$lib/components/marketplace/InstallNudge.svelte';
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
  const filtered = $derived(Boolean(data.query || data.categoryFilter));
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
  const featuredApps = $derived.by(() =>
    (data.featured ?? []).filter((app) => !continueSet.has(app.slug)),
  );
  const featuredSet = $derived.by(() => new Set(featuredApps.map((app) => app.slug)));
  const localApps = $derived.by(() =>
    data.apps
      .filter((app) =>
        (app.kind === 'local' || app.kind === 'connected')
        && !continueSet.has(app.slug)
        && !featuredSet.has(app.slug),
      )
      .slice(0, 8),
  );
  const exploreApps = $derived(data.apps);
  const isFirstVisit = $derived.by(() => {
    const totalLaunches = Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, n) => sum + n, 0);
    return totalLaunches === 0;
  });

  onMount(() => {
    hydrateLauncherMemory();
    void refreshCachedSlugs(data.apps.map((app) => app.slug));
  });

  $effect(() => {
    for (const slug of $launcherMemory.pinned) {
      keepReady(slug);
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

  function pageHref(q: string, page: number, category: string | null | undefined): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('p', String(page));
    if (category) params.set('category', category);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }

  // Categories are a proper toggle: clicking the active chip removes
  // the filter, clicking another swaps. The href is computed from
  // *current* state so the URL params stay in sync.
  function categoryHref(cat: string | null): string {
    const params = new URLSearchParams();
    if (data.query) params.set('q', data.query);
    if (cat) params.set('category', cat);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }
</script>

<svelte:head>
  <title>Shippie — small tools that work on your device</title>
  <meta name="description" content="Tap a tool to use it. They run on your device, work offline, and share local signals when it helps. No signup, no install, no subscription." />
  {#each (data.topFourSlugs ?? []) as slug}
    <link rel="prefetch" href="/run/{slug}/" as="document" />
    <link rel="prefetch" href="/__shippie-run/{slug}/?shippie_embed=1" as="document" />
  {/each}
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="page">
  <header class="head wrap">
    <div class="head-grid">
      <div class="head-copy">
        <p class="eyebrow">Tool launcher</p>
        <h1 class="title">Shippie</h1>
        <p class="lede">
          Tap a tool to use it. They run on your device, work offline, and share local signals when it helps.
        </p>
      </div>
      <div class="head-tools">
        <SearchBar initial={data.query} placeholder="Search tools..." />
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
      </div>
    </div>
  </header>

  {#if isFirstVisit && !filtered}
    <section class="first-visit-hero wrap" aria-label="Welcome">
      <div class="hero-copy">
        <h2>Ship local.</h2>
        <p>Small tools that work on your device, talk to each other locally, and never ask for more than they need.</p>
        <p class="hero-hint">↓ Tap one below.</p>
      </div>
    </section>
  {/if}

  <section class="results wrap-wide">
    {#if filtered}
      <section class="launcher-section primary" aria-labelledby="results-title">
        <div class="section-head">
          <div>
            <h2 id="results-title">{data.query ? `Results for "${data.query}"` : 'Results'}</h2>
            <p>
              {data.apps.length === 0
                ? 'No matching tools yet.'
                : `${data.apps.length} tool${data.apps.length === 1 ? '' : 's'} ready to launch.`}
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
            <a class="page-link" href={pageHref(data.query, data.page - 1, data.categoryFilter)} rel="prev">← Previous</a>
          {:else}
            <span></span>
          {/if}
          {#if data.hasMore}
            <a class="page-link" href={pageHref(data.query, data.page + 1, data.categoryFilter)} rel="next">Next →</a>
          {/if}
        </nav>
      {/if}
    {:else}
      {#if pinnedApps.length > 0}
        <section class="launcher-section pinned-section" aria-labelledby="pinned-title">
          <div class="section-head">
            <div>
              <h2 id="pinned-title">Saved</h2>
              <p>Tools kept ready on this device.</p>
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

      <section class="launcher-section primary" aria-labelledby="continue-title">
        <div class="section-head">
          <div>
            <h2 id="continue-title">{recentApps.length > 0 ? 'Continue' : 'Start'}</h2>
            <p>{recentApps.length > 0 ? 'Most recently opened.' : 'Fast paths into the catalogue.'}</p>
          </div>
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

      {#if featuredApps.length > 0}
        <section class="launcher-section" aria-labelledby="featured-title">
          <div class="section-head">
            <div>
              <h2 id="featured-title">Featured</h2>
              <p>The strongest tools to start with.</p>
            </div>
          </div>
          <ul class="launcher-grid compact-grid" role="list">
            {#each featuredApps as app (app.slug)}
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

      {#if localApps.length > 0}
        <section class="launcher-section" aria-labelledby="local-title">
          <div class="section-head">
            <div>
              <h2 id="local-title">Local</h2>
              <p>Tools with local or nearby-first behaviour.</p>
            </div>
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
            <p>All tools ready to launch.</p>
          </div>
        </div>
        <ul class="launcher-grid compact-grid" role="list">
          {#each exploreApps as app (app.slug)}
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

      {#if data.page > 1 || data.hasMore}
        <nav class="pager" aria-label="Pagination">
          {#if data.page > 1}
            <a class="page-link" href={pageHref(data.query, data.page - 1, data.categoryFilter)} rel="prev">← Previous</a>
          {:else}
            <span></span>
          {/if}
          {#if data.hasMore}
            <a class="page-link" href={pageHref(data.query, data.page + 1, data.categoryFilter)} rel="next">Next →</a>
          {/if}
        </nav>
      {/if}
    {/if}
  </section>

  <section class="builder-strip wrap" aria-labelledby="builder-strip-title">
    <div>
      <p class="eyebrow">For builders</p>
      <h2 id="builder-strip-title">Ship a tool.</h2>
      <p>Built with HTML and one SDK. Shippie adds offline, haptics, local data, and proof — automatically.</p>
    </div>
    <a class="builder-strip-cta" href="/build">Start building →</a>
  </section>
  <div class="wrap">
    <InstallNudge />
  </div>
</div>

<AppInspector
  app={selectedApp}
  pinned={selectedApp ? pinnedSet.has(selectedApp.slug) : false}
  onClose={closeInspector}
/>

<style>
  .page {
    padding-top: var(--space-xl);
    /* Bottom padding includes the iOS home-indicator safe area so the
       last row of cards never clips. max() keeps the existing visual
       breathing room as the floor. */
    padding-bottom: max(var(--space-3xl), env(safe-area-inset-bottom, 0px));
  }
  .head {
    padding-bottom: var(--space-lg);
    border-bottom: 1px solid var(--border-light);
  }
  .head-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(320px, 0.72fr);
    gap: var(--space-xl);
    align-items: end;
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0 0 0.55rem;
  }
  .head-copy {
    max-width: 36rem;
  }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2.45rem, 5vw, 4.5rem);
    letter-spacing: 0;
    line-height: 0.94;
    margin: 0;
  }
  .lede {
    color: var(--text-secondary);
    margin: var(--space-md) 0 0;
    max-width: 34rem;
    font-size: var(--small-size);
    line-height: 1.55;
  }
  .head-tools {
    width: min(100%, 36rem);
    justify-self: end;
    display: grid;
    gap: var(--space-sm);
  }
  .head-tools :global(.search-form) {
    max-width: none;
    background: rgba(30, 26, 21, 0.28);
  }
  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .cats a,
  .cats .cat-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    /* Apple HIG floor: 44px tap target. Below this, mis-taps register
       on the chip border instead of the label, especially on notched
       devices held in the thumb arc. */
    min-height: 44px;
    padding: 0 14px;
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
  .results { padding-top: var(--space-lg); }
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
  /* Wide-viewport progression — only meaningful inside .wrap-wide;
     the apex page upgrades its container to wrap-wide so these
     queries actually have room to expand. */
  @media (min-width: 1280px) { .launcher-grid.featured { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 1536px) { .launcher-grid.featured { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (min-width: 1920px) { .launcher-grid.featured { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
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
    .head-copy {
      max-width: none;
    }
    .head-tools {
      width: 100%;
      justify-self: stretch;
    }
    .cats {
      justify-content: flex-start;
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
    .page {
      padding-top: var(--space-lg);
    }
    .title {
      font-size: clamp(2.4rem, 18vw, 3.7rem);
    }
    .cats {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .cats::-webkit-scrollbar {
      display: none;
    }
    .cats li {
      flex: 0 0 auto;
    }
  }

  /* First-visit hero — shows once, hides after launchCounts > 0 */
  .first-visit-hero {
    padding: var(--space-lg) 0 var(--space-md);
    border-bottom: 1px solid var(--border-light);
    margin-bottom: var(--space-md);
  }
  .first-visit-hero .hero-copy {
    max-width: 32rem;
  }
  .first-visit-hero h2 {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 5vw, 2.5rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1;
    margin: 0 0 var(--space-sm);
    color: var(--text);
  }
  .first-visit-hero p {
    margin: 0 0 var(--space-xs);
    color: var(--text-secondary);
    font-size: 1.05rem;
    line-height: 1.45;
  }
  .first-visit-hero .hero-hint {
    margin-top: var(--space-sm);
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    letter-spacing: 0.06em;
  }

  /* Builder strip — quiet maker CTA at the bottom of the launcher */
  .builder-strip {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-md);
    align-items: end;
    margin-top: var(--space-2xl);
    padding: var(--space-xl) var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: 0;
  }
  @media (min-width: 720px) {
    .builder-strip {
      grid-template-columns: 1fr auto;
    }
  }
  .builder-strip h2 {
    font-family: var(--font-heading);
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: var(--space-xs) 0;
    color: var(--text);
  }
  .builder-strip p {
    margin: 0;
    color: var(--text-secondary);
    max-width: 40rem;
  }
  .builder-strip-cta {
    display: inline-block;
    padding: var(--space-md) var(--space-lg);
    background: var(--sunset);
    color: var(--bg);
    font-family: var(--font-body);
    font-weight: 600;
    white-space: nowrap;
  }
  .builder-strip-cta:hover {
    background: var(--sunset-hover);
  }
</style>
