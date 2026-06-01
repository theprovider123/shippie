<!--
  Phase 4 — mobile tool-switcher bottom sheet. Opened by the BottomDock
  "Tools" tab (via the switcherOpen store). Open tools first, then all tools
  as a tight grid, with Add/Manage at the bottom. Reuses the Phase 1 rail
  grouping so "what's open / pinned / recent" stays consistent.
-->
<script lang="ts">
  import type { RailGroups, RailTool } from './rail-groups';

  interface Props {
    open: boolean;
    groups: RailGroups;
    allApps: RailTool[];
    onOpen: (slug: string) => void;
    onClose: () => void;
  }
  let { open, groups, allApps, onOpen, onClose }: Props = $props();

  function pick(slug: string) {
    onOpen(slug);
    onClose();
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open}
  <!-- Backdrop dismiss; Escape (svelte:window) is the keyboard equivalent. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Switch tools" tabindex="-1">
      <div class="grab" aria-hidden="true"></div>

      {#if groups.open.length > 0}
        <p class="sheet-label">Open</p>
        {#each groups.open as t (t.slug)}
          <button class="sheet-row" onclick={() => pick(t.slug)}>
            <span class="sheet-icon" style="background:{t.accent}">{t.icon}</span>{t.name}<span class="sheet-live"></span>
          </button>
        {/each}
      {/if}

      {#if groups.pinned.length > 0}
        <p class="sheet-label">Pinned</p>
        {#each groups.pinned as t (t.slug)}
          <button class="sheet-row" onclick={() => pick(t.slug)}>
            <span class="sheet-icon" style="background:{t.accent}">{t.icon}</span>{t.name}
          </button>
        {/each}
      {/if}

      <p class="sheet-label">All tools</p>
      <div class="sheet-grid">
        {#each allApps as t (t.slug)}
          <button class="sheet-tile" onclick={() => pick(t.slug)} aria-label={t.name}>
            <span class="sheet-icon" style="background:{t.accent}">{t.icon}</span>
          </button>
        {/each}
      </div>

      <div class="sheet-foot">
        <a href="/tools">＋ Add tools</a>
        <a href="/workspace?section=data">Manage</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-scrim { position: fixed; inset: 0; z-index: 140; background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; justify-content: flex-end; }
  .sheet { background: var(--surface); border-top: 1px solid var(--border); border-radius: 14px 14px 0 0; padding: 10px 14px calc(14px + var(--safe-bottom)); max-height: min(80dvh, 720px); overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .grab { width: 38px; height: 4px; border-radius: 3px; background: var(--border); align-self: center; margin-bottom: 8px; }
  .sheet-label { font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-light); margin: var(--space-sm) 0 var(--space-xs); }
  .sheet-row { display: flex; align-items: center; gap: var(--space-sm); width: 100%; background: none; border: 0; color: var(--text); font-size: 0.9rem; padding: 0.45rem 0.2rem; text-align: left; cursor: pointer; }
  .sheet-row:hover { background: var(--surface-alt); }
  .sheet-live { width: 6px; height: 6px; border-radius: 50%; background: var(--success-soft); margin-left: auto; }
  .sheet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: var(--space-sm); }
  .sheet-tile { aspect-ratio: 1; border: 1px solid var(--border); background: var(--surface-alt); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .sheet-icon { width: 28px; height: 28px; flex: none; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 0.75rem; color: var(--bg); }
  .sheet-foot { display: flex; justify-content: space-between; border-top: 1px solid var(--border-light); padding-top: var(--space-sm); margin-top: var(--space-sm); }
  .sheet-foot a { font-size: 0.8rem; color: var(--text-secondary); text-decoration: none; }
  .sheet-foot a:hover { color: var(--text); }
</style>
