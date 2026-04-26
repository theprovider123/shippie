<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    href?: string;
    featured?: boolean;
    children?: Snippet;
    class?: string;
  }

  let { href, featured = false, children, class: klass = '' }: Props = $props();
</script>

{#if href}
  <a {href} class="card {featured ? 'card-featured' : ''} {klass}">
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <div class="card {featured ? 'card-featured' : ''} {klass}">
    {#if children}{@render children()}{/if}
  </div>
{/if}

<style>
  .card {
    display: block;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-xl);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.3s var(--ease-out), transform 0.3s var(--ease-out);
  }
  .card:hover {
    border-color: rgba(232, 96, 60, 0.3);
    transform: translateY(-2px);
  }
  .card-featured {
    border-color: rgba(232, 96, 60, 0.25);
    background: var(--surface-alt);
  }
</style>
