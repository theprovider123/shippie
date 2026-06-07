<script lang="ts">
  import { avatarColor } from './config';
  let {
    initials = '?',
    size = 40,
    statusColor = null,
    style = '',
  }: { initials?: string; size?: number; statusColor?: string | null; style?: string } = $props();
  const bg = $derived(avatarColor(initials));
</script>

<div
  style="
    width:{size}px;height:{size}px;border-radius:50%;
    background:{bg}22;color:{bg};border:2px solid {bg}55;
    display:flex;align-items:center;justify-content:center;
    font-size:{size * 0.3}px;font-weight:700;flex-shrink:0;letter-spacing:-0.01em;
    outline:{statusColor ? `3px solid ${statusColor}` : 'none'};
    outline-offset:{statusColor ? '2px' : '0'};transition:outline 0.15s;{style}"
>
  {initials}
</div>
