<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Your apps · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow"><a href="/dashboard">Dashboard</a> · apps</p>
  <h1>Your apps</h1>
  <p class="lede">
    {#if data.apps.length === 0}
      You haven't shipped anything yet.
    {:else}
      {data.apps.length} {data.apps.length === 1 ? 'app' : 'apps'}
    {/if}
  </p>
  <a class="ship" href="/new">Ship new app →</a>
</header>

{#if data.apps.length === 0}
  <div class="empty">
    <p class="emoji">🍳</p>
    <h2>Ship your first app</h2>
    <p>Upload a static zip — your app is live at <code>{'{slug}'}.shippie.app</code> in under a minute.</p>
    <a class="btn btn--primary" href="/new">Get started</a>
  </div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>App</th>
          <th>Type</th>
          <th>Status</th>
          <th>Visibility</th>
          <th>Last deploy</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each data.apps as app (app.id)}
          <tr>
            <td>
              <span class="swatch" style:background={app.themeColor}></span>
              <strong>{app.name}</strong>
              <span class="slug">{app.slug}.shippie.app</span>
            </td>
            <td><span class="badge">{app.type}</span></td>
            <td><span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span></td>
            <td><span class="vis">{app.visibilityScope}</span></td>
            <td class="time">{formatRelative(app.lastDeployedAt)}</td>
            <td class="right">
              <a href={`/dashboard/apps/${app.slug}`}>Open →</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<script lang="ts" module>
  function formatRelative(iso: string | null): string {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
  }
</script>

<style>
  .header { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 1rem; margin-bottom: 2rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  .eyebrow a:hover { text-decoration: underline; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2.25rem; margin: 0.25rem 0 0.5rem 0; letter-spacing: 0; }
  .lede { color: var(--text-muted-warm); margin: 0; grid-column: 1; }
  .ship { background: var(--sunset); color: white; text-decoration: none; padding: 0 1.5rem; height: 44px; display: inline-flex; align-items: center; border-radius: 0; font-weight: 600; font-size: 14px; }
  .empty { text-align: center; padding: 4rem 2rem; border: 1px dashed var(--border-paper-mid); border-radius: 0; }
  .emoji { font-size: 48px; margin: 0; }
  .empty h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.75rem; margin: 0.5rem 0; }
  /* "Get started" uses canonical .btn .btn--primary from tokens.css. */
  .table-wrap { border: 1px solid var(--paper-cream); border-radius: 0; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 0.75rem 1rem; background: rgba(0,0,0,0.03); font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-muted-warm); }
  td { padding: 0.875rem 1rem; border-top: 1px solid rgba(0,0,0,0.06); vertical-align: middle; }
  td.right { text-align: right; }
  td.time { color: var(--text-muted-warm); font-family: ui-monospace, monospace; font-size: 12px; }
  .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 0; margin-right: 0.5rem; vertical-align: middle; }
  .slug { display: block; font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted-warm); margin-top: 2px; }
  .badge { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: var(--success); }
  .status-failed { background: rgba(180,63,42,0.15); color: var(--danger); }
  .status-building { background: rgba(232,96,60,0.15); color: var(--danger-hover); }
  .vis { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted-warm); }
  td a { color: var(--sunset); text-decoration: none; font-weight: 600; }
  td a:hover { text-decoration: underline; }
  @media (max-width: 760px) {
    .header {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2rem;
      line-height: 1.05;
    }
    .ship {
      width: 100%;
      justify-content: center;
    }
    .empty {
      padding: 2rem 1rem;
    }
    .table-wrap {
      border: 0;
      overflow: visible;
    }
    table,
    tbody,
    tr,
    td {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    thead {
      display: none;
    }
    tbody {
      display: grid;
      gap: 0.75rem;
    }
    tr {
      padding: 0.85rem;
      border: 1px solid var(--paper-cream);
    }
    td {
      border: 0;
      padding: 0;
    }
    td + td {
      margin-top: 0.5rem;
    }
    td:not(:first-child) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    td:not(:first-child)::before {
      color: var(--text-muted-warm);
      content: '';
      font-family: ui-monospace, monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    td:nth-child(2)::before { content: 'Type'; }
    td:nth-child(3)::before { content: 'Status'; }
    td:nth-child(4)::before { content: 'Visibility'; }
    td:nth-child(5)::before { content: 'Last deploy'; }
    td:nth-child(6)::before { content: 'Manage'; }
    td.right {
      text-align: left;
    }
    td.right a {
      min-height: var(--touch-min, 44px);
      display: inline-flex;
      align-items: center;
      color: var(--sunset);
    }
    .slug {
      overflow-wrap: anywhere;
    }
  }
  @media (prefers-color-scheme: dark) {
    .table-wrap { border-color: var(--ink-warm); }
    th { background: rgba(255,255,255,0.04); }
    td { border-color: rgba(255,255,255,0.05); }
    .empty { border-color: var(--ink-warm-mid); }
  }
  @media (prefers-color-scheme: dark) and (max-width: 760px) {
    tr {
      border-color: var(--ink-warm);
    }
  }
</style>
