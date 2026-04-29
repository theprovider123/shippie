<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    body?: string;
    actionLabel?: string;
    actionHref?: string;
    children?: Snippet;
  }

  let {
    title = 'Nothing here yet.',
    body = '',
    actionLabel = '',
    actionHref = '',
    children,
  }: Props = $props();
</script>

<div class="empty-state" role="status">
  <img
    src="/__shippie-pwa/icon.svg"
    alt=""
    width="64"
    height="64"
    class="mark"
    aria-hidden="true"
  />
  <h3 class="title">{title}</h3>
  {#if body}<p class="body">{body}</p>{/if}
  {#if children}{@render children()}{/if}
  {#if actionLabel && actionHref}
    <a class="action" href={actionHref}>{actionLabel} →</a>
  {/if}
</div>

<style>
  .empty-state {
    padding: var(--space-2xl);
    text-align: center;
    background: var(--surface);
    border: 1px dashed var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }
  .mark {
    opacity: 0.35;
    display: block;
  }
  .title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    letter-spacing: -0.015em;
    margin: 0;
  }
  .body {
    color: var(--text-secondary);
    max-width: 44ch;
    margin: 0;
    line-height: 1.55;
  }
  .action {
    display: inline-flex;
    align-items: center;
    padding: 0.6rem 1.1rem;
    background: var(--sunset);
    color: var(--bg-pure);
    font-family: var(--font-body);
    font-size: var(--small-size);
    font-weight: 600;
    margin-top: var(--space-xs);
    transition: background 0.18s var(--ease-out);
  }
  .action:hover { background: var(--sunset-hover); }
</style>
