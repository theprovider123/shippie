<script lang="ts">
  import AppCard from './AppCard.svelte';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';

  interface AppForGrid {
    id?: string;
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
    badges?: PublicCapabilityBadge[];
  }

  interface Props {
    apps: AppForGrid[];
    emptyLabel?: string;
  }

  let { apps, emptyLabel = 'No apps yet.' }: Props = $props();
</script>

{#if apps.length === 0}
  <p class="empty">{emptyLabel}</p>
{:else}
  <ul class="grid" role="list">
    {#each apps as app (app.slug)}
      <li>
        <AppCard {...app} />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
  }
  .empty {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    padding: var(--space-md);
    border: 1px dashed var(--border-light);
  }
</style>
