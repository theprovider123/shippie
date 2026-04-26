<script lang="ts">
  import { page } from '$app/stores';
  import type { MyAppRow } from '../../../routes/dashboard/$types';

  let { user, myApps }: { user: { email: string; displayName: string | null }; myApps: MyAppRow[] } = $props();
</script>

<aside class="sidebar">
  <a class="brand" href="/">shippie</a>
  <p class="user">{user.displayName ?? user.email}</p>

  <nav class="nav">
    <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>Overview</a>
    <a href="/dashboard/apps" class:active={$page.url.pathname.startsWith('/dashboard/apps')}>Your apps</a>
    <a href="/dashboard/feedback" class:active={$page.url.pathname === '/dashboard/feedback'}>Feedback</a>
  </nav>

  <a class="ship-btn" href="/new">Ship a new app</a>

  {#if myApps.length > 0}
    <div class="apps">
      <p class="eyebrow">Recent</p>
      {#each myApps.slice(0, 6) as app (app.id)}
        <a class="row" href={`/dashboard/apps/${app.slug}`}>
          <span class="dot" style:background={app.themeColor}></span>
          <span class="name">{app.name}</span>
        </a>
      {/each}
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 2rem 1.5rem;
    border-right: 1px solid var(--border-light, #E5DDC8);
    min-height: 100dvh;
    width: 240px;
    box-sizing: border-box;
  }
  .brand {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #E8603C;
    text-decoration: none;
    font-size: 13px;
  }
  .user { font-size: 12px; color: #8B847A; margin: 0; }
  .nav { display: flex; flex-direction: column; gap: 0.25rem; }
  .nav a {
    text-decoration: none;
    color: #14120F;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 14px;
  }
  .nav a:hover { background: rgba(0,0,0,0.04); }
  .nav a.active { background: #E8603C; color: white; }
  .ship-btn {
    display: inline-block;
    text-align: center;
    background: #14120F;
    color: white;
    text-decoration: none;
    height: 40px;
    line-height: 40px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 13px;
  }
  .apps { display: flex; flex-direction: column; gap: 0.25rem; }
  .eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11px;
    color: #8B847A;
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    text-decoration: none;
    color: #14120F;
    font-size: 13px;
  }
  .row:hover { background: rgba(0,0,0,0.04); }
  .dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (prefers-color-scheme: dark) {
    .sidebar { border-color: #2A251E; }
    .nav a { color: #EDE4D3; }
    .nav a:hover { background: rgba(255,255,255,0.04); }
    .row { color: #EDE4D3; }
    .row:hover { background: rgba(255,255,255,0.04); }
  }
</style>
