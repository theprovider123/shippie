<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends HTMLInputAttributes {
    value?: string | number;
  }

  let { value = $bindable(''), ...rest }: Props = $props();
</script>

<input class="input" bind:value {...rest} />

<style>
  .input {
    width: 100%;
    height: 48px;
    padding: 0 var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    color: var(--text);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 0;
    transition: border-color 0.2s var(--ease-out);
    outline: none;
  }
  .input:focus { border-color: var(--sunset); }
  .input::placeholder { color: var(--text-light); }
</style>
