<script lang="ts">
  import { GROUP_CFG } from './config';
  let { group }: { group: string } = $props();
  const c = $derived(GROUP_CFG[group] ?? { bg: '#F3F4F6', color: '#374151' });
</script>

<span
  style="font-size:9px;font-weight:700;letter-spacing:0.05em;padding:2px 5px;
    border-radius:4px;background:{c.bg};color:{c.color};text-transform:uppercase;"
>
  {group}
</span>
