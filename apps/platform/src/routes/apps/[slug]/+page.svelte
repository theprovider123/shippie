<script lang="ts">
  import type { PageProps } from './$types';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import RatingsSummary from '$lib/components/marketplace/RatingsSummary.svelte';
  import CapabilityBadges from '$lib/components/marketplace/CapabilityBadges.svelte';
  import UpvoteButton from '$lib/components/marketplace/UpvoteButton.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { data }: PageProps = $props();

  // Subdomain for direct install. `shippie.app` post-cutover; the canary
  // form was `next.shippie.app` which still works since the wildcard
  // route covers both hostnames.
  function installUrl(slug: string): string {
    return `https://${slug}.shippie.app/`;
  }
</script>

<svelte:head>
  <title>{data.app.name} — Shippie</title>
  <meta name="description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
</svelte:head>

<header class="hero" style="background: {data.app.themeColor};">
  <div class="hero-wrap">
    <a href="/apps" class="back">← All apps</a>
    <div class="hero-row">
      <IconOrMonogram
        name={data.app.name}
        slug={data.app.slug}
        iconUrl={data.app.iconUrl}
        themeColor={data.app.themeColor}
        size={96}
      />
      <div class="hero-meta">
        <h1 class="title">{data.app.name}</h1>
        <p class="tagline">{data.app.tagline ?? data.app.description ?? ''}</p>
        <p class="kind">{data.app.type} · {data.app.category}</p>
        {#if data.capabilityBadges.length > 0}
          <div class="badges">
            <CapabilityBadges badges={data.capabilityBadges} max={5} />
          </div>
        {/if}
        <div class="cta-row">
          <a
            class="install-btn"
            href={installUrl(data.app.slug)}
            target="_blank"
            rel="noopener"
          >
            Open app →
          </a>
          <UpvoteButton slug={data.app.slug} initialCount={data.app.upvoteCount} />
        </div>
      </div>
    </div>
  </div>
</header>

<div class="body wrap">
  {#if data.grantedPermissions.length > 0}
    <section class="section">
      <h2>What this app can do</h2>
      <ul class="perms">
        {#each data.grantedPermissions as perm (perm)}
          <li>
            <span class="check" aria-hidden="true">✓</span>
            <span>{perm}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.changelog && data.changelog.entries.length > 0}
    <section class="section">
      <h2>Latest changes</h2>
      <p class="changelog-summary">{data.changelog.summary}</p>
      <ul class="changelog-entries">
        {#each data.changelog.entries as entry, i (i)}
          <li>{entry}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.ratingSummary.count > 0}
    <section class="section">
      <h2>Ratings &amp; reviews</h2>
      <RatingsSummary summary={data.ratingSummary} latest={data.latestReviews} />
    </section>
  {/if}

  <section class="section meta-row">
    <p class="meta-line">
      {data.app.installCount.toLocaleString()} installs · {data.app.upvoteCount.toLocaleString()} upvotes
    </p>
  </section>

  {#if data.isMaker}
    <section class="section">
      <Button href={`/dashboard/apps/${data.app.slug}`} variant="secondary">
        Open in dashboard →
      </Button>
    </section>
  {/if}
</div>

<style>
  .hero {
    color: #EDE4D3;
    padding: var(--space-2xl) 0;
  }
  .hero-wrap {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 clamp(1.5rem, 4vw, 3rem);
  }
  .back {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #EDE4D3;
    opacity: 0.85;
    margin-bottom: var(--space-xl);
  }
  .back:hover { opacity: 1; }
  .hero-row {
    display: flex;
    gap: var(--space-lg);
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .hero-meta { flex: 1; min-width: 240px; }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0;
    color: #EDE4D3;
  }
  .tagline {
    margin-top: 0.5rem;
    font-size: 1.125rem;
    opacity: 0.92;
    color: #EDE4D3;
  }
  .kind {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
    margin-top: 0.625rem;
  }
  .badges { margin-top: 1rem; }
  .cta-row {
    margin-top: var(--space-lg);
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .install-btn {
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 0 1.25rem;
    background: #14120F;
    color: var(--marigold);
    font-weight: 600;
    font-size: var(--small-size);
    transition: background 0.2s;
  }
  .install-btn:hover { background: #000; }

  .body {
    padding: var(--space-2xl) 0 var(--space-3xl);
    max-width: 880px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
  }
  .section h2 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    margin: 0 0 var(--space-md);
    letter-spacing: -0.01em;
  }
  .perms {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    font-size: var(--small-size);
  }
  @media (max-width: 480px) {
    .perms { grid-template-columns: 1fr; }
  }
  .perms li {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--text-secondary);
  }
  .check { color: var(--sage-leaf); }
  .changelog-summary { margin: 0 0 var(--space-sm); font-weight: 500; }
  .changelog-entries {
    list-style: none;
    padding: 0;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.7;
  }
  .changelog-entries li::before { content: '· '; }
  .meta-row { color: var(--text-light); font-family: var(--font-mono); font-size: var(--small-size); }
  .meta-line { margin: 0; }
</style>
