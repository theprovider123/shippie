<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import AppInspector from '$lib/components/marketplace/AppInspector.svelte';
  import SavedDock from '$lib/components/marketplace/SavedDock.svelte';
  import {
    ToolTile,
    launcherAppToToolTile,
  } from '$lib/components/tool-surface';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';
  import { displayCategory } from '$lib/marketplace/display-text';
  import { suggestApps, suggestCategories } from '$lib/marketplace/search-fallback';
  // Randomiser hero retired from the home page — too prominent + the
  // wheel mostly read empty for first-visit users. Lives at /today
  // (or wherever a "your other apps" surface lands later) instead.
  import { refreshCachedSlugs } from '$lib/stores/cached-slugs';
  import {
    hydrateLauncherMemory,
    launcherMemory,
    toggleSavedApp,
  } from '$lib/stores/launcher-memory';
  import { startCatalogSync } from '$lib/client/catalog-sync';

  let { data }: PageProps = $props();
  let selectedSlug = $state<string | null>(null);
  // A reactive heartbeat: bumps every minute so recency labels age in
  // place instead of being stuck at "1m" for the whole session.
  // We only tick when the document is visible — no point burning a
  // wakeup on a backgrounded tab.
  let recencyTick = $state(0);

  type LauncherApp = (typeof data.apps)[number];

  const appBySlug = $derived.by(() => new Map(data.apps.map((app) => [app.slug, app])));
  const selectedApp = $derived(selectedSlug ? (appBySlug.get(selectedSlug) ?? null) : null);
  const filtered = $derived(Boolean(data.query || data.categoryFilter || data.remixableFilter));
  const savedSet = $derived.by(() => new Set($launcherMemory.saved));
  const savedApps = $derived.by(() =>
    $launcherMemory.saved
      .map((slug) => appBySlug.get(slug))
      .filter((app): app is LauncherApp => Boolean(app)),
  );
  const recentApps = $derived.by(() =>
    $launcherMemory.recents
      .map((recent) => appBySlug.get(recent.slug))
      .filter((app): app is LauncherApp => Boolean(app)),
  );
  const starterApps = $derived.by(() =>
    data.featured.length > 0 ? data.featured : data.apps.slice(0, 4),
  );
  const continueApps = $derived.by(() =>
    recentApps.length > 0 ? recentApps.slice(0, 4) : starterApps,
  );
  const continueDisplayApps = $derived(continueApps);
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
  const browseApps = $derived.by(() =>
    data.apps.filter((app) => !continueSet.has(app.slug)),
  );
  // Pre-build a slug→recency-label map so each tile reads in O(1) instead
  // of doing Array.find against the recents list. With 60+ tiles and ~12
  // recents the savings compound on every store tick.
  const recentLabelBySlug = $derived.by(() => {
    // Read recencyTick so this derived re-runs on the heartbeat above.
    void recencyTick;
    const out = new Map<string, string>();
    const now = Date.now();
    for (const item of $launcherMemory.recents) {
      const opened = new Date(item.lastOpened).getTime();
      if (Number.isNaN(opened)) {
        out.set(item.slug, 'Recent');
        continue;
      }
      const diff = now - opened;
      const minutes = Math.max(1, Math.round(diff / 60000));
      if (minutes < 60) out.set(item.slug, `${minutes}m`);
      else {
        const hours = Math.round(minutes / 60);
        if (hours < 24) out.set(item.slug, `${hours}h`);
        else out.set(item.slug, `${Math.round(hours / 24)}d`);
      }
    }
    return out;
  });
  const isFirstVisit = $derived.by(() => {
    const totalLaunches = Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, n) => sum + n, 0);
    return totalLaunches === 0;
  });
  const hasLauncherHistory = $derived(!isFirstVisit || savedApps.length > 0 || recentApps.length > 0);

  onMount(() => {
    hydrateLauncherMemory();
    const stopCatalogSync = startCatalogSync();
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
    // Pulse the recency-tick once a minute while the tab is visible.
    // The derived label map reads it, so tiles re-display "2m" -> "3m"
    // without keeping a per-tile timer.
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (timer) return;
      timer = setInterval(() => {
        recencyTick += 1;
      }, 60_000);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else {
        recencyTick += 1;
        start();
      }
    }
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      stopCatalogSync();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  function inspectApp(app: LauncherApp) {
    selectedSlug = app.slug;
  }

  function closeInspector() {
    selectedSlug = null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    // Escape on the page closes the inspector, but only when no editable
    // element owns the keystroke. Otherwise Escape clobbers typing
    // flows (search bar, comment fields) with no visible reason.
    if (selectedSlug === null) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
    }
    closeInspector();
  }

  function recentLabel(slug: string): string {
    return recentLabelBySlug.get(slug) ?? '';
  }

  function pageHref(
    q: string,
    page: number,
    category: string | null | undefined,
    remixable = data.remixableFilter,
  ): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('p', String(page));
    if (category) params.set('category', category);
    if (remixable) params.set('remixable', '1');
    const qs = params.toString();
    return qs ? `/tools?${qs}` : '/tools';
  }

  // Categories are a proper toggle: clicking the active chip removes
  // the filter, clicking another swaps. The href is computed from
  // *current* state so the URL params stay in sync.
  function categoryHref(cat: string | null): string {
    const params = new URLSearchParams();
    if (data.query) params.set('q', data.query);
    if (cat) params.set('category', cat);
    if (data.remixableFilter) params.set('remixable', '1');
    const qs = params.toString();
    return qs ? `/tools?${qs}` : '/tools';
  }

  function remixableHref(active: boolean): string {
    const params = new URLSearchParams();
    if (data.query) params.set('q', data.query);
    if (data.categoryFilter) params.set('category', data.categoryFilter);
    if (!active) params.set('remixable', '1');
    const qs = params.toString();
    return qs ? `/tools?${qs}` : '/tools';
  }

  function runHref(slug: string): string {
    return `/run/${encodeURIComponent(slug)}`;
  }
