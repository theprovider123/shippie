<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import AppInspector from '$lib/components/marketplace/AppInspector.svelte';
  import {
    ToolCard,
    ToolRow,
    launcherAppToToolTile,
    toolState,
  } from '$lib/components/tool-surface';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';
  import { displayCategory } from '$lib/marketplace/display-text';
  import { suggestApps, suggestCategories } from '$lib/marketplace/search-fallback';
  // Randomiser hero retired from the home page — too prominent + the
  // wheel mostly read empty for first-visit users. Lives at /today
  // (or wherever a "your other apps" surface lands later) instead.
  import { refreshCachedSlugs, ensureAppOffline, offlineStatuses } from '$lib/stores/cached-slugs';
  import {
    hydrateLauncherMemory,
    launcherMemory,
    saveAppToDock,
  } from '$lib/stores/launcher-memory';
  import { startCatalogSync } from '$lib/client/catalog-sync';

  let { data }: PageProps = $props();
  let selectedSlug = $state<string | null>(null);
  // Below this width Tools browses as a row list, not a card grid (spec §7).
  let viewportWidth = $state(1280);
  const useRows = $derived(viewportWidth <= 768);

  type LauncherApp = (typeof data.apps)[number];

  const appBySlug = $derived.by(() => new Map(data.apps.map((app) => [app.slug, app])));
  const selectedApp = $derived(selectedSlug ? (appBySlug.get(selectedSlug) ?? null) : null);
  const filtered = $derived(Boolean(data.query || data.categoryFilter || data.remixableFilter));
  const savedSet = $derived.by(() => new Set($launcherMemory.saved));
  const EMPTY_SLUGS: ReadonlySet<string> = new Set();

  // Dynamic per-tool state for the browse surface. Tools is catalog/saved
  // only — no running/recent/update axis here — so the selector drives
  // just the save (+) / repair (↻) affordance and hides remove.
  function stateFor(app: LauncherApp) {
    return toolState({
      slug: app.slug,
      isRunning: false,
      savedSlugs: savedSet,
      recentSlugs: EMPTY_SLUGS,
      download: $offlineStatuses[app.slug]?.state,
      updateSeverity: null,
      surface: 'tools',
    });
  }

  // Save = add to Dock AND make available offline (spec §3.4). Never a
  // toggle: on the repair case the tool is already saved, so toggling
  // would unsave it — we re-ensure the offline copy instead.
  async function saveApp(app: LauncherApp) {
    if (!savedSet.has(app.slug)) saveAppToDock(app.slug);
    await ensureAppOffline(app.slug);
  }
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
    return () => {
      stopCatalogSync();
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
  <meta name="description" content="Search and browse local tools on Shippie." />
</svelte:head>

<svelte:window onkeydown={onKeydown} bind:innerWidth={viewportWidth} />

<div class="page">
  <header class="head wrap">
    <div class="head-grid">
      <div class="head-copy">
        <p class="eyebrow">Browse</p>
        <h1 class="title">Tools</h1>
        <p class="lede">
          Search and browse the local tools you can run on this device.
        </p>
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
    <section class="launcher-section primary" aria-labelledby="results-title">
      <div class="section-head">
        <h2 id="results-title">
          {data.apps.length === 0 && data.query
            ? `No matches for "${data.query}"`
            : data.query
            ? `Results for "${data.query}"`
            : data.remixableFilter
            ? 'Remixable tools'
            : 'Browse tools'}
        </h2>
        <span class="section-hint">
          {data.apps.length === 0
            ? 'no matches'
            : `${data.apps.length} tool${data.apps.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {#if data.apps.length > 0}
        <ul class="launcher-grid" class:compact-grid={!useRows} class:row-list={useRows} role="list">
          {#each data.apps as app (app.slug)}
            <li>
              {#if useRows}
                <ToolRow
                  app={launcherAppToToolTile(app)}
                  state={stateFor(app)}
                  href={runHref(app.slug)}
                  intent="launch"
                  onSave={() => saveApp(app)}
                  onInfo={() => inspectApp(app)}
                />
              {:else}
                <ToolCard
                  app={launcherAppToToolTile(app)}
                  state={stateFor(app)}
                  href={runHref(app.slug)}
                  intent="launch"
                  onSave={() => saveApp(app)}
                  onInfo={() => inspectApp(app)}
                />
              {/if}
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
            <ul class="launcher-grid" class:compact-grid={!useRows} class:row-list={useRows} role="list">
              {#each fallbackApps as app (app.slug)}
                <li>
                  {#if useRows}
                    <ToolRow
                      app={launcherAppToToolTile(app)}
                      state={stateFor(app)}
                      href={runHref(app.slug)}
                      intent="launch"
                      onSave={() => saveApp(app)}
                      onInfo={() => inspectApp(app)}
                    />
                  {:else}
                    <ToolCard
                      app={launcherAppToToolTile(app)}
                      state={stateFor(app)}
                      href={runHref(app.slug)}
                      intent="launch"
                      onSave={() => saveApp(app)}
                      onInfo={() => inspectApp(app)}
                    />
                  {/if}
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
    padding-top: clamp(0.5rem, 1.4vw, var(--space-sm));
    padding-bottom: clamp(1rem, 2.1vw, var(--space-lg));
    border-bottom: 1px solid var(--border-light);
    /* Sticky so search + category chips stay reachable while the grid
       scrolls (spec §7). Opaque background prevents content bleed. */
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg, var(--bg-pure));
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
  .head-copy {
    max-width: 36rem;
  }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 4vw, 3rem);
    letter-spacing: 0;
    line-height: 1;
    margin: 0;
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
  .compact-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  }
  /* Mobile (≤768): browse as a single-column row list, not cards. The
     ToolRows own their height + dividers, so the list just stacks them. */
  .row-list {
    grid-template-columns: 1fr;
    gap: 0;
    border-top: 1px solid var(--border-light);
  }
  .row-list li { min-width: 0; }
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
    .head-grid {
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
  @media (max-width: 768px) {
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
    .lede {
      margin-top: 0.75rem;
      font-size: 0.95rem;
      line-height: 1.45;
    }
    .title {
      font-size: clamp(2rem, 10vw, 2.7rem);
      line-height: 1;
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
