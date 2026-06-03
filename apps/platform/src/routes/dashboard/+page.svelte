<script lang="ts">
  import type { LayoutData } from './$types';

  let { data }: { data: LayoutData } = $props();
  const apps = $derived(data.myApps);
  const demo = $derived(data.demoDiagnostics);
</script>

<svelte:head>
  <title>Maker · Shippie</title>
</svelte:head>

<header class="header">
  <p class="eyebrow">
    <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
    Maker
  </p>
  <h1>Your apps.</h1>
  <p class="lede">Signed in as <strong>{data.user.email}</strong></p>
</header>

<section class="quick">
  <a class="card primary" href="/new">
    <p class="card-eyebrow">Action</p>
    <h2>Ship a new app</h2>
    <p>Upload a zip, wrap a hosted URL, or connect a GitHub repo. Live in under a minute.</p>
  </a>

  <a class="card" href="/maker/apps">
    <p class="card-eyebrow">Manage</p>
    <h2>Your apps ({apps.length})</h2>
    <p>Versions, status, deploys, visibility.</p>
  </a>

  {#if data.user.isAdmin}
    <a class="card" href="/admin">
      <p class="card-eyebrow">Operator</p>
      <h2>Admin</h2>
      <p>Review all DB apps, moderation, audit logs, and platform status.</p>
    </a>
  {/if}
</section>

<section class="sync-note" aria-label="Maker account sync">
  <strong>Account sync</strong>
  <span>
    Maker follows your account on phone and desktop. Dock saves and offline copies are still per device.
  </span>
  <a href="/you">Device settings</a>
</section>

{#if apps.length > 0}
  <section class="recent">
    <h2 class="section-title">Recent</h2>
    <ul>
      {#each apps.slice(0, 5) as app (app.id)}
        <li>
          <span class="swatch" style:background={app.themeColor}></span>
          <a href={`/maker/apps/${app.slug}`}><strong>{app.name}</strong></a>
          <span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span>
          <span class="vis">{app.visibilityScope}</span>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="empty-maker" aria-labelledby="empty-maker-title">
    <p class="card-eyebrow">No owned DB apps</p>
    <h2 id="empty-maker-title">Nothing is attached to this maker account yet.</h2>
    <p>
      Dock and Tools can show bundled showcase tools, but Maker only shows database apps whose
      <code>maker_id</code> matches this signed-in account.
    </p>
    <div class="diagnostic-grid">
      <div>
        <span>Signed in as</span>
        <strong>{data.authStatus.email}</strong>
      </div>
      <div>
        <span>User id</span>
        <strong>{data.authStatus.userId}</strong>
      </div>
      <div>
        <span>Session</span>
        <strong>{data.authStatus.sessionDays} days</strong>
      </div>
      <div>
        <span>Environment</span>
        <strong>{data.authStatus.environment}</strong>
      </div>
    </div>
    <div class="demo-diagnostics">
      <h3>Demo app check</h3>
      {#if demo.rows.length === 0}
        <p>No seeded demo app rows were found in this database. Apply the demo migrations or ship/claim a demo app before expecting it in Maker.</p>
      {:else}
        <p>
          Found {demo.rows.length} demo row{demo.rows.length === 1 ? '' : 's'}.
          {#if demo.ownedSlugs.length === 0}
            None are owned by this account.
          {:else}
            Owned here: {demo.ownedSlugs.join(', ')}.
          {/if}
        </p>
        {#if demo.otherOwnerSlugs.length > 0}
          <p>Different owner: {demo.otherOwnerSlugs.join(', ')}.</p>
        {/if}
        {#if demo.archivedSlugs.length > 0}
          <p>Archived: {demo.archivedSlugs.join(', ')}.</p>
        {/if}
      {/if}
      {#if demo.missingSlugs.length > 0}
        <p>Missing seed rows: {demo.missingSlugs.join(', ')}.</p>
      {/if}
    </div>
    <div class="empty-actions">
      <a href="/new">Ship an app</a>
      <a href="/maker/apps">Open apps list</a>
      {#if data.user.isAdmin}
        <a href="/admin">Inspect Admin</a>
      {/if}
    </div>
  </section>
{/if}

<form method="POST" action="/auth/logout" class="logout">
  <button type="submit">Sign out</button>
</form>

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset);
    margin: 0 0 0.25rem 0;
  }
  .eyebrow img { display: block; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2.5rem; margin: 0; letter-spacing: 0; }
  .lede { color: var(--text-muted-warm); }
  .quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
  .card {
    display: block;
    padding: 1.5rem;
    border: 1px solid var(--paper-cream);
    text-decoration: none;
    color: inherit;
    border-radius: 0;
    transition: border-color 0.12s;
  }
  .card:hover { border-color: var(--sunset); }
  .card.primary { border-color: rgba(232,96,60,0.3); background: rgba(232,96,60,0.04); }
  .card h2 { margin: 0.25rem 0; font-size: 1.25rem; }
  .card p { color: var(--text-muted-warm); margin: 0; font-size: 14px; }
  .card-eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset);
    margin: 0;
  }
  .empty-maker {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--paper-cream);
    background: rgba(232,96,60,0.035);
    margin-top: 1rem;
  }
  .empty-maker h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.55rem;
    line-height: 1.08;
    margin: 0;
    letter-spacing: 0;
  }
  .empty-maker p {
    margin: 0;
    color: var(--text-muted-warm);
    line-height: 1.5;
  }
  .empty-maker code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
  }
  .diagnostic-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--paper-cream);
    border: 1px solid var(--paper-cream);
  }
  .diagnostic-grid > div {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem;
    background: var(--bg);
  }
  .diagnostic-grid span,
  .demo-diagnostics h3 {
    color: var(--text-muted-warm);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .diagnostic-grid strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .demo-diagnostics {
    display: grid;
    gap: 0.45rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--paper-cream);
  }
  .demo-diagnostics h3 {
    margin: 0;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .empty-actions a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    padding: 0 1rem;
    border: 1px solid var(--paper-cream);
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
  }
  .empty-actions a:first-child {
    background: var(--sunset);
    border-color: var(--sunset);
    color: white;
  }
  .sync-note {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    margin-bottom: 1.5rem;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
    color: var(--text-muted-warm);
    font-size: 13px;
    line-height: 1.45;
  }
  .sync-note strong {
    color: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .sync-note span {
    flex: 1;
  }
  .sync-note a {
    color: var(--sunset);
    text-decoration: none;
    font-weight: 600;
    white-space: nowrap;
  }
  .recent ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .recent li {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .swatch { width: 12px; height: 12px; border-radius: 0; }
  .status { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: var(--success); }
  .status-failed { background: rgba(180,63,42,0.15); color: var(--danger); }
  .vis { font-size: 12px; color: var(--text-muted-warm); }
  .section-title { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 1rem 0 0.5rem 0; }
  .logout { margin-top: 2rem; }
  .logout button {
    background: transparent; border: 1px solid var(--paper-cream); padding: 0.5rem 1.5rem;
    border-radius: 0; font-size: 13px; cursor: pointer; color: inherit;
  }
  @media (max-width: 760px) {
    .header {
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2rem;
      line-height: 1.05;
    }
    .quick {
      grid-template-columns: 1fr;
      gap: 0.65rem;
      margin-bottom: 1rem;
    }
    .card {
      padding: 1rem;
    }
    .sync-note {
      display: grid;
      gap: 0.35rem;
      margin-bottom: 1rem;
    }
    .diagnostic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .empty-actions {
      display: grid;
    }
    .recent li {
      grid-template-columns: auto 1fr;
      gap: 0.35rem 0.65rem;
      padding: 0.75rem 0;
    }
    .status,
    .vis {
      grid-column: 2;
      justify-self: start;
    }
    .logout button {
      width: 100%;
      min-height: var(--touch-min, 44px);
    }
  }
  @media (prefers-color-scheme: dark) {
    .card { border-color: var(--ink-warm); }
    .card.primary { background: rgba(232,96,60,0.08); }
    .recent li { border-color: rgba(255,255,255,0.05); }
    .status { background: rgba(255,255,255,0.05); }
    .logout button { border-color: var(--ink-warm); }
    .sync-note {
      border-color: var(--ink-warm);
    }
  }
</style>
