<script lang="ts">
  import { page } from '$app/stores';
  import type { MyAppRow } from '../../../routes/dashboard/+layout.server';

  let { user, myApps }: { user: { email: string; displayName: string | null }; myApps: MyAppRow[] } = $props();
</script>

<aside class="sidebar">
  <a class="brand" href="/dock">
    <img
      src="/__shippie-pwa/icon.svg"
      alt=""
      width="28"
      height="28"
      aria-hidden="true"
    />
    <span>
      <strong>shippie</strong>
      <small>maker</small>
    </span>
  </a>
  <p class="user">{user.displayName ?? user.email}</p>

  <nav class="nav">
    <a href="/maker" class:active={$page.url.pathname === '/dashboard' || $page.url.pathname === '/maker'}>Maker</a>
    <a href="/maker/apps" class:active={$page.url.pathname.startsWith('/dashboard/apps') || $page.url.pathname.startsWith('/maker/apps')}>Apps</a>
    <a href="/dashboard/feedback" class:active={$page.url.pathname === '/dashboard/feedback'}>Feedback</a>
  </nav>

  <a class="ship-btn" href="/new">Ship app</a>

  {#if myApps.length > 0}
    <div class="apps">
      <p class="eyebrow">Recent</p>
      {#each myApps.slice(0, 6) as app (app.id)}
        <a class="row" href={`/maker/apps/${app.slug}`}>
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
    gap: 1rem;
    padding: 1.4rem 1rem;
    border-right: 1px solid var(--border-light, #E5DDC8);
    min-height: 100dvh;
    width: 208px;
    box-sizing: border-box;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--border-light, #E5DDC8);
    margin-bottom: 0.25rem;
  }
  .brand img { display: block; flex-shrink: 0; }
  .brand strong {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.0625rem;
    font-weight: 700;
    letter-spacing: 0;
    color: var(--bg);
  }
  .brand small {
    display: block;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset);
    margin-top: 1px;
  }
  @media (prefers-color-scheme: dark) {
    .brand strong { color: var(--text); }
  }
  .user {
    overflow: hidden;
    margin: 0;
    color: var(--text-muted-warm);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nav { display: flex; flex-direction: column; gap: 0.25rem; }
  .nav a {
    text-decoration: none;
    color: var(--bg);
    min-height: 38px;
    display: flex;
    align-items: center;
    padding: 0 0.7rem;
    border-radius: 0;
    font-size: 14px;
  }
  .nav a:hover { background: rgba(0,0,0,0.04); }
  .nav a.active { background: var(--sunset); color: white; }
  .ship-btn {
    display: inline-block;
    text-align: center;
    background: var(--sunset);
    color: white;
    text-decoration: none;
    min-height: var(--touch-min, 44px);
    border-radius: 0;
    font-weight: 600;
    font-size: 13px;
  }
  .apps { display: flex; flex-direction: column; gap: 0.2rem; }
  .eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11px;
    color: var(--text-muted-warm);
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 34px;
    padding: 0 0.7rem;
    border-radius: 0;
    text-decoration: none;
    color: var(--bg);
    font-size: 13px;
  }
  .row:hover { background: rgba(0,0,0,0.04); }
  .dot { width: 10px; height: 10px; border-radius: 0; flex-shrink: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 760px) {
    .sidebar {
      width: 100%;
      min-height: auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      padding: 0.7rem 1rem;
      gap: 0.75rem;
      border-right: 0;
      border-bottom: 1px solid var(--border-light, #E5DDC8);
    }
    .user,
    .apps {
      display: none;
    }
    .brand {
      min-width: 0;
      padding-bottom: 0;
      margin-bottom: 0;
      border-bottom: 0;
    }
    .brand img {
      width: 24px;
      height: 24px;
    }
    .brand small {
      display: none;
    }
    .nav {
      grid-column: 1 / -1;
      flex-direction: row;
      gap: 0.4rem;
      overflow-x: auto;
      margin: 0 -1rem;
      padding: 0 1rem;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .nav::-webkit-scrollbar {
      display: none;
    }
    .nav a {
      flex: 0 0 auto;
      min-height: var(--touch-min, 44px);
      display: inline-flex;
      align-items: center;
      padding: 0 0.85rem;
      border: 1px solid var(--border-light, #E5DDC8);
      font-size: 13px;
      white-space: nowrap;
    }
    .ship-btn {
      width: auto;
      padding: 0 0.9rem;
      height: var(--touch-min, 44px);
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--sunset);
      color: var(--paper-warm-deep);
    }
  }
  @media (prefers-color-scheme: dark) {
    .sidebar { border-color: var(--ink-warm); }
    .nav a { color: var(--text); }
    .nav a:hover { background: rgba(255,255,255,0.04); }
    .row { color: var(--text); }
    .row:hover { background: rgba(255,255,255,0.04); }
  }
  @media (prefers-color-scheme: dark) and (max-width: 760px) {
    .nav a {
      border-color: var(--ink-warm);
    }
  }
</style>
