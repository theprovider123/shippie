<script lang="ts">
  import type { PageProps } from './$types';
  import AppGrid from '$lib/components/marketplace/AppGrid.svelte';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';

  let { data }: PageProps = $props();

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

<div class="page">
  <header class="head wrap">
    <p class="eyebrow">
      <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
      Local-first marketplace
    </p>
    <h1 class="title">Apps on Shippie</h1>
    <p class="lede">
      No app store. Just the web, installed. Vibecoded apps, on your phone in 60 seconds.
    </p>
    <div class="search-row">
      <SearchBar initial={data.query} />
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
              aria-pressed={isActive}
            >
              {cat}{#if isActive} ✕{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </header>

  <section class="results wrap">
    {#if data.query}
      <p class="result-count">
        {data.apps.length === 0
          ? `No apps matched "${data.query}".`
          : `${data.apps.length} match${data.apps.length === 1 ? '' : 'es'} for "${data.query}".`}
      </p>
    {/if}
    <AppGrid
      apps={data.apps}
      emptyLabel={data.query ? `No apps matched "${data.query}".` : 'No apps deployed yet.'}
    />

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
  </section>
</div>

<style>
  .page {
    padding-top: var(--space-2xl);
    padding-bottom: var(--space-3xl);
  }
  .head { padding-bottom: var(--space-xl); }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0 0 var(--space-sm);
  }
  .eyebrow img { display: block; }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2.2rem, 5vw, 3.4rem);
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede {
    color: var(--text-secondary);
    margin: var(--space-md) 0 var(--space-xl);
    max-width: 560px;
  }
  .search-row { margin-bottom: var(--space-md); }
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
  .chip.kind-connected.active { background: var(--marigold); border-color: var(--marigold); color: var(--text); }
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
  .results { padding-top: var(--space-md); }
  .result-count {
    color: var(--text-secondary);
    font-size: var(--small-size);
    margin: 0 0 var(--space-md);
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
</style>
