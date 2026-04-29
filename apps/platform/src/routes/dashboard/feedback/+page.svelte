<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Feedback · Dashboard</title></svelte:head>

<header>
  <p class="eyebrow"><a href="/dashboard">Dashboard</a> · feedback</p>
  <h1>Feedback inbox</h1>
  <p class="lede">{data.myApps.length} apps · {data.items.length} items</p>
</header>

{#if data.items.length === 0}
  <section class="empty">
    <p class="emoji">📨</p>
    <h2>No feedback yet</h2>
    <p>Once visitors send feedback or rate an app, it lands here.</p>
  </section>
{/if}

<style>
  header { margin-bottom: 1.5rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8603C; margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; margin: 0.25rem 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; margin: 0; }
  .empty { padding: 4rem 2rem; text-align: center; border: 1px dashed #C9C2B1; border-radius: 0; }
  .emoji { font-size: 48px; margin: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  @media (prefers-color-scheme: dark) {
    .empty { border-color: #3A352D; }
  }
</style>
