<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const apps = $derived(data.recentApps);
  const demo = $derived(data.demoDiagnostics);
  const privateCount = $derived(data.counts.private);
  const liveCount = $derived(data.counts.live);
</script>

<svelte:head>
  <title>Maker · Shippie</title>
</svelte:head>

<header class="maker-head">
  <div>
    <h1>Maker</h1>
    <p class="lede">Apps, deploys, feedback, and access for <strong>{data.user.email}</strong>.</p>
  </div>
</header>

<section class="summary-grid" aria-label="Maker summary">
  <div>
    <span>Apps</span>
    <strong>{data.counts.total}</strong>
  </div>
  <div>
    <span>Live</span>
    <strong>{liveCount}</strong>
  </div>
  <div>
    <span>Private</span>
    <strong>{privateCount}</strong>
  </div>
  <div>
    <span>Session</span>
    <strong>{data.authStatus.sessionDays}d</strong>
  </div>
</section>

<section class="sync-note" aria-label="Maker account sync">
  <strong>Account sync</strong>
  <span>Maker follows this account across devices. Dock saves and offline copies stay per device.</span>
  <a href="/you">You</a>
</section>

{#if data.counts.total > 0}
  <section class="app-section" aria-labelledby="recent-title">
    <div class="section-head">
      <div>
        <p class="eyebrow">Recent</p>
        <h2 id="recent-title">Apps</h2>
      </div>
      <a href="/maker/apps">View all →</a>
    </div>
    <div class="app-list">
      {#each apps.slice(0, 6) as app (app.id)}
        <article class="app-row">
          <a class="app-main" href={`/maker/apps/${app.slug}`}>
            <span class="swatch" style:background={app.themeColor}></span>
            <span>
              <strong>{app.name}</strong>
              <small>{app.slug}.shippie.app</small>
            </span>
          </a>
          <span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span>
          <span class="vis">{app.visibilityScope}</span>
        </article>
      {/each}
    </div>
  </section>
{:else}
  <section class="empty-maker" aria-labelledby="empty-maker-title">
    <p class="eyebrow">No apps yet</p>
    <h2 id="empty-maker-title">Ship or claim your first app.</h2>
    <p>Bundled tools can appear in Dock and Tools; Maker only shows apps attached to this account.</p>
    <div class="empty-actions">
      <a class="primary" href="/new">Ship app</a>
      {#if data.user.isAdmin}
        <a href="/admin">Admin</a>
      {/if}
    </div>
    <details class="diagnostics">
      <summary>Account diagnostics</summary>
      <div class="diagnostic-grid">
        <div>
          <span>Email</span>
          <strong>{data.authStatus.email}</strong>
        </div>
        <div>
          <span>User id</span>
          <strong>{data.authStatus.userId}</strong>
        </div>
        <div>
          <span>Environment</span>
          <strong>{data.authStatus.environment}</strong>
        </div>
      </div>
      {#if demo.rows.length === 0}
        <p>No seeded demo app rows were found in this database.</p>
      {:else}
        <p>
          Demo rows: {demo.rows.map((row) => row.slug).join(', ')}.
          {demo.ownedSlugs.length === 0 ? 'None are owned by this account.' : `Owned here: ${demo.ownedSlugs.join(', ')}.`}
        </p>
      {/if}
    </details>
  </section>
{/if}

<form method="POST" action="/auth/logout" class="logout">
  <button type="submit">Sign out</button>
</form>

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
    font-size: 1.35rem;
    line-height: 1.05;
  }
  .lede {
    margin: 0.35rem 0 0;
    color: var(--text-muted-warm);
    line-height: 1.5;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .empty-actions a,
  .section-head > a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.9rem;
    border: 1px solid var(--paper-cream);
    color: inherit;
    text-decoration: none;
    font-weight: 700;
  }
  .empty-actions a.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    margin-bottom: 1rem;
    border: 1px solid var(--paper-cream);
    background: var(--paper-cream);
  }
  .summary-grid div {
    min-height: 82px;
    display: grid;
    align-content: space-between;
    padding: 0.85rem;
    background: var(--bg);
  }
  .summary-grid span,
  .diagnostic-grid span {
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
  .sync-note {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    margin-bottom: 1.25rem;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
    color: var(--text-muted-warm);
    font-size: 13px;
    line-height: 1.45;
  }
  .sync-note strong {
    color: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .sync-note span {
    flex: 1;
  }
  .sync-note a,
  .section-head > a {
    color: var(--sunset);
    text-decoration: none;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
    margin-bottom: 0.7rem;
  }
  .app-list {
    display: grid;
    border: 1px solid var(--paper-cream);
  }
  .app-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 0.9rem;
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
  .vis {
    color: var(--text-muted-warm);
  }
  .swatch {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }
  .status,
  .vis {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
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
  .empty-maker {
    display: grid;
    gap: 0.85rem;
    padding: 1rem 0;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
  }
  .empty-maker p {
    margin: 0;
    color: var(--text-muted-warm);
    line-height: 1.5;
  }
  .diagnostics {
    margin-top: 0.4rem;
    color: var(--text-muted-warm);
    font-size: 13px;
  }
  .diagnostics summary {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: var(--sunset);
    cursor: pointer;
    font-weight: 700;
  }
  .diagnostic-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    margin: 0.4rem 0 0.75rem;
    border: 1px solid var(--paper-cream);
    background: var(--paper-cream);
  }
  .diagnostic-grid div {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
    background: var(--bg);
  }
  .diagnostic-grid strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .logout {
    margin-top: 1.25rem;
  }
  .logout button {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--paper-cream);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  @media (max-width: 760px) {
    .maker-head,
    .section-head,
    .sync-note {
      display: grid;
      align-items: start;
    }
    .empty-actions {
      justify-content: stretch;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .app-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.45rem;
    }
    .status,
    .vis {
      justify-self: start;
    }
    .diagnostic-grid {
      grid-template-columns: 1fr;
    }
    .logout button {
      width: 100%;
    }
  }
  @media (prefers-color-scheme: dark) {
    .empty-actions a,
    .section-head > a,
    .summary-grid,
    .summary-grid div,
    .sync-note,
    .app-list,
    .app-row,
    .empty-maker,
    .diagnostic-grid,
    .diagnostic-grid div,
    .logout button {
      border-color: var(--ink-warm);
    }
    .summary-grid,
    .diagnostic-grid {
      background: var(--ink-warm);
    }
    .status {
      background: rgba(255, 255, 255, 0.05);
    }
  }
</style>
