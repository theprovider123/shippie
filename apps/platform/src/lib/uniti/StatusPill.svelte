<script lang="ts">
  import { FEEDBACK_CONFIG } from './config';
  let { status, small = false }: { status: string; small?: boolean } = $props();
  const cfg = $derived(FEEDBACK_CONFIG[status]);
</script>

{#if cfg}
  <span
    style="font-size:{small ? 11 : 12}px;font-weight:600;
      padding:{small ? '2px 7px' : '3px 9px'};border-radius:20px;
      background:{cfg.bg};color:{cfg.color};display:inline-flex;align-items:center;
      gap:4px;white-space:nowrap;"
  >
    <span>{cfg.emoji}</span><span>{cfg.label}</span>
  </span>
{/if}
