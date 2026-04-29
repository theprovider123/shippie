<script lang="ts">
  import type { LayoutData } from './$types';

  let { data }: { data: LayoutData } = $props();
  const apps = data.myApps;
</script>

<svelte:head>
  <title>Dashboard · Shippie</title>
</svelte:head>

<header class="header">
  <p class="eyebrow">
    <img src="/__shippie-pwa/icon.svg" alt="" width="14" height="14" />
    Dashboard
  </p>
  <h1>Welcome{data.user.displayName ? `, ${data.user.displayName}` : ''}.</h1>
  <p class="lede">Signed in as <strong>{data.user.email}</strong></p>
</header>

<section class="quick">
  <a class="card primary" href="/new">
    <p class="card-eyebrow">Action</p>
    <h2>Ship a new app</h2>
    <p>Upload a zip, wrap a hosted URL, or connect a GitHub repo. Live in under a minute.</p>
  </a>

  <a class="card" href="/dashboard/apps">
    <p class="card-eyebrow">Your stuff</p>
    <h2>Your apps ({apps.length})</h2>
    <p>Versions, status, deploys, visibility.</p>
  </a>
</section>

{#if apps.length > 0}
  <section class="recent">
    <h2 class="section-title">Recent</h2>
    <ul>
      {#each apps.slice(0, 5) as app (app.id)}
        <li>
          <span class="swatch" style:background={app.themeColor}></span>
          <a href={`/dashboard/apps/${app.slug}`}><strong>{app.name}</strong></a>
          <span class="status status-{app.latestDeployStatus ?? 'draft'}">{app.latestDeployStatus ?? 'draft'}</span>
          <span class="vis">{app.visibilityScope}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<form method="POST" action="/auth/logout" class="logout">
  <button type="submit">Sign out</button>
</form>

<style>
  .header { margin-bottom: 2rem; }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #E8603C;
    margin: 0 0 0.25rem 0;
  }
  .eyebrow img { display: block; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2.5rem; margin: 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; }
  .quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card {
    display: block;
    padding: 1.5rem;
    border: 1px solid #E5DDC8;
    text-decoration: none;
    color: inherit;
    border-radius: 0;
    transition: border-color 0.12s;
  }
  .card:hover { border-color: #E8603C; }
  .card.primary { border-color: rgba(232,96,60,0.3); background: rgba(232,96,60,0.04); }
  .card h2 { margin: 0.25rem 0; font-size: 1.25rem; }
  .card p { color: #8B847A; margin: 0; font-size: 14px; }
  .card-eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #E8603C;
    margin: 0;
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
  .status-success { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .status-failed { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .vis { font-size: 12px; color: #8B847A; }
  .section-title { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 1rem 0 0.5rem 0; }
  .logout { margin-top: 2rem; }
  .logout button {
    background: transparent; border: 1px solid #E5DDC8; padding: 0.5rem 1.5rem;
    border-radius: 0; font-size: 13px; cursor: pointer; color: inherit;
  }
  @media (prefers-color-scheme: dark) {
    .card { border-color: #2A251E; }
    .card.primary { background: rgba(232,96,60,0.08); }
    .recent li { border-color: rgba(255,255,255,0.05); }
    .status { background: rgba(255,255,255,0.05); }
    .logout button { border-color: #2A251E; }
  }
</style>
