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
    min-height: 100dvh;
    background: #FAF7EF;
    color: #14120F;
  }
  .dashboard-main {
    padding: 2.5rem 3rem;
    overflow-x: auto;
  }
  @media (max-width: 720px) {
    .dashboard-shell { grid-template-columns: 1fr; }
    .dashboard-main { padding: 1.5rem; }
  }
  @media (prefers-color-scheme: dark) {
    .dashboard-shell { background: #14120F; color: #EDE4D3; }
  }
</style>
