<script lang="ts">
  import AppCard from './AppCard.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
  import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';

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
    kind?: AppKind | null;
    kindStatus?: PublicKindStatus | null;
  }

  interface Props {
    apps: AppForGrid[];
    emptyLabel?: string;
    emptyBody?: string;
    emptyActionLabel?: string;
    emptyActionHref?: string;
  }

  let {
    apps,
    emptyLabel = 'No apps yet.',
    emptyBody = '',
    emptyActionLabel = '',
    emptyActionHref = '',
  }: Props = $props();
</script>

{#if apps.length === 0}
  <EmptyState
    title={emptyLabel}
    body={emptyBody}
    actionLabel={emptyActionLabel}
    actionHref={emptyActionHref}
  />
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
</style>
