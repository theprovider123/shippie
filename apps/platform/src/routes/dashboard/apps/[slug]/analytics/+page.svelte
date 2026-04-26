<script lang="ts">
  import type { LayoutData } from '../$types';
  let { data }: { data: LayoutData } = $props();
</script>

<svelte:head><title>Analytics · {data.app.name}</title></svelte:head>

<section class="empty">
  <p class="emoji">📊</p>
  <h2>No usage yet</h2>
  <p class="lede">Once visitors install or open <strong>{data.app.slug}.shippie.app</strong>, daily rollups will land here.</p>
</section>

<style>
  .empty { padding: 4rem 2rem; text-align: center; border: 1px dashed #C9C2B1; border-radius: 12px; }
  .emoji { font-size: 48px; margin: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  .lede { color: #8B847A; }
  @media (prefers-color-scheme: dark) {
    .empty { border-color: #3A352D; }
  }
</style>
