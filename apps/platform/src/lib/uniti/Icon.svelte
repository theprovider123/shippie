<script lang="ts">
  import { ICONS } from './config';
  let {
    name,
    size = 18,
    color = 'currentColor',
    style = '',
  }: { name: string; size?: number; color?: string; style?: string } = $props();
  const paths = $derived(ICONS[name] ?? []);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  style="flex-shrink:0;{style}"
>
  {#each paths as d}
    <path {d} />
  {/each}
</svg>
