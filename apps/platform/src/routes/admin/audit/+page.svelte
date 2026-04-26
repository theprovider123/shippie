<script lang="ts">
  import AuditRow from '$components/admin/AuditRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function pageHref(p: number): string {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (p <= 0) params.delete('p');
    else params.set('p', String(p));
    const qs = params.toString();
    return qs ? `?${qs}` : '/admin/audit';
  }
</script>

<svelte:head><title>Admin · Audit log · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow">Admin · Audit log</p>
  <h1>Audit trail</h1>
  <p class="lede">
    {data.rows.length} {data.rows.length === 1 ? 'event' : 'events'}
    {#if data.page > 0}· page {data.page + 1}{/if}
  </p>
</header>

<form method="GET" class="filters">
  <label class="field">
    <span>Action</span>
    <select name="action">
      <option value="" selected={!data.filters.action}>All</option>
      {#each data.actions as a (a)}
        <option value={a} selected={data.filters.action === a}>{a}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>Actor</span>
    <select name="actor">
      <option value="" selected={!data.filters.actor}>All</option>
      {#each data.actors as a (a.id)}
        <option value={a.id} selected={data.filters.actor === a.id}>{a.label}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>Window</span>
    <select name="window">
      <option value="all" selected={data.filters.window === 'all'}>All time</option>
      <option value="24h" selected={data.filters.window === '24h'}>Last 24h</option>
      <option value="7d" selected={data.filters.window === '7d'}>Last 7d</option>
      <option value="30d" selected={data.filters.window === '30d'}>Last 30d</option>
    </select>
  </label>

  <button type="submit" class="apply">Apply</button>
  <a href="/admin/audit" class="reset">Reset</a>
</form>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Actor</th>
        <th>Action</th>
        <th>Target</th>
        <th>Diff</th>
      </tr>
    </thead>
    <tbody>
      {#each data.rows as row (row.id)}
        <AuditRow {row} />
      {/each}
      {#if data.rows.length === 0}
        <tr><td colspan="5" class="empty">No events match these filters.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<nav class="pager">
  {#if data.page > 0}
    <a href={pageHref(data.page - 1)}>← Newer</a>
  {:else}
    <span class="ghost">← Newer</span>
  {/if}
  <span class="num">page {data.page + 1}</span>
  {#if data.hasMore}
    <a href={pageHref(data.page + 1)}>Older →</a>
  {:else}
    <span class="ghost">Older →</span>
  {/if}
</nav>

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
    border-radius: 12px;
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
  select {
    background: var(--surface, #1E1A15);
    color: var(--text, #EDE4D3);
    border: 1px solid var(--border-light, #2A251E);
    border-radius: 6px;
    padding: 6px 10px;
    font: inherit;
    font-size: 13px;
  }
  .apply {
    background: var(--sunset, #E8603C);
    color: white;
    border: none;
    border-radius: 999px;
    padding: 8px 18px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .reset { color: var(--text-secondary, #B8A88F); text-decoration: none; font-size: 12px; padding: 8px 4px; }
  .reset:hover { color: var(--sunset, #E8603C); }
  .table-wrap { border: 1px solid var(--border-light, #2A251E); border-radius: 12px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    padding: 0.625rem 0.875rem;
    background: rgba(255,255,255,0.04);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
  }
  td.empty {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary, #B8A88F);
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  .pager {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    margin-top: 1rem;
    font-size: 13px;
  }
  .pager a {
    color: var(--sunset, #E8603C);
    text-decoration: none;
    font-weight: 600;
  }
  .pager a:hover { text-decoration: underline; }
  .pager .ghost { color: var(--text-light, #7A6B58); }
  .pager .num {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--text-secondary, #B8A88F);
  }
</style>
