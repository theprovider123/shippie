<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="admin-shell">
  <aside class="sidebar">
    <a class="brand" href="/dock">shippie</a>
    <p class="badge">admin</p>
    <p class="user">{data.admin.displayName ?? data.admin.username ?? data.admin.email}</p>

    <nav>
      <a href="/admin" class:active={$page.url.pathname === '/admin'}>Apps</a>
      <a href="/admin/analytics" class:active={$page.url.pathname.startsWith('/admin/analytics')}>Analytics</a>
      <a href="/admin/moderation" class:active={$page.url.pathname.startsWith('/admin/moderation')}>Moderation</a>
      <a href="/admin/reports" class:active={$page.url.pathname.startsWith('/admin/reports')}>Reports</a>
      <a href="/admin/updates" class:active={$page.url.pathname.startsWith('/admin/updates')}>Updates</a>
      <a href="/admin/parade" class:active={$page.url.pathname.startsWith('/admin/parade')}>Parade live pack</a>
      <a href="/admin/disputes" class:active={$page.url.pathname.startsWith('/admin/disputes')}>Disputes</a>
      <a href="/admin/audit" class:active={$page.url.pathname.startsWith('/admin/audit')}>Audit log</a>
      <a href="/admin/profile" class:active={$page.url.pathname.startsWith('/admin/profile')}>Builder profile</a>
    </nav>

    <a class="back" href="/maker/apps">← Back to Apps</a>
  </aside>

  <main>
    {@render children()}
  </main>
</div>

<style>
  .admin-shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100dvh;
    background: var(--bg, #14120F);
    color: var(--text, #EDE4D3);
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 2rem 1.5rem;
    border-right: 1px solid var(--border-light, #2A251E);
    box-sizing: border-box;
  }
  main {
    padding: 2.5rem 3rem;
    overflow-x: auto;
  }
  .brand {
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--sunset, #E8603C);
    text-decoration: none;
    font-size: var(--text-small);
  }
  .badge {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--marigold, #E8C547);
    background: rgba(232, 197, 71, 0.12);
    border: 1px solid rgba(232, 197, 71, 0.3);
    border-radius: 0;
    padding: 2px 8px;
    align-self: flex-start;
    margin: 0;
  }
  .user { font-size: var(--text-caption); color: var(--text-secondary, #B8A88F); margin: 0; }
  nav { display: flex; flex-direction: column; gap: 0.25rem; }
  nav a {
    text-decoration: none;
    color: inherit;
    padding: 0.5rem 0.75rem;
    border-radius: 0;
    font-size: var(--text-small);
  }
  nav a:hover { background: rgba(255,255,255,0.04); }
  nav a.active { background: var(--sunset, #E8603C); color: white; }
  .back {
    margin-top: auto;
    font-size: var(--text-caption);
    color: var(--text-secondary, #B8A88F);
    text-decoration: none;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .back:hover { color: var(--sunset, #E8603C); }

  @media (max-width: 640px) {
    .admin-shell { grid-template-columns: 1fr; }
    .sidebar {
      position: sticky;
      top: 0;
      z-index: 5;
      padding: 0.85rem 1rem;
      border-right: 0;
      border-bottom: 1px solid var(--border-light, #2A251E);
      background: var(--bg, #14120F);
    }
    .brand,
    .badge,
    .user {
      margin: 0;
    }
    nav {
      flex-direction: row;
      gap: 0.4rem;
      overflow-x: auto;
      margin: 0 -1rem;
      padding: 0 1rem;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    nav::-webkit-scrollbar {
      display: none;
    }
    nav a {
      flex: 0 0 auto;
      min-height: var(--touch-min, 44px);
      display: inline-flex;
      align-items: center;
      padding: 0 0.85rem;
      border: 1px solid var(--border-light, #2A251E);
      white-space: nowrap;
    }
    .back {
      min-height: var(--touch-min, 44px);
      display: inline-flex;
      align-items: center;
      margin-top: 0;
    }
    main { padding: 1rem; }
  }
</style>
