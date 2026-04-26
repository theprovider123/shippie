<script lang="ts">
  import type { PageProps } from './$types';
  import AppGrid from '$lib/components/marketplace/AppGrid.svelte';
  import SearchBar from '$lib/components/marketplace/SearchBar.svelte';

  let { data }: PageProps = $props();

  function pageHref(q: string, page: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page > 1) params.set('p', String(page));
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
    <h1 class="title">Apps on Shippie</h1>
    <p class="lede">
      No app store. Just the web, installed. Vibecoded apps, on your phone in 60 seconds.
    </p>
    <div class="search-row">
      <SearchBar initial={data.query} />
    </div>
    {#if data.categories.length > 0}
      <ul class="cats" aria-label="Browse categories">
        {#each data.categories as cat (cat)}
          <li><a href={`/apps?q=${encodeURIComponent(cat)}`}>{cat}</a></li>
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
          <a class="page-link" href={pageHref(data.query, data.page - 1)} rel="prev">← Previous</a>
        {:else}
          <span></span>
        {/if}
        {#if data.hasMore}
          <a class="page-link" href={pageHref(data.query, data.page + 1)} rel="next">Next →</a>
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
  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .cats a {
    display: inline-flex;
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    border: 1px solid var(--border-light);
    transition: color 0.2s, border-color 0.2s;
  }
  .cats a:hover { color: var(--sunset); border-color: var(--sunset); }
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
