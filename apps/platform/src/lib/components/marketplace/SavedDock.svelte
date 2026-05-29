<script lang="ts">
  import SavedManageSheet from './SavedManageSheet.svelte';
  import {
    ToolTile,
    launcherAppToToolTile,
  } from '$lib/components/tool-surface';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import { togglePinnedApp } from '$lib/stores/launcher-memory';
  import { toast } from '$lib/stores/toast';

  interface DockApp {
    slug: string;
    name: string;
    iconUrl: string | null;
    themeColor: string;
    firstPartySigned?: boolean;
  }

  interface Props {
    apps: DockApp[];
  }

  let { apps }: Props = $props();
  let manageOpen = $state(false);
  const sealedApps = $derived(
    apps.filter((app) => $cachedSlugs.has(app.slug) || $offlineStatuses[app.slug]?.state === 'saved'),
  );

  function onUnpin(slug: string) {
    togglePinnedApp(slug);
    void removeAppAndTrack(slug).catch(() => {
      toast.push({ kind: 'error', message: 'Could not remove saved copy yet.' });
    });
  }

  function onSaveOffline(slug: string) {
    void ensureAppOffline(slug).catch(() => {
      toast.push({ kind: 'error', message: 'Could not save this tool yet.' });
    });
  }

  function runHref(slug: string): string {
    return `/run/${encodeURIComponent(slug)}`;
  }
</script>

{#if sealedApps.length > 0}
  <section class="dock-section" aria-labelledby="saved-dock-title">
    <header class="dock-header">
      <h2 id="saved-dock-title">Saved</h2>
      <button
        type="button"
        class="manage-btn"
        aria-label="Manage saved tools"
        onclick={() => (manageOpen = true)}
      >
        manage →
      </button>
    </header>

    <ul
      class="rail"
      aria-label="Saved tools"
      class:single={sealedApps.length === 1}
    >
      {#each sealedApps as app (app.slug)}
        <li class="rail-item">
          <ToolTile
            app={launcherAppToToolTile(app)}
            density="dock"
            href={runHref(app.slug)}
            pinned={true}
          />
        </li>
      {/each}
      {#if sealedApps.length > 2}
        <li class="rail-item">
          <button
            type="button"
            class="rail-manage"
            aria-label="Manage all saved tools"
            onclick={() => (manageOpen = true)}
          >
            <span class="manage-icon" aria-hidden="true">＋</span>
            <span class="manage-label">All saved</span>
          </button>
        </li>
      {/if}
    </ul>
  </section>
{/if}

{#if manageOpen}
  <SavedManageSheet
    apps={sealedApps}
    onClose={() => (manageOpen = false)}
    {onUnpin}
    {onSaveOffline}
  />
{/if}

<style>
  .dock-section {
    container-type: inline-size;
    margin-bottom: var(--space-xl);
  }
  .dock-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: 8px;
  }
  .dock-header h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .manage-btn {
    background: none;
    border: 1px solid transparent;
    min-height: var(--touch-min);
    padding: 0 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
    cursor: pointer;
    transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
  }
  .manage-btn:hover { color: var(--text); border-color: var(--border); }
  .manage-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
    color: var(--text);
  }
  .rail {
    list-style: none;
    margin: 0;
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 6px 0 10px;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, #000 92%, transparent);
    mask-image: linear-gradient(to right, #000 92%, transparent);
  }
  .rail::-webkit-scrollbar { display: none; }
  .rail.single {
    -webkit-mask-image: none;
    mask-image: none;
  }

  .rail-item {
    flex: 0 0 auto;
    width: 76px;
    scroll-snap-align: start;
  }
  .rail-manage {
    width: 76px;
    display: grid;
    gap: 6px;
    justify-items: center;
    color: var(--text-light);
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s var(--ease-out);
  }
  .rail-manage .manage-icon {
    width: 66px;
    height: 66px;
    display: inline-grid;
    place-items: center;
    border: 1px dashed var(--border);
    color: inherit;
    font-family: var(--font-mono);
    font-size: 22px;
    transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
  }
  .rail-manage:hover { color: var(--text); }
  .rail-manage:hover .manage-icon { border-color: var(--sunset); color: var(--text); }
  .rail-manage:focus-visible .manage-icon {
    outline: 2px solid var(--sunset);
    outline-offset: 3px;
  }
  .rail-manage .manage-label {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.2;
    text-align: center;
    max-width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container (max-width: 22rem) {
    .rail-item { width: 74px; }
    .rail-manage,
    .rail-manage .manage-label { width: 74px; max-width: 74px; }
    .rail-manage .manage-icon { width: 64px; height: 64px; font-size: 20px; }
  }
</style>
