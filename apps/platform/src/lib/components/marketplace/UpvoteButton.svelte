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
    background: var(--bg-pure, #fff);
    border: 1px solid var(--text);
    border-radius: 999px;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s, transform 0.1s;
  }
  .upvote:hover {
    border-color: var(--sunset);
    color: var(--sunset);
    /* Keep the bg pure on hover — the previous 6% sunset tint
       disappeared into cream card backgrounds. Border + colour swap
       is enough signal. */
  }
  .upvote.voted {
    border-color: var(--sunset);
    color: var(--bg-pure);
    background: var(--sunset);
  }
  .upvote.voted:hover { transform: translateY(-1px); }
  .upvote:disabled { opacity: 0.55; cursor: progress; }
  .heart { font-size: 1.05rem; line-height: 1; }
  .count { font-variant-numeric: tabular-nums; }
</style>
