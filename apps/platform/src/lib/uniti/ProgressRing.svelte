<script lang="ts">
  let {
    pct = 0,
    size = 56,
    stroke = 6,
    color = 'var(--primary)',
    label = '',
  }: { pct?: number; size?: number; stroke?: number; color?: string; label?: string } = $props();
  const r = $derived((size - stroke) / 2);
  const circ = $derived(2 * Math.PI * r);
  const offset = $derived(circ * (1 - pct / 100));
</script>

<div style="position:relative;width:{size}px;height:{size}px;flex-shrink:0;">
  <svg width={size} height={size} style="transform:rotate(-90deg);display:block;">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="#E8E6E3" stroke-width={stroke} />
    <circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={color}
      stroke-width={stroke}
      stroke-dasharray={circ}
      stroke-dashoffset={offset}
      stroke-linecap="round"
      style="transition:stroke-dashoffset 0.6s ease;"
    />
  </svg>
  {#if label}
    <div
      style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        font-size:{size * 0.21}px;font-weight:700;color:var(--text);"
    >
      {label}
    </div>
  {/if}
</div>
