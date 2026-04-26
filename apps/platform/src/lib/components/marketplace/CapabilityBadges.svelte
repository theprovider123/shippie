<script lang="ts">
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';

  interface Props {
    badges: PublicCapabilityBadge[];
    max?: number;
    compact?: boolean;
  }

  let { badges, max = 5, compact = false }: Props = $props();

  const visible = $derived(badges.slice(0, max));
</script>

{#if visible.length > 0}
  <ul class="badges {compact ? 'compact' : ''}" role="list">
    {#each visible as b (b.label)}
      <li
        class="badge status-{b.status}"
        title={b.status === 'pass'
          ? 'Verified — autopackager observed this capability'
          : 'Declared by app — not independently verified'}
      >
        {b.label}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .badges {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid var(--border);
    color: var(--text-light);
  }
  .badges.compact .badge {
    padding: 2px 6px;
    font-size: 10px;
  }
  .status-pass {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.5);
  }
  .status-warn {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.5);
  }
</style>
