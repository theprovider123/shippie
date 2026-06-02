<script lang="ts">
  import Sidebar from '$components/dashboard/Sidebar.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="dashboard-shell">
  <Sidebar user={data.user} myApps={data.myApps} />
  <main class="dashboard-main">
    {@render children()}
  </main>
</div>

<style>
  .dashboard-shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: calc(100dvh - var(--nav-height) - var(--safe-top));
    background: var(--paper-warm);
    color: var(--bg);
  }
  .dashboard-main {
    padding: 2.5rem 3rem;
    overflow-x: auto;
  }
  @media (max-width: 760px) {
    .dashboard-shell {
      display: block;
      min-height: auto;
    }
    .dashboard-main {
      padding: 1rem;
      overflow-x: visible;
    }
  }
  @media (prefers-color-scheme: dark) {
    .dashboard-shell { background: var(--bg); color: var(--text); }
  }
</style>
