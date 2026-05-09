<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Arcade — Shippie</title>
  <meta name="description" content="Open-source games on Shippie. Offline. No ads. No tracking. No accounts." />
</svelte:head>

<main class="page">
  <header class="page-head">
    <h1>Arcade</h1>
    <p class="muted">Open-source games. Offline. No ads. No tracking. No accounts.</p>
  </header>

  {#if data.apps.length === 0}
    <section class="empty">
      <h2>Coming soon</h2>
      <p>The Arcade surface is live. Games land here once they pass the quality gates.</p>
    </section>
  {:else}
    <ul class="game-grid" aria-label="Arcade games">
      {#each data.apps as game (game.slug)}
        <li>
          <a class="game-card" href={game.standaloneUrl}>
            <h3>{game.name}</h3>
            <p>{game.description}</p>
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
    border: 1px dashed var(--line, #C9B99A);
    padding: 40px 24px;
    text-align: center;
    border-radius: 0;
  }
  .empty h2 {
    margin: 0 0 8px;
    font-family: var(--font-heading, serif);
  }
  .game-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .game-card {
    display: block;
    padding: 16px;
    background: #fff;
    border: 1px solid var(--line, #C9B99A);
    color: inherit;
    text-decoration: none;
  }
  .game-card h3 {
    margin: 0 0 6px;
    font-family: var(--font-heading, serif);
    font-size: 18px;
  }
  .game-card p {
    margin: 0;
    color: var(--muted, #5C5751);
    font-size: 14px;
    line-height: 1.4;
  }
</style>
