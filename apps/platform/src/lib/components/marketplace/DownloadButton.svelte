<script lang="ts">
  import { onMount } from 'svelte';
  import { cachedSlugs, downloadAppAndTrack, removeAppAndTrack } from '$lib/stores/cached-slugs';
  import { getAppStatus, type AppDownloadProgress } from '$lib/offline/download-app';

  interface Props {
    slug: string;
  }

  let { slug }: Props = $props();

  type LocalState = 'idle' | 'downloading' | 'partial' | 'saved' | 'error';

  let buttonState = $state<LocalState>('idle');
  let progress = $state({ done: 0, total: 0 });
  let showRemove = $state(false);
  let errorMsg = $state<string | null>(null);

  // Reconcile with the store on mount; the store is populated by the
  // /apps page-level refreshCachedSlugs after first hydration.
  onMount(async () => {
    try {
      const status = await getAppStatus(slug);
      buttonState = status.state === 'downloading' ? 'idle' : status.state;
      progress = { done: status.done, total: status.total };
    } catch {
      // SW not active yet — leave idle. Store-driven derivation below
      // catches up if the SW activates later in the session.
      buttonState = 'idle';
    }
  });

  // Keep state in sync with the cross-component store (other cards
  // downloading the same slug, or "Clear all" wiping every slug).
  $effect(() => {
    const inStore = $cachedSlugs.has(slug);
    if (inStore && buttonState !== 'saved' && buttonState !== 'downloading') {
      buttonState = 'saved';
    } else if (!inStore && buttonState === 'saved') {
      buttonState = 'idle';
      progress = { done: 0, total: 0 };
    }
  });

  async function onSaveClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (buttonState === 'downloading') return;
    buttonState = 'downloading';
    errorMsg = null;
    try {
      const result = await downloadAppAndTrack(slug, (p: AppDownloadProgress) => {
        progress = { done: p.done, total: p.total };
      });
      buttonState = result.state === 'saved' ? 'saved' : 'partial';
      progress = { done: result.done, total: result.total };
    } catch (err) {
      buttonState = 'error';
      errorMsg = err instanceof Error ? err.message : 'download_failed';
    }
  }

  async function onRemoveClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showRemove = false;
    try {
      await removeAppAndTrack(slug);
      buttonState = 'idle';
      progress = { done: 0, total: 0 };
    } catch (err) {
      buttonState = 'error';
      errorMsg = err instanceof Error ? err.message : 'remove_failed';
    }
  }

  function onSavedClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showRemove = !showRemove;
  }
</script>

<div class="dl-wrap">
  {#if buttonState === 'idle'}
    <button
      type="button"
      class="dl-btn idle"
      onclick={onSaveClick}
      title="Save for offline use"
      aria-label="Save {slug} for offline use"
    >
      ↓ Save
    </button>
  {:else if buttonState === 'downloading'}
    <button
      type="button"
      class="dl-btn downloading"
      disabled
      aria-label="Saving {slug}, {progress.done} of {progress.total}"
    >
      <span class="spinner" aria-hidden="true"></span>
      {progress.total > 0 ? `${progress.done}/${progress.total}` : '...'}
    </button>
  {:else if buttonState === 'partial'}
    <button
      type="button"
      class="dl-btn partial"
      onclick={onSaveClick}
      title="Some files failed to save — tap to retry"
      aria-label="Retry saving {slug}"
    >
      ↻ Retry
    </button>
  {:else if buttonState === 'saved'}
    <button
      type="button"
      class="dl-btn saved"
      onclick={onSavedClick}
      aria-label="Saved offline. Tap to remove."
      aria-expanded={showRemove}
    >
      ✓ Offline
    </button>
    {#if showRemove}
      <button
        type="button"
        class="dl-remove"
        onclick={onRemoveClick}
        aria-label="Remove {slug} from offline"
      >
        Remove
      </button>
    {/if}
  {:else if buttonState === 'error'}
    <button
      type="button"
      class="dl-btn error"
      onclick={onSaveClick}
      title={errorMsg ?? 'Tap to retry'}
      aria-label="Retry saving {slug}"
    >
      ↻ Retry
    </button>
  {/if}
</div>

<style>
  .dl-wrap {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .dl-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
    transition: border-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .dl-btn:hover:not(:disabled) {
    border-color: var(--sage-leaf);
    color: var(--text);
  }
  .dl-btn.idle:hover {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
  }
  .dl-btn.downloading {
    border-color: var(--sage-moss);
    color: var(--sage-leaf);
    cursor: progress;
  }
  .dl-btn.partial {
    border-color: var(--marigold, #E8C547);
    color: var(--marigold, #E8C547);
  }
  .dl-btn.partial:hover {
    border-color: var(--marigold, #E8C547);
    color: var(--text);
    background: rgba(232, 197, 71, 0.08);
  }
  .dl-btn.saved {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
    background: rgba(122, 154, 110, 0.06);
  }
  .dl-btn.saved:hover {
    background: rgba(122, 154, 110, 0.12);
  }
  .dl-btn.error {
    border-color: var(--sunset);
    color: var(--sunset);
  }
  .dl-remove {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    border: 1px solid var(--sunset);
    background: var(--surface);
    color: var(--sunset);
    cursor: pointer;
    transition: background 0.15s var(--ease-out);
  }
  .dl-remove:hover {
    background: rgba(232, 96, 60, 0.08);
  }
  .spinner {
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: dl-spin 0.8s linear infinite;
  }
  @keyframes dl-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }
</style>
