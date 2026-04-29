<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    target?: string;
    rel?: string;
    'aria-label'?: string;
  }

  let {
    variant = 'primary',
    size = 'md',
    href,
    type = 'button',
    disabled = false,
    onclick,
    children,
    target,
    rel,
    'aria-label': ariaLabel,
  }: Props = $props();
</script>

{#if href}
  <a
    {href}
    {target}
    {rel}
    aria-label={ariaLabel}
    class="btn variant-{variant} size-{size}"
  >
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button
    {type}
    {disabled}
    {onclick}
    aria-label={ariaLabel}
    class="btn variant-{variant} size-{size}"
  >
    {#if children}{@render children()}{/if}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--font-body);
    font-weight: 600;
    border-radius: 0;
    cursor: pointer;
    transition: background var(--duration) var(--ease-out), border-color var(--duration) var(--ease-out);
    text-decoration: none;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .size-sm { padding: 0.5rem 1.125rem; font-size: var(--small-size); }
  .size-md { padding: 0.75rem 1.5rem; font-size: var(--body-size); }
  .size-lg { padding: 1rem 2.5rem; font-size: clamp(1rem, 2vw, 1.125rem); }

  .variant-primary {
    background: var(--sunset);
    color: var(--bg-pure);
  }
  .variant-primary:hover { background: var(--sunset-hover); }

  .variant-secondary {
    background: transparent;
    color: var(--text);
    border-color: var(--border);
  }
  .variant-secondary:hover { border-color: var(--text-secondary); }

  .variant-ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: transparent;
  }
  .variant-ghost:hover { color: var(--text); }
</style>
