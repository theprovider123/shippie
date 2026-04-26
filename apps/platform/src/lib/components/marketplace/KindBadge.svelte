<script lang="ts">
  import {
    publicKindLabel,
    type AppKind,
    type PublicKindStatus,
  } from '$lib/types/app-kind';

  interface Props {
    /** The platform's detected kind. Public truth — never `declaredKind`. */
    kind: AppKind | null | undefined;
    status: PublicKindStatus | null | undefined;
    compact?: boolean;
  }

  let { kind, status, compact = false }: Props = $props();

  const resolvedKind = $derived<AppKind>(kind ?? 'cloud');
  const resolvedStatus = $derived<PublicKindStatus>(status ?? 'estimated');
  const label = $derived(publicKindLabel(resolvedKind, resolvedStatus));
  const showBadge = $derived(kind !== null && kind !== undefined);

  const tooltip = $derived.by(() => {
    if (resolvedStatus === 'confirmed') {
      return `${label} — verified by runtime proof from real devices.`;
    }
    if (resolvedStatus === 'disputed') {
      return `${label} — the maker has filed a dispute; review pending.`;
    }
    if (resolvedKind === 'local') {
      return 'Works offline. Your data stays on this device.';
    }
    if (resolvedKind === 'connected') {
      return 'Your data stays on this device. Connects for live information.';
    }
    return 'Needs internet. Data is stored by the app maker or third-party services.';
  });
</script>

{#if showBadge}
  <span
    class="kind-badge kind-{resolvedKind} status-{resolvedStatus} {compact ? 'compact' : ''}"
    title={tooltip}
  >
    <span class="dot" aria-hidden="true"></span>
    {label}
  </span>
{/if}

<style>
  .kind-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid var(--border);
    color: var(--text-light);
    border-radius: 999px;
  }
  .kind-badge.compact {
    padding: 2px 8px;
    font-size: 10px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  /* Local — sage. Same colour token used elsewhere for "verified runtime proof". */
  .kind-local {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.5);
  }
  /* Connected — marigold (in-between energy). */
  .kind-connected {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.5);
  }
  /* Cloud — neutral. We don't penalise; we describe. */
  .kind-cloud {
    color: var(--text-light);
    border-color: var(--border);
  }
  /* Confirmed status fills the badge — same visual weight as proven
   * capability badges so they read as a single "earned" tier. */
  .kind-badge.status-confirmed {
    color: var(--bg-pure);
  }
  .kind-local.status-confirmed {
    background: var(--sage-moss);
    border-color: var(--sage-moss);
  }
  .kind-connected.status-confirmed {
    background: var(--marigold);
    border-color: var(--marigold);
    color: var(--text);
  }
  .kind-cloud.status-confirmed {
    background: var(--text-light);
    border-color: var(--text-light);
  }
  .status-disputed {
    opacity: 0.7;
    font-style: italic;
  }
</style>
