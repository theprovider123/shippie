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
    <a class="brand" href="/">shippie</a>
    <p class="badge">admin</p>
    <p class="user">{data.admin.displayName ?? data.admin.username ?? data.admin.email}</p>

    <nav>
      <a href="/admin" class:active={$page.url.pathname === '/admin'}>Apps</a>
      <a href="/admin/audit" class:active={$page.url.pathname.startsWith('/admin/audit')}>Audit log</a>
    </nav>

    <a class="back" href="/dashboard">← Back to dashboard</a>
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
    font-size: 13px;
  }
  .badge {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--marigold, #E8C547);
    background: rgba(232, 197, 71, 0.12);
    border: 1px solid rgba(232, 197, 71, 0.3);
    border-radius: 999px;
    padding: 2px 8px;
    align-self: flex-start;
    margin: 0;
  }
  .user { font-size: 12px; color: var(--text-secondary, #B8A88F); margin: 0; }
  nav { display: flex; flex-direction: column; gap: 0.25rem; }
  nav a {
    text-decoration: none;
    color: inherit;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 14px;
  }
  nav a:hover { background: rgba(255,255,255,0.04); }
  nav a.active { background: var(--sunset, #E8603C); color: white; }
  .back {
    margin-top: auto;
    font-size: 12px;
    color: var(--text-secondary, #B8A88F);
    text-decoration: none;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .back:hover { color: var(--sunset, #E8603C); }

  @media (max-width: 720px) {
    .admin-shell { grid-template-columns: 1fr; }
    main { padding: 1.5rem; }
  }
</style>
