<script lang="ts">
  import type { PageProps } from './$types';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import type { LeaderboardEntry } from '$server/db/queries/leaderboards';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Leaderboards — Shippie</title>
  <meta name="description" content="What's moving across the marketplace — this week's trending apps, brand-new launches, and the highest-rated tools on Shippie." />
</svelte:head>

<div class="page wrap">
  <header class="head">
    <p class="eyebrow">Shippie</p>
    <h1 class="title">Leaderboards</h1>
    <p class="lede">
      What's moving across the marketplace — this week's trending apps, brand-new launches, and the highest-rated tools on Shippie.
    </p>
  </header>

  {@render shelf('Trending this week', 'Most installs, last 7 days', data.trending, 'no installs yet — be the first to launch one')}
  {@render shelf('New this week', 'Launched in the last two weeks', data.rising, 'No new launches in the last two weeks.')}
  {@render shelf('Top-rated', '3+ ratings, highest average', data.rated, 'No apps with enough ratings yet.')}
</div>

{#snippet shelf(title: string, subtitle: string, entries: LeaderboardEntry[], emptyLabel: string)}
  <section class="shelf">
    <header class="shelf-head">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
    {#if entries.length === 0}
      <p class="empty">{emptyLabel}</p>
    {:else}
      <ul class="grid" role="list">
        {#each entries as e (e.slug)}
          <li>
            <a class="card" href={`/apps/${e.slug}`}>
              <IconOrMonogram
                name={e.name ?? e.slug}
                slug={e.slug}
                iconUrl={e.icon}
                themeColor={e.themeColor}
                size={56}
              />
              <div class="card-meta">
                <h3>{e.name ?? e.slug}</h3>
                {#if e.taglineOrDesc}
                  <p>{e.taglineOrDesc}</p>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<style>
  .page {
    padding: var(--space-2xl) 0 var(--space-3xl);
    max-width: 1080px;
    margin: 0 auto;
  }
  .head { margin-bottom: var(--space-2xl); }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-light);
    margin: 0;
  }
  .title {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 4vw, 3rem);
    margin: 0.25rem 0 var(--space-sm);
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--text-secondary);
    max-width: 580px;
    line-height: 1.5;
    margin: 0;
  }

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
  .shelf-head h2 {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .shelf-head p {
    color: var(--text-light);
    font-size: 13px;
    margin: 0;
  }
  .empty {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: var(--space-md);
    border: 1px dashed var(--border-light);
    margin: 0;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-md);
  }
  .card {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--sunset); }
  .card-meta { min-width: 0; }
  .card-meta h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-meta p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
