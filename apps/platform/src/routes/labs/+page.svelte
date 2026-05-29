<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Labs — Shippie</title>
  <meta name="description" content="Experimental Shippie apps. Useful but not launch-quality, or maker-tooling rather than consumer-facing." />
</svelte:head>

<main class="page">
  <header class="page-head">
    <h1>Labs</h1>
    <p class="muted">Experimental and maker-tooling apps. Not in the launch slate, but useful.</p>
  </header>

  {#if data.apps.length === 0}
    <section class="empty">
      <h2>Nothing here yet</h2>
      <p>When experimental apps need a home, they land here.</p>
    </section>
  {:else}
    <ul class="lab-grid" aria-label="Lab apps">
      {#each data.apps as app (app.slug)}
        <li>
          <a class="lab-card" href={app.standaloneUrl}>
            <h3>{app.name}</h3>
            <p>{app.description}</p>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 20px 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .page-head h1 {
    font-family: var(--font-heading, serif);
    font-size: 32px;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .page-head p {
    margin: 4px 0 0;
    color: var(--muted, #5C5751);
  }
  .empty {
    border: 1px dashed var(--line, var(--cream-border));
    padding: 40px 24px;
    text-align: center;
  }
  .empty h2 {
    margin: 0 0 8px;
    font-family: var(--font-heading, serif);
  }
  .lab-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .lab-card {
    display: block;
    padding: 16px;
    background: #fff;
    border: 1px solid var(--line, var(--cream-border));
    color: inherit;
    text-decoration: none;
  }
  .lab-card h3 {
    margin: 0 0 6px;
    font-family: var(--font-heading, serif);
    font-size: 18px;
  }
  .lab-card p {
    margin: 0;
    color: var(--muted, #5C5751);
    font-size: 14px;
    line-height: 1.4;
  }
</style>
