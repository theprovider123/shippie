<script lang="ts">
  import SavedManageSheet from './SavedManageSheet.svelte';
  import {
    ToolRow,
    launcherAppToToolDisplay,
    toolState,
  } from '$lib/components/tool-surface';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import { removeSavedApp } from '$lib/stores/launcher-memory';
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
  const managedApps = $derived(apps);
  const savedSlugs = $derived(new Set(managedApps.map((app) => app.slug)));
  const EMPTY_SLUGS: ReadonlySet<string> = new Set();

  function onRemoveSaved(slug: string) {
    removeSavedApp(slug);
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

  function downloadFor(slug: string) {
    return $offlineStatuses[slug]?.state ?? ($cachedSlugs.has(slug) ? 'saved' : 'idle');
  }

  function stateFor(app: DockApp) {
    return toolState({
      slug: app.slug,
      isRunning: false,
      savedSlugs,
      recentSlugs: EMPTY_SLUGS,
      download: downloadFor(app.slug),
      updateSeverity: null,
      surface: 'dock',
    });
  }
</script>

{#if managedApps.length > 0}
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

    <ul class="saved-list" aria-label="Saved tools">
      {#each managedApps as app (app.slug)}
        <li class="saved-list-item">
          <ToolRow
            app={launcherAppToToolDisplay(app)}
            state={stateFor(app)}
            href={runHref(app.slug)}
            hideRelationship
          />
        </li>
      {/each}
      {#if managedApps.length > 2}
        <li class="saved-list-item">
          <button
            type="button"
            class="saved-manage"
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
    apps={managedApps}
    onClose={() => (manageOpen = false)}
    {onRemoveSaved}
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
    font-size: var(--text-subhead);
    font-weight: 600;
    letter-spacing: 0;
  }
  .manage-btn {
    background: none;
    border: 1px solid transparent;
    min-height: var(--touch-min);
    padding: 0 10px;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
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
  .saved-list {
    list-style: none;
    margin: 0;
    display: grid;
    padding: 0;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .saved-list-item {
    min-width: 0;
  }
  .saved-list-item:not(:last-child) {
    border-bottom: 1px solid var(--border-light);
  }
  .saved-list-item :global(.row) {
    border-bottom: 0;
  }
  .saved-manage {
    width: 100%;
    min-height: 64px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-light);
    background: transparent;
    border: 0;
    padding: 8px 12px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s var(--ease-out);
  }
  .saved-manage .manage-icon {
    width: 44px;
    height: 44px;
    display: inline-grid;
    place-items: center;
    border: 1px dashed var(--border);
    color: inherit;
    font-family: var(--font-mono);
    font-size: var(--text-subhead);
    transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
  }
  .saved-manage:hover { color: var(--text); }
  .saved-manage:hover .manage-icon { border-color: var(--sunset); color: var(--text); }
  .saved-manage:focus-visible .manage-icon {
    outline: 2px solid var(--sunset);
    outline-offset: 3px;
  }
  .saved-manage .manage-label {
    font-family: var(--font-body);
    font-size: var(--text-small);
    line-height: 1.2;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
