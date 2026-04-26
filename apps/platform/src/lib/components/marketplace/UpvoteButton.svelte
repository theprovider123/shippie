<script lang="ts">
  /**
   * UpvoteButton — heart icon + count, optimistic UI.
   *
   * Phase 4a stops short of wiring the POST handler — that lands in
   * Phase 4b along with the dashboard. Until then this still works as
   * a pure UI element: the click optimistically increments the local
   * count, sends the POST, and reverts on failure (the platform 404s
   * all writes pre-Phase-4b, which is the path we exercise).
   */
  interface Props {
    slug: string;
    initialCount: number;
    initiallyUpvoted?: boolean;
  }

  let { slug, initialCount, initiallyUpvoted = false }: Props = $props();
  let count = $state(initialCount);
  let isUpvoted = $state(initiallyUpvoted);
  let pending = $state(false);

  async function toggle() {
    if (pending) return;
    pending = true;
    const previousCount = count;
    const previousUpvoted = isUpvoted;
    isUpvoted = !isUpvoted;
    count += isUpvoted ? 1 : -1;
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/upvote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error('upvote_failed');
    } catch {
      count = previousCount;
      isUpvoted = previousUpvoted;
    } finally {
      pending = false;
    }
  }
</script>

<button
  type="button"
  class="upvote {isUpvoted ? 'voted' : ''}"
  onclick={toggle}
  aria-pressed={isUpvoted}
  disabled={pending}
>
  <span class="heart" aria-hidden="true">{isUpvoted ? '♥' : '♡'}</span>
  <span class="count">{count}</span>
</button>

<style>
  .upvote {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .upvote:hover { border-color: var(--sunset); color: var(--sunset); }
  .upvote.voted { border-color: var(--sunset); color: var(--sunset); }
  .upvote:disabled { opacity: 0.6; cursor: progress; }
  .heart { font-size: 1rem; line-height: 1; }
  .count { font-variant-numeric: tabular-nums; }
</style>
