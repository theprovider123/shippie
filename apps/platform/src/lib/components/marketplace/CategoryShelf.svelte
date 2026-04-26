<script lang="ts">
  import AppCard from './AppCard.svelte';

  interface AppLite {
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    type: string;
    category: string;
    iconUrl: string | null;
    themeColor: string;
    upvoteCount?: number;
    installCount?: number;
  }

  interface Props {
    title: string;
    subtitle?: string;
    apps: AppLite[];
    seeMoreHref?: string;
  }

  let { title, subtitle, apps, seeMoreHref }: Props = $props();
</script>

<section class="shelf">
  <header class="shelf-head">
    <div>
      <h2 class="shelf-title">{title}</h2>
      {#if subtitle}<p class="shelf-sub">{subtitle}</p>{/if}
    </div>
    {#if seeMoreHref}
      <a href={seeMoreHref} class="shelf-more">See all →</a>
    {/if}
  </header>
  <div class="shelf-track" role="list">
    {#each apps as app (app.slug)}
      <div class="shelf-item" role="listitem">
        <AppCard {...app} />
      </div>
    {/each}
  </div>
</section>

<style>
  .shelf { margin-bottom: var(--space-2xl); }
  .shelf-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border-light);
    margin-bottom: var(--space-lg);
  }
  .shelf-title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .shelf-sub {
    color: var(--text-light);
    font-size: 13px;
    margin: 4px 0 0;
  }
  .shelf-more {
    font-family: var(--font-mono);
    font-size: var(--small-size);
    color: var(--sunset);
    white-space: nowrap;
  }
  .shelf-track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(280px, 320px);
    gap: var(--space-md);
    overflow-x: auto;
    padding-bottom: var(--space-sm);
    scroll-snap-type: x proximity;
  }
  .shelf-item { scroll-snap-align: start; }
</style>
