<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Trust preview — Shippie internal</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section class="wrap">
  <header>
    <h1>Trust preview</h1>
    <p>
      Stage B harness — per-scanner false-positive rate and promotion gate.
      Hidden from public navigation. Findings ship to the public app surface
      once a scanner stays in <code>ready</code> for two consecutive quarterly
      reviews.
    </p>
  </header>

  {#if data.rows.length === 0}
    <p>No dispositions recorded yet.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Scanner</th>
          <th>Total</th>
          <th>False positives</th>
          <th>Rate</th>
          <th>Promotion</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as row (row.stat.scanner)}
          <tr class:ready={row.decision.ready}>
            <td>{row.stat.scanner}</td>
            <td>{row.stat.total}</td>
            <td>{row.stat.falsePositives}</td>
            <td>{(row.stat.rate * 100).toFixed(1)}%</td>
            <td>{row.decision.ready ? 'ready' : row.decision.reason}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .wrap {
    max-width: 720px;
    margin: 40px auto;
    padding: 0 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  header h1 {
    margin: 0 0 6px;
    font-size: 22px;
  }
  header p {
    margin: 0 0 24px;
    color: #5C5751;
    font-size: 14px;
    line-height: 1.5;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th,
  td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  tr.ready td {
    background: rgba(94, 167, 119, 0.08);
  }
  code {
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 6px;
    border-radius: 4px;
  }
</style>
