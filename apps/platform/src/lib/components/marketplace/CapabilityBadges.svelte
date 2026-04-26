<script lang="ts">
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';

  interface Props {
    badges: PublicCapabilityBadge[];
    max?: number;
    compact?: boolean;
  }

  let { badges, max = 5, compact = false }: Props = $props();

  const visible = $derived(badges.slice(0, max));

  function tooltip(b: PublicCapabilityBadge): string {
    if (b.proven) {
      return 'Proven — runtime evidence from real devices in real use.';
    }
    if (b.status === 'pass') {
      return 'Detected — the autopackager saw this in the deploy.';
    }
    return 'Declared by app — not independently verified.';
  }
</script>

{#if visible.length > 0}
  <ul class="badges {compact ? 'compact' : ''}" role="list">
    {#each visible as b (b.label)}
      <li
        class="badge status-{b.status}"
        class:proven={b.proven}
        title={tooltip(b)}
      >
        {#if b.proven}<span class="proof-mark" aria-hidden="true">✓</span>{/if}
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
    gap: 4px;
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
  /*
   * Proven badges read stronger than autopack/profile detections —
   * filled background instead of outline, brighter colour. Distinct
   * enough to scan at a glance on a card grid.
   */
  .badge.proven {
    color: var(--bg-pure);
    background: var(--sage-moss);
    border-color: var(--sage-moss);
  }
  .proof-mark {
    font-weight: 700;
    font-size: 0.85em;
    line-height: 1;
  }
</style>
