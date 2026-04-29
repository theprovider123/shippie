<script lang="ts">
  import IconOrMonogram from './IconOrMonogram.svelte';
  import CapabilityBadges from './CapabilityBadges.svelte';
  import KindBadge from './KindBadge.svelte';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
  import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';

  interface Props {
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
    /** True when the app has earned the Shippie Seal — top-trust marker. */
    sealed?: boolean;
  }

  let {
    slug,
    name,
    tagline,
    description,
    type,
    category,
    iconUrl,
    themeColor,
    upvoteCount = 0,
    installCount = 0,
    badges = [],
    kind = null,
    kindStatus = null,
    sealed = false,
  }: Props = $props();

  const blurb = $derived(tagline ?? description ?? `${name} on Shippie`);
  // Heuristic seal — earned when at least three proven capability badges land
  // (offline, local-AI, privacy A+ class); the official scoring lives upstream
  // and overrides this via the explicit `sealed` prop.
  const inferredSeal = $derived(badges.filter((b) => b.proven).length >= 3);
  const showSeal = $derived(sealed || inferredSeal);
</script>

<a class="app-card" class:sealed={showSeal} href={`/apps/${slug}`}>
  <div class="row">
    <IconOrMonogram {name} {slug} {iconUrl} {themeColor} size={64} />
    <div class="meta">
      <h2 class="name">
        <span class="name-text">{name}</span>
        {#if showSeal}
          <span
            class="seal"
            title="Shippie Seal — top-trust app. Privacy A+, security ≥ 95, fully offline."
            aria-label="Shippie Seal"
          >
            <img src="/__shippie-pwa/icon.svg" alt="" width="12" height="12" />
          </span>
        {/if}
      </h2>
      <p class="kind">{type} · {category}</p>
      <p class="blurb">{blurb}</p>
      {#if kind}
        <div class="kind-row">
          <KindBadge {kind} status={kindStatus} compact />
        </div>
      {/if}
      {#if badges.length > 0}
        <div class="badges">
          <CapabilityBadges {badges} max={3} compact />
        </div>
      {/if}
      <div class="counts">
        {#if upvoteCount > 0}
          <span aria-label="upvotes">♥ {upvoteCount}</span>
        {/if}
        {#if installCount > 0}
          <span aria-label="installs">{installCount.toLocaleString()} installs</span>
        {/if}
      </div>
    </div>
  </div>
</a>

<style>
  .app-card {
    display: block;
    padding: var(--space-lg);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    transition: border-color 0.18s var(--ease-out), background 0.18s var(--ease-out), transform 0.2s;
  }
  .app-card:hover {
    border-color: var(--sage-moss);
    background: var(--surface-alt);
    transform: translateY(-2px);
  }
  .app-card.sealed {
    border-color: var(--sunset);
  }
  .app-card.sealed:hover {
    border-color: var(--sunset-hover);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }
  .meta { min-width: 0; flex: 1; }
  .name {
    font-family: var(--font-heading);
    font-size: 1.0625rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 100%;
  }
  .name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--sunset);
    flex-shrink: 0;
  }
  .seal img {
    display: block;
    filter: brightness(0) invert(1);
  }
  .kind {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 4px 0 0;
  }
  .blurb {
    margin-top: 0.5rem;
    font-size: var(--small-size);
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .badges { margin-top: 0.625rem; }
  .kind-row { margin-top: 0.5rem; }
  .counts {
    margin-top: 0.625rem;
    display: flex;
    gap: 12px;
    font-size: var(--caption-size);
    font-family: var(--font-mono);
    color: var(--text-light);
  }
</style>
