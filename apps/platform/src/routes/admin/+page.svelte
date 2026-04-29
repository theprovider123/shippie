<script lang="ts">
  import AppsTable from '$components/admin/AppsTable.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Admin · Apps · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow">Admin · Apps</p>
  <h1>Moderation</h1>
  <p class="lede">{data.apps.length} {data.apps.length === 1 ? 'app' : 'apps'} match the current filter.</p>
</header>

<form method="GET" class="filters">
  <label class="field">
    <span>Search</span>
    <input
      type="search"
      name="q"
      value={data.filters.q}
      placeholder="name or slug…"
    />
  </label>

  <label class="field">
    <span>Category</span>
    <select name="category">
      <option value="all" selected={data.filters.category === 'all' || !data.filters.category}>All</option>
      {#each data.categories as cat (cat)}
        <option value={cat} selected={data.filters.category === cat}>{cat}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>Status</span>
    <select name="status">
      <option value="all" selected={data.filters.status === 'all'}>All</option>
      <option value="live" selected={data.filters.status === 'live'}>Live</option>
      <option value="building" selected={data.filters.status === 'building'}>Building</option>
      <option value="failed" selected={data.filters.status === 'failed'}>Failed</option>
      <option value="archived" selected={data.filters.status === 'archived'}>Archived</option>
    </select>
  </label>

  <input type="hidden" name="sort" value={data.filters.sort} />
  <button type="submit" class="apply">Apply</button>
  <a href="/admin" class="reset">Reset</a>
</form>

<AppsTable apps={data.apps} sort={data.filters.sort} />

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset, #E8603C);
    margin: 0;
  }
  h1 {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 2.25rem;
    margin: 0.25rem 0 0.5rem 0;
    letter-spacing: -0.02em;
  }
  .lede { color: var(--text-secondary, #B8A88F); margin: 0; }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
    margin-bottom: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--border-light, #2A251E);
    border-radius: 0;
    background: rgba(255,255,255,0.02);
  }
  .field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 180px; }
  .field span {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
  }
  input, select {
    background: var(--surface, #1E1A15);
    color: var(--text, #EDE4D3);
    border: 1px solid var(--border-light, #2A251E);
    border-radius: 0;
    padding: 6px 10px;
    font: inherit;
    font-size: 13px;
  }
  .apply {
    background: var(--sunset, #E8603C);
    color: white;
    border: none;
    border-radius: 0;
    padding: 8px 18px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .reset {
    color: var(--text-secondary, #B8A88F);
    text-decoration: none;
    font-size: 12px;
    padding: 8px 4px;
  }
  .reset:hover { color: var(--sunset, #E8603C); }
</style>
