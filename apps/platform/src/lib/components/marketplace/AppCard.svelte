<script lang="ts">
  import IconOrMonogram from './IconOrMonogram.svelte';
  import CapabilityBadges from './CapabilityBadges.svelte';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';

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
  }: Props = $props();

  const blurb = $derived(tagline ?? description ?? `${name} on Shippie`);
</script>

<a class="app-card" href={`/apps/${slug}`}>
  <div class="row">
    <IconOrMonogram {name} {slug} {iconUrl} {themeColor} size={64} />
    <div class="meta">
      <h2 class="name">{name}</h2>
      <p class="kind">{type} · {category}</p>
      <p class="blurb">{blurb}</p>
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
    transition: border-color 0.2s, transform 0.2s;
  }
  .app-card:hover {
    border-color: rgba(232, 96, 60, 0.4);
    transform: translateY(-2px);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }
  .meta { min-width: 0; flex: 1; }
  .name {
    font-size: 1.0625rem;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  .counts {
    margin-top: 0.625rem;
    display: flex;
    gap: 12px;
    font-size: var(--caption-size);
    font-family: var(--font-mono);
    color: var(--text-light);
  }
</style>
