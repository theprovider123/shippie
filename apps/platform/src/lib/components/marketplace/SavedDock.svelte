<script lang="ts">
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from './IconOrMonogram.svelte';
  import SavedManageSheet from './SavedManageSheet.svelte';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import {
    recordAppLaunch,
    togglePinnedApp,
  } from '$lib/stores/launcher-memory';
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
  const prewarmed = new Set<string>();

  function warm(slug: string) {
    if (prewarmed.has(slug)) return;
    prewarmed.add(slug);
    const href = `/run/${encodeURIComponent(slug)}`;
    void preloadData(href).catch(() => {});
  }

  function onLaunch(slug: string) {
    recordAppLaunch(slug);
  }

  function offlineFor(slug: string) {
    return $cachedSlugs.has(slug) || $offlineStatuses[slug]?.state === 'saved';
  }

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
</script>

<section class="dock-section" aria-labelledby="saved-dock-title">
  <header class="dock-header">
    <h2 id="saved-dock-title">Saved</h2>
    <button
      type="button"
      class="manage-btn"
      aria-label="Manage saved tools"
      onclick={() => (manageOpen = true)}
      disabled={apps.length === 0}
    >
      manage →
    </button>
  </header>

  {#if apps.length === 0}
    <p class="empty">
      <span>Tap the ★ on a tool to keep it ready here, offline.</span>
      <span class="empty-hint">no installs, no signups</span>
    </p>
  {:else}
    <ul
      class="rail"
      aria-label="Saved tools"
      class:single={apps.length === 1}
    >
      {#each apps as app (app.slug)}
        <li class="tile-item">
          <a
            class="tile"
            href={`/run/${encodeURIComponent(app.slug)}`}
            aria-label={`Open ${app.name}`}
            onpointerenter={() => warm(app.slug)}
            onfocus={() => warm(app.slug)}
            onclick={() => onLaunch(app.slug)}
          >
            <span class="tile-icon">
              <IconOrMonogram
                name={app.name}
                slug={app.slug}
                iconUrl={app.iconUrl}
                themeColor={app.themeColor}
                size={72}
              />
              {#if app.firstPartySigned}
                <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
              {/if}
              {#if offlineFor(app.slug)}
                <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
              {/if}
            </span>
            <span class="tile-name">{app.name}</span>
          </a>
        </li>
      {/each}
      {#if apps.length > 2}
        <li class="tile-item">
          <button
            type="button"
            class="tile manage"
            aria-label="Manage all saved tools"
            onclick={() => (manageOpen = true)}
          >
            <span class="tile-icon manage-icon" aria-hidden="true">＋</span>
            <span class="tile-name">All saved</span>
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</section>

{#if manageOpen}
  <SavedManageSheet
    apps={apps}
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
  .manage-btn[disabled] {
    color: var(--text-light);
    opacity: 0.4;
    cursor: not-allowed;
  }

  .empty {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
    padding: 14px 16px;
    margin: 0;
    border: 1px dashed var(--border);
    color: var(--text-secondary);
    font-size: 14px;
  }
  .empty-hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }

  .rail {
    list-style: none;
    margin: 0;
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 8px 0 12px;
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

  .tile-item {
    flex: 0 0 auto;
    width: 72px;
    scroll-snap-align: start;
  }
  .tile {
    width: 100%;
    display: grid;
    gap: 6px;
    justify-items: center;
    color: inherit;
    text-decoration: none;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .tile:focus-visible { outline: none; }
  .tile:focus-visible .tile-icon {
    outline: 2px solid var(--sunset);
    outline-offset: 3px;
  }
  .tile-icon {
    position: relative;
    width: 72px;
    height: 72px;
    display: inline-grid;
    place-items: center;
    transition: transform 0.15s var(--spring, ease);
  }
  .tile:hover .tile-icon { transform: scale(1.04); }
  .tile-icon :global(.shippie-icon) {
    width: 72px !important;
    height: 72px !important;
  }
  .dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--bg);
    border-radius: 50%;
  }
  .dot-signed { top: -3px; right: -3px; background: var(--sage-leaf); }
  .dot-offline { bottom: -3px; right: -3px; background: var(--text-secondary); }
  .tile-name {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.2;
    color: var(--text-secondary);
    text-align: center;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile.manage .manage-icon {
    background: transparent;
    color: var(--text-light);
    border: 1px dashed var(--border);
    font-family: var(--font-mono);
    font-size: 22px;
    width: 72px;
    height: 72px;
    transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
  }
  .tile.manage:hover .manage-icon {
    color: var(--text);
    border-color: var(--sunset);
  }

  /* Density: container queries below the standard width drop tile size */
  @container (max-width: 22rem) {
    .tile-item { width: 64px; }
    .tile-icon { width: 64px; height: 64px; }
    .tile-icon :global(.shippie-icon) { width: 64px !important; height: 64px !important; }
    .tile.manage .manage-icon { width: 64px; height: 64px; font-size: 20px; }
    .tile-name { max-width: 64px; font-size: 11px; }
  }
</style>
