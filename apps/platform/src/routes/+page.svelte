<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import AppInspector from '$lib/components/marketplace/AppInspector.svelte';
  import InstallNudge from '$lib/components/marketplace/InstallNudge.svelte';
  import LauncherCard from '$lib/components/marketplace/LauncherCardV2.svelte';
  import SavedDock from '$lib/components/marketplace/SavedDock.svelte';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';
  import { displayCategory } from '$lib/marketplace/display-text';
  import { suggestApps, suggestCategories } from '$lib/marketplace/search-fallback';
  // Randomiser hero retired from the home page — too prominent + the
  // wheel mostly read empty for first-visit users. Lives at /today
  // (or wherever a "your other apps" surface lands later) instead.
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
  /** First-run spotlight. Picks the strongest featured demo when the
      user has nothing in Continue yet. Renders inside Start as a v2
      card with spotlight=true. */
  const spotlightApp = $derived.by(() => {
    if (!isFirstVisit || recentApps.length > 0) return null;
    const preferred = ['snake', 'recipe', 'crewtrip'];
    for (const slug of preferred) {
      const found = appBySlug.get(slug);
      if (found) return found;
    }
    return (data.featured ?? [])[0] ?? null;
  });
  const continueDisplayApps = $derived.by(() =>
    spotlightApp
      ? continueApps.filter((app) => app.slug !== spotlightApp.slug)
      : continueApps,
  );
  const fallbackApps = $derived.by(() =>
    filtered && data.apps.length === 0 && data.query
      ? suggestApps(data.query, data.suggestionPool ?? [], 4)
      : [],
  );
  const fallbackCategories = $derived.by(() =>
    filtered && data.apps.length === 0 && data.query
      ? suggestCategories(data.query, data.categories ?? [], 3)
      : [],
  );
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
    // Active category chip auto-centers in the horizontal scroll rail
    // on mobile so the user can see which filter they're on.
    requestAnimationFrame(() => {
      const active = document.querySelector('.cats .cat-chip.active');
      if (active && 'scrollIntoView' in active) {
        try {
          (active as HTMLElement).scrollIntoView({ inline: 'center', block: 'nearest' });
        } catch {
          /* older browsers: no-op */
        }
      }
    });
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
    <link rel="prefetch" href="/run/{slug}" as="document" />
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
                  {displayCategory(cat)}{#if isActive} ✕{/if}
                </a>
              </li>
            {/each}
            <li>
              <a class="cat-chip cat-chip-link" href="/docs#getting-started">
                Build a tool →
              </a>
            </li>
          </ul>
        {/if}
      </div>
    </div>
  </header>

  <section class="results wrap-wide">
    {#if filtered}
      <section class="launcher-section primary" aria-labelledby="results-title">
        <div class="section-head">
          <h2 id="results-title">
            {data.apps.length === 0 && data.query
              ? `No matches for "${data.query}"`
              : data.query
              ? `Results for "${data.query}"`
              : 'Results'}
          </h2>
          <span class="section-hint">
            {data.apps.length === 0
              ? 'no matches'
              : `${data.apps.length} tool${data.apps.length === 1 ? '' : 's'}`}
          </span>
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
        {:else}
          <div class="empty-state">
            <p class="empty-lede">
              Nothing in the catalogue matches that yet.
              {#if fallbackApps.length > 0}
                Try one of these, or browse a category:
              {:else}
                Try a different word, or browse a category:
              {/if}
              <a class="empty-clear" href={pageHref('', 1, data.categoryFilter)}>clear search →</a>
            </p>
            {#if fallbackApps.length > 0}
              <ul class="launcher-grid compact-grid" role="list">
                {#each fallbackApps as app (app.slug)}
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
            {#if fallbackCategories.length > 0}
              <ul class="empty-cats" aria-label="Suggested categories">
                {#each fallbackCategories as cat (cat)}
                  <li>
                    <a class="cat-chip" href={categoryHref(cat)}>{displayCategory(cat)}</a>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
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
        <SavedDock apps={pinnedApps} />
      {/if}

      <section class="launcher-section primary" aria-labelledby="continue-title">
        <div class="section-head">
          <h2 id="continue-title">{recentApps.length > 0 ? 'Continue' : 'Start'}</h2>
          <span class="section-hint">
            {recentApps.length > 0 ? 'most recent' : 'no signup · offline · open source'}
          </span>
        </div>
        {#if spotlightApp}
          <LauncherCard
            app={spotlightApp}
            pinned={pinnedSet.has(spotlightApp.slug)}
            spotlight
            recentLabel="Start here"
            onInspect={() => inspectApp(spotlightApp)}
            onTogglePin={togglePinnedApp}
          />
        {/if}
        <ul class="launcher-grid featured" role="list">
          {#each continueDisplayApps as app (app.slug)}
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
            <h2 id="featured-title">Featured</h2>
            <span class="section-hint">strongest demos</span>
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
            <h2 id="local-title">Local</h2>
            <span class="section-hint">runs on your device</span>
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
          <h2 id="explore-title">Explore</h2>
          <span class="section-hint">all tools</span>
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
  .cats .cat-chip-link {
    /* Wayfinding chip — same shape as the topical chips so it sits
       comfortably in the row, but coloured with the accent border to
       signal "this navigates" rather than "this filters". */
    color: var(--sunset);
    border-color: var(--sunset);
  }
  .cats .cat-chip-link:hover { background: var(--sunset); color: var(--bg-pure); }
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
    align-items: baseline;
    gap: var(--space-md);
  }
  .section-head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .section-hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
    letter-spacing: 0;
    text-align: right;
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
  @media (max-width: 1024px) {
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
  @media (max-width: 640px) {
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
      font-size: clamp(2.2rem, 12vw, 2.8rem);
      line-height: 1;
    }
    .cats {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(to right, #000 92%, transparent);
      mask-image: linear-gradient(to right, #000 92%, transparent);
    }
    .cats::-webkit-scrollbar {
      display: none;
    }
    .cats li {
      flex: 0 0 auto;
    }
  }

  /* Empty / search-fallback state */
  .empty-state { display: grid; gap: var(--space-md); }
  .empty-lede {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
    max-width: 56ch;
  }
  .empty-clear {
    display: inline-block;
    margin-left: 0.4rem;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--sunset);
    text-decoration: none;
  }
  .empty-clear:hover { text-decoration: underline; }
  .empty-cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
  @media (min-width: 641px) {
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
