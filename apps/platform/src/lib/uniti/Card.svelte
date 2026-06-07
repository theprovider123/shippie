<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    children,
    style = '',
    onclick,
    hover = false,
    noPad = false,
  }: {
    children?: Snippet;
    style?: string;
    onclick?: (e: MouseEvent) => void;
    hover?: boolean;
    noPad?: boolean;
  } = $props();
  let hov = $state(false);
</script>

<div
  {onclick}
  onmouseenter={() => hover && (hov = true)}
  onmouseleave={() => hover && (hov = false)}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  onkeydown={onclick
    ? (e) => (e.key === 'Enter' || e.key === ' ') && onclick(e as unknown as MouseEvent)
    : undefined}
  style="background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);padding:{noPad ? '0' : '20px'};
    box-shadow:{hov ? 'var(--shadow-md)' : 'var(--shadow)'};
    transform:{hov && hover ? 'translateY(-1px)' : 'none'};transition:all 0.14s ease;
    cursor:{onclick ? 'pointer' : 'default'};{style}"
>
  {@render children?.()}
</div>