</script>

<svelte:head>
  <title>Tools — Shippie</title>
  <meta name="description" content="Search, save, and open local tools on Shippie. Local by default, offline-ready, and clear when something connects." />
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="page">
  <header class="head wrap" class:compact={hasLauncherHistory}>
    <div class="head-grid">
      <div class="head-copy">
        <p class="eyebrow hero-eyebrow">
          <img
            src="/__shippie-pwa/icon.svg"
            alt=""
            width="18"
            height="18"
            class="hero-mark"
            aria-hidden="true"
          />
          <span>Browse tools</span>
        </p>
        <h1 class="title">Tools</h1>
        {#if !hasLauncherHistory}
          <p class="lede">
            Tap a tool to use it. Local by default, offline-ready, and clear when something connects.
          </p>
        {/if}
      </div>
      <div class="head-tools">
        <SearchBar initial={data.query} placeholder="Search tools..." remixable={data.remixableFilter} />
        {#if data.categories.length > 0}
          <ul class="cats" aria-label="Browse categories">
            <li>
              <a class="cat-chip" class:active={!data.categoryFilter} href={categoryHref(null)}>All</a>
            </li>
            {#if data.remixableFilter}
              <li>
                <a
                  class="cat-chip"
                  class:active={data.remixableFilter}
                  href={remixableHref(data.remixableFilter)}
                  aria-current="page"
                >
                  Remixable ✕
                </a>
              </li>
            {/if}
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
                Build →
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
              : data.remixableFilter
              ? 'Remixable tools'
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
                <ToolTile
                  app={launcherAppToToolTile(app)}
                  density="card"
                  href={runHref(app.slug)}
                  pinned={savedSet.has(app.slug)}
                  recentLabel={recentLabel(app.slug)}
                  onInspect={() => inspectApp(app)}
                  onTogglePin={toggleSavedApp}
                />
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty-state">
            <p class="empty-lede">
              Nothing in the catalogue matches that yet.
              {#if fallbackApps.length > 0}
                Try one of these or browse a category.
              {:else}
                Try another word or a category.
              {/if}
              <a class="empty-clear" href={pageHref('', 1, data.categoryFilter, false)}>clear search →</a>
            </p>
            {#if fallbackApps.length > 0}
              <ul class="launcher-grid compact-grid" role="list">
                {#each fallbackApps as app (app.slug)}
                  <li>
                    <ToolTile
                      app={launcherAppToToolTile(app)}
                      density="card"
                      href={runHref(app.slug)}
                      pinned={savedSet.has(app.slug)}
                      recentLabel={recentLabel(app.slug)}
                      onInspect={() => inspectApp(app)}
                      onTogglePin={toggleSavedApp}
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
      {#if savedApps.length > 0}
        <SavedDock apps={savedApps} />
      {/if}

      <section class="launcher-section primary" aria-labelledby="continue-title">
        <div class="section-head">
          <h2 id="continue-title">{recentApps.length > 0 ? 'Continue' : 'Start'}</h2>
          <span class="section-hint">
            {recentApps.length > 0 ? 'recent' : 'ready now'}
          </span>
        </div>
        <ul class="launcher-grid featured" role="list">
          {#each continueDisplayApps as app (app.slug)}
            <li>
              <ToolTile
                app={launcherAppToToolTile(app)}
                density="card"
                href={runHref(app.slug)}
                pinned={savedSet.has(app.slug)}
                recentLabel={recentLabel(app.slug)}
                onInspect={() => inspectApp(app)}
                onTogglePin={toggleSavedApp}
              />
            </li>
          {/each}
        </ul>
      </section>

      {#if browseApps.length > 0}
        <section class="launcher-section" aria-labelledby="browse-title">
          <div class="section-head">
            <h2 id="browse-title">Browse</h2>
            <span class="section-hint">{browseApps.length} tools</span>
          </div>
          <ul class="launcher-grid compact-grid" role="list">
            {#each browseApps as app (app.slug)}
              <li>
                <ToolTile
                  app={launcherAppToToolTile(app)}
                  density="card"
                  href={runHref(app.slug)}
                  pinned={savedSet.has(app.slug)}
                  recentLabel={recentLabel(app.slug)}
                  onInspect={() => inspectApp(app)}
                  onTogglePin={toggleSavedApp}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}

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

</div>

<AppInspector
  app={selectedApp}
  pinned={selectedApp ? savedSet.has(selectedApp.slug) : false}
  onClose={closeInspector}
/>

<style>
  .page {
    padding-top: clamp(1.35rem, 2.6vw, var(--space-xl));
    /* Bottom padding includes the iOS home-indicator safe area so the
       last row of cards never clips. max() keeps the existing visual
       breathing room as the floor. */
    padding-bottom: max(var(--space-3xl), env(safe-area-inset-bottom, 0px));
  }
  .head {
    padding-bottom: clamp(1rem, 2.1vw, var(--space-lg));
    border-bottom: 1px solid var(--border-light);
  }
  .head-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(320px, 0.72fr);
    gap: clamp(1.25rem, 3vw, var(--space-xl));
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
  .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .hero-mark {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .head-copy {
    max-width: 36rem;
  }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2.35rem, 4.4vw, 4.2rem);
    letter-spacing: 0;
    line-height: 0.94;
    margin: 0;
  }
  /* Compact-mode title shrinks for returning users — when they already
     know what Shippie is, the brand mark can stand down so the search
     and tools row are the visual focus. */
  .head.compact .title {
    font-size: clamp(1.6rem, 3vw, 2.5rem);
    line-height: 0.98;
  }
  .head.compact .hero-eyebrow {
    /* Eyebrow loses its icon prefix margin in compact mode — the brand
       is already established by the small mark + name combo above. */
    opacity: 0.7;
  }
  .lede {
    color: var(--text-secondary);
    margin: clamp(0.65rem, 1.6vw, var(--space-md)) 0 0;
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
  .results { padding-top: clamp(1rem, 2vw, var(--space-lg)); }
  .launcher-section {
    display: grid;
    gap: clamp(0.75rem, 1.5vw, var(--space-md));
    margin-bottom: clamp(1.45rem, 3vw, var(--space-xl));
  }
  .launcher-section.primary {
    margin-bottom: clamp(1.45rem, 3vw, var(--space-xl));
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-md);
    min-width: 0;
  }
  .section-head h2 {
    min-width: 0;
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0;
    overflow-wrap: anywhere;
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
    gap: clamp(0.7rem, 1.35vw, var(--space-md));
  }
  .launcher-grid.featured {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  }
  /* Wide-viewport progression — only meaningful inside .wrap-wide;
     the apex page upgrades its container to wrap-wide so these
     queries actually have room to expand. */
  @media (min-width: 1280px) { .launcher-grid.featured { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (min-width: 1536px) { .launcher-grid.featured { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
  @media (min-width: 1920px) { .launcher-grid.featured { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .compact-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
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
      align-items: baseline;
      flex-direction: row;
      gap: 10px;
    }
    .section-hint {
      max-width: min(68%, 18rem);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .compact-grid {
      grid-template-columns: 1fr;
    }
    .page {
      padding-top: 10px;
    }
    .head {
      padding-bottom: 10px;
    }
    .head-grid {
      gap: 10px;
    }
    .head-tools {
      gap: 8px;
    }
    .hero-eyebrow {
      display: none;
    }
    .lede {
      display: none;
      margin-top: 0.75rem;
      font-size: 1rem;
      line-height: 1.45;
    }
    .title {
      font-size: clamp(2rem, 10vw, 2.35rem);
      line-height: 1;
    }
    .head.compact .title {
      font-size: clamp(1.9rem, 9vw, 2.35rem);
    }
    .head.compact {
      padding-bottom: 0.85rem;
    }
    .head.compact .head-grid {
      gap: 0.85rem;
    }
    .results {
      padding-top: 10px;
    }
    .cats {
      flex-wrap: nowrap;
      gap: 6px;
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

</style>
