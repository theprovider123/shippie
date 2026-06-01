<!--
  Phase 2 — slim resume/insight strip, shown in the workspace canvas
  directly above the active tool. One item, actionable-only (the selector
  returns null when nothing is worth acting on). Tap opens; × dismisses
  (and the parent collapses it to a small badge).
-->
<script lang="ts">
  import type { CanvasStripItem } from './canvas-strip';

  interface Props {
    item: CanvasStripItem;
    onOpen: (item: CanvasStripItem) => void;
    onDismiss: (item: CanvasStripItem) => void;
  }

  let { item, onOpen, onDismiss }: Props = $props();
</script>

<div class="canvas-strip" role="region" aria-label="Suggestion">
  <button class="strip-body" onclick={() => onOpen(item)}>
    <span class="strip-mark">{item.kind === 'resume' ? '↻' : '◆'}</span>
    <span class="strip-title">{item.title}</span>
    {#if item.body}<span class="strip-sub">{item.body}</span>{/if}
  </button>
  {#if item.remaining > 0}<span class="strip-more">+{item.remaining}</span>{/if}
  <button class="strip-x" aria-label="Dismiss" title="Dismiss" onclick={() => onDismiss(item)}>×</button>
</div>

<style>
  .canvas-strip {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 6px 12px;
    background: var(--sunset-glow, rgba(232, 96, 60, 0.08));
    border-bottom: 1px solid var(--border-light);
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .strip-body {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    padding: 0;
  }
  .strip-mark { color: var(--sunset); }
  .strip-title { color: var(--text); font-weight: 500; }
  .strip-sub { color: var(--text-light); }
  .strip-more {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-light);
    border: 1px solid var(--border-light);
    padding: 0 6px;
  }
  .strip-x {
    margin-left: auto;
    background: none;
    border: 0;
    color: var(--text-light);
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
  }
  .strip-x:hover { color: var(--text); }
</style>
