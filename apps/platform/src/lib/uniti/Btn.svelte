<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    children,
    variant = 'primary',
    icon = null,
    onclick,
    style = '',
    small = false,
    disabled = false,
  }: {
    children?: Snippet;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: string | null;
    onclick?: (e: MouseEvent) => void;
    style?: string;
    small?: boolean;
    disabled?: boolean;
  } = $props();

  let hov = $state(false);

  const variants = $derived({
    primary: { background: hov ? 'var(--primary-dark)' : 'var(--primary)', color: '#fff', border: 'none' },
    secondary: {
      background: hov ? 'var(--primary-light)' : 'transparent',
      color: 'var(--primary)',
      border: '1.5px solid var(--primary)',
    },
    ghost: {
      background: hov ? 'var(--surface-2, #f3f1ee)' : 'transparent',
      color: 'var(--text-muted)',
      border: '1.5px solid var(--border)',
    },
    danger: { background: hov ? '#BE2525' : '#D95A57', color: '#fff', border: 'none' },
  });
  const v = $derived(variants[variant] ?? variants.primary);
</script>

<button
  {disabled}
  onclick={disabled ? undefined : onclick}
  onmouseenter={() => (hov = true)}
  onmouseleave={() => (hov = false)}
  style="display:inline-flex;align-items:center;gap:7px;border-radius:var(--radius-sm);
    cursor:{disabled ? 'not-allowed' : 'pointer'};font-family:inherit;font-weight:600;
    font-size:{small ? 12 : 14}px;padding:{small ? '6px 12px' : '9px 16px'};
    opacity:{disabled ? 0.45 : 1};transition:all 0.14s ease;white-space:nowrap;
    letter-spacing:-0.01em;background:{v.background};color:{v.color};border:{v.border};{style}"
>
  {#if icon}<Icon name={icon} size={small ? 13 : 15} />{/if}
  {@render children?.()}
</button>
