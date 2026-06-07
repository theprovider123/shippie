<script lang="ts">
  import Icon from './Icon.svelte';
  import type { SyncStatus } from './config';
  let {
    status = 'synced',
    lastSync = 'just now',
    pending = 0,
  }: { status?: SyncStatus; lastSync?: string; pending?: number } = $props();

  const cfgMap: Record<SyncStatus, { bg: string; color: string; icon: string; label: string }> =
    $derived({
      synced: { bg: '#E8F6EF', color: '#2EAD73', icon: 'check', label: `Synced · ${lastSync}` },
      syncing: { bg: '#FEF0DC', color: '#E8953A', icon: 'sync_icon', label: 'Syncing...' },
      pending: {
        bg: '#FEF0DC',
        color: '#E8953A',
        icon: 'cloud',
        label: `${pending} event${pending !== 1 ? 's' : ''} pending`,
      },
      offline: { bg: '#F1F3F6', color: '#8B93A1', icon: 'cloud', label: 'Saved locally' },
    });
  const c = $derived(cfgMap[status] ?? cfgMap.synced);
</script>

<div
  style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;
    background:{c.bg};color:{c.color};font-size:12px;font-weight:600;"
>
  <Icon name={c.icon} size={12} />
  <span>{c.label}</span>
  {#if status === 'synced'}
    <span style="opacity:0.65;font-size:10px;font-weight:500;">· School Cloud</span>
  {/if}
</div>
