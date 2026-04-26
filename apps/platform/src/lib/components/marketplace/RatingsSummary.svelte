<script lang="ts">
  import type { RatingSummary, LatestReview } from '$server/db/queries/ratings';

  interface Props {
    summary: RatingSummary;
    latest: LatestReview[];
  }

  let { summary, latest }: Props = $props();

  const total = $derived(summary.count);
  const max = $derived(
    Math.max(
      summary.distribution[1],
      summary.distribution[2],
      summary.distribution[3],
      summary.distribution[4],
      summary.distribution[5],
      1,
    ),
  );
</script>

<div class="ratings">
  <div class="header">
    <span class="big-number">{total === 0 ? '—' : summary.average.toFixed(1)}</span>
    <span class="star" aria-hidden="true">★</span>
    <span class="count-label">
      {total === 0 ? 'No ratings yet' : `${total.toLocaleString()} rating${total === 1 ? '' : 's'}`}
    </span>
  </div>

  {#if total > 0}
    <div class="distribution">
      {#each [5, 4, 3, 2, 1] as star (star)}
        {@const n = summary.distribution[star as 1 | 2 | 3 | 4 | 5]}
        <div class="row">
          <span class="row-label">{star}★</span>
          <div class="bar"><div class="fill" style="width: {(n / max) * 100}%"></div></div>
          <span class="row-count">{n}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if latest.length > 0}
    <div class="reviews">
      {#each latest as r (r.userId + r.createdAt)}
        <article class="review">
          <header class="review-head">
            <span class="stars" aria-label="{r.rating} out of 5 stars">
              {'★'.repeat(r.rating)}
            </span>
            <span class="reviewer">{r.userId.slice(0, 8)}</span>
          </header>
          {#if r.review}
            <p class="review-body">{r.review}</p>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ratings { color: var(--text); }
  .header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }
  .big-number { font-size: 32px; font-weight: 600; color: var(--text); }
  .star { color: var(--sunset); }
  .count-label { color: var(--text-secondary); font-size: 14px; }
  .distribution {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 20px;
  }
  .row {
    display: grid;
    grid-template-columns: 24px 1fr 40px;
    gap: 8px;
    align-items: center;
  }
  .row-label { font-size: 12px; color: var(--text-light); }
  .bar {
    height: 8px;
    background: var(--surface);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill { height: 100%; background: var(--sunset); }
  .row-count { font-size: 12px; color: var(--text-light); text-align: right; }
  .reviews { display: flex; flex-direction: column; gap: 12px; }
  .review {
    padding: 12px;
    background: var(--surface);
    border-radius: 8px;
  }
  .review-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .stars { color: var(--sunset); }
  .reviewer {
    font-size: 11px;
    color: var(--text-light);
    font-family: var(--font-mono);
  }
  .review-body {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }
</style>
