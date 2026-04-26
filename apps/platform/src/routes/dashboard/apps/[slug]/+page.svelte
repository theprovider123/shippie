<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.app.name} · Dashboard</title></svelte:head>

<section class="grid">
  <div class="card">
    <h2>Visibility</h2>
    <p><span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span></p>
    <a href={`/dashboard/apps/${data.app.slug}/access`}>Manage access →</a>
  </div>

  <div class="card">
    <h2>Deploys</h2>
    {#if data.deploys.length === 0}
      <p class="muted">No deploys yet.</p>
    {:else}
      <ul>
        {#each data.deploys as d (d.id)}
          <li>
            <span class="ver">v{d.version}</span>
            <span class="status status-{d.status}">{d.status}</span>
            <span class="src">{d.sourceType}</span>
            <span class="time">{d.completedAt ?? d.createdAt}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { padding: 1.5rem; border: 1px solid #E5DDC8; border-radius: 12px; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 0 0 0.5rem 0; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: auto auto auto 1fr; gap: 0.5rem; align-items: center; font-size: 13px; }
  .ver { font-family: ui-monospace, monospace; font-weight: 700; }
  .status { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .status-failed { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .status-building { background: rgba(232,96,60,0.15); color: #B44820; }
  .src { font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .time { text-align: right; font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .vis { font-family: ui-monospace, monospace; font-size: 12px; padding: 4px 12px; border-radius: 999px; background: rgba(0,0,0,0.05); }
  .vis-public { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .vis-private { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .muted { color: #8B847A; }
  a { color: #E8603C; text-decoration: none; font-weight: 600; font-size: 14px; }
  a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .card { border-color: #2A251E; }
    .status, .vis { background: rgba(255,255,255,0.05); }
  }
</style>
