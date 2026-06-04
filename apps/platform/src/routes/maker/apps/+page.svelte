<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const demo = $derived(data.demoDiagnostics);
  const liveCount = $derived(data.apps.filter((app) => app.latestDeployStatus === 'success').length);
  const privateCount = $derived(data.apps.filter((app) => app.visibilityScope === 'private').length);
</script>

<svelte:head><title>Maker apps · Shippie</title></svelte:head>

<header class="maker-head">
  <div>
    <p class="eyebrow"><a href="/maker">Maker</a> · apps</p>
    <h1>Apps</h1>
    <p class="lede">
      {#if data.apps.length === 0}
        No apps are attached to this account yet.
      {:else}
        Manage the apps attached to this account.
      {/if}
    </p>
  </div>
  <a class="ship" href="/new">Ship app</a>
</header>

<section class="summary-grid" aria-label="Apps summary">
  <div>
    <span>Total</span>
    <strong>{data.apps.length}</strong>
  </div>
  <div>
    <span>Live</span>
    <strong>{liveCount}</strong>
  </div>
  <div>
    <span>Private</span>
    <strong>{privateCount}</strong>
  </div>
</section>

{#if data.apps.length === 0}
  <section class="empty" aria-labelledby="empty-title">
    <p class="eyebrow">No apps yet</p>
    <h2 id="empty-title">Ship or claim your first app.</h2>
    <p>
      Dock and Tools can show bundled tools. Maker only shows apps whose account owner matches
      <strong>{data.user.email}</strong>.
    </p>
    <div class="empty-actions">
      <a class="primary" href="/new">Ship app</a>
      {#if data.user.isAdmin}
        <a href="/admin">Admin</a>
      {/if}
    </div>
    <details class="diagnostics">
      <summary>Demo app diagnostics</summary>
      {#if demo.rows.length > 0}
        <p>
          Demo rows found: {demo.rows.map((row) => row.slug).join(', ')}.
          {demo.ownedSlugs.length === 0 ? 'None are owned by this account.' : `Owned here: ${demo.ownedSlugs.join(', ')}.`}
        </p>
      {:else}
        <p>No seeded demo rows were found in this database.</p>
      {/if}
    </details>
  </section>
{:else}
  <section class="app-list" aria-label="Your apps">
    {#each data.apps as app (app.id)}
      <article class="app-row">
        <a class="app-main" href={`/maker/apps/${app.slug}`}>
          <span class="swatch" style:background={app.themeColor}></span>
          <span>
            <strong>{app.name}</strong>
            <small>{app.slug}.shippie.app</small>
          </span>
        </a>
        <span class="badge">{app.type}</span>
        <span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span>
        <span class="vis">{app.visibilityScope}</span>
        <span class="time">{formatRelative(app.lastDeployedAt)}</span>
        <a class="manage" href={`/maker/apps/${app.slug}`}>Manage</a>
      </article>
    {/each}
  </section>
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
  .maker-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
    margin-bottom: 1rem;
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--sunset);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .eyebrow a,
  .manage,
  .ship,
  .empty-actions a {
    text-decoration: none;
  }
  .eyebrow a {
    color: inherit;
  }
  h1,
  h2 {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    letter-spacing: 0;
  }
  h1 {
    font-size: clamp(2rem, 7vw, 3.25rem);
    line-height: 0.98;
  }
  h2 {
    font-size: 1.4rem;
    line-height: 1.05;
  }
  .lede {
    margin: 0.35rem 0 0;
    color: var(--text-muted-warm);
  }
  .ship,
  .empty-actions a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.95rem;
    border: 1px solid var(--paper-cream);
    color: inherit;
    font-weight: 700;
  }
  .ship,
  .empty-actions a.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    margin-bottom: 1rem;
    border: 1px solid var(--paper-cream);
    background: var(--paper-cream);
  }
  .summary-grid div {
    min-height: 80px;
    display: grid;
    align-content: space-between;
    padding: 0.85rem;
    background: var(--bg);
  }
  .summary-grid span {
    color: var(--text-muted-warm);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .summary-grid strong {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.65rem, 5vw, 2.35rem);
    line-height: 0.95;
  }
  .app-list {
    display: grid;
    border: 1px solid var(--paper-cream);
  }
  .app-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(16rem, 1fr) auto auto auto auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 0.9rem;
    border-top: 1px solid var(--paper-cream);
  }
  .app-row:first-child {
    border-top: 0;
  }
  .app-main {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: inherit;
    text-decoration: none;
  }
  .app-main span:last-child {
    min-width: 0;
    display: grid;
    gap: 0.1rem;
  }
  .app-main strong,
  .app-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-main small,
  .time,
  .vis {
    color: var(--text-muted-warm);
  }
  .swatch {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }
  .badge,
  .status,
  .vis,
  .time {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  .badge,
  .status {
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.05);
  }
  .status-success {
    background: rgba(46, 125, 91, 0.15);
    color: var(--success);
  }
  .status-failed {
    background: rgba(180, 63, 42, 0.15);
    color: var(--danger);
  }
  .status-building {
    background: rgba(232, 96, 60, 0.15);
    color: var(--danger-hover);
  }
  .manage {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: var(--sunset);
    font-weight: 700;
  }
  .empty {
    display: grid;
    gap: 0.85rem;
    padding: 1rem 0;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
  }
  .empty p,
  .diagnostics p {
    margin: 0;
    color: var(--text-muted-warm);
    line-height: 1.5;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .diagnostics summary {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: var(--sunset);
    cursor: pointer;
    font-weight: 700;
  }
  @media (max-width: 900px) {
    .app-row {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.45rem 0.75rem;
    }
    .badge,
    .status,
    .vis,
    .time {
      justify-self: start;
    }
    .manage {
      justify-self: end;
    }
  }
  @media (max-width: 760px) {
    .maker-head {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .ship,
    .empty-actions a {
      width: 100%;
    }
    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .app-row {
      grid-template-columns: 1fr;
      padding: 0.85rem 0;
      border-color: var(--paper-cream);
    }
    .app-list {
      border-left: 0;
      border-right: 0;
    }
    .manage {
      justify-self: stretch;
      justify-content: center;
      border: 1px solid var(--paper-cream);
    }
  }
  @media (prefers-color-scheme: dark) {
    .ship,
    .empty-actions a,
    .summary-grid,
    .summary-grid div,
    .app-list,
    .app-row,
    .empty,
    .manage {
      border-color: var(--ink-warm);
    }
    .summary-grid {
      background: var(--ink-warm);
    }
    .badge,
    .status {
      background: rgba(255, 255, 255, 0.05);
    }
  }
</style>
