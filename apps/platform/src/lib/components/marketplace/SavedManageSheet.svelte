<script lang="ts">
  import { onMount } from 'svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import {
    describeOfflineHealth,
    formatOfflineBytes,
    getOfflineStorageEstimate,
    requestPersistentOfflineStorage,
  } from '$lib/offline/download-app';
  import { cachedSlugs, offlineStatuses } from '$lib/stores/cached-slugs';
  import {
    ToolRow,
    launcherAppToToolDisplay,
    toolState,
  } from '$lib/components/tool-surface';

  interface SheetApp {
    slug: string;
    name: string;
    iconUrl: string | null;
    themeColor: string;
    firstPartySigned?: boolean;
  }

  interface Props {
    apps: SheetApp[];
    onClose: () => void;
    onRemoveSaved: (slug: string) => void;
    onSaveOffline: (slug: string) => void;
  }

  let { apps, onClose, onRemoveSaved, onSaveOffline }: Props = $props();
  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let persisted = $state(false);
  let pinning = $state(false);
  const savedBytes = $derived(apps.reduce((sum, app) => sum + bytesFor(app.slug), 0));
  const savedSlugs = $derived(new Set(apps.map((app) => app.slug)));
  const EMPTY_SLUGS: ReadonlySet<string> = new Set();

  onMount(() => {
    void refreshStorageEstimate();
  });

  async function refreshStorageEstimate() {
    const estimate = await getOfflineStorageEstimate();
    storageUsage = estimate.usage;
    storageQuota = estimate.quota;
    persisted = estimate.persisted;
  }

  async function pinStorage() {
    pinning = true;
    try {
      persisted = await requestPersistentOfflineStorage();
      await refreshStorageEstimate();
    } finally {
      pinning = false;
    }
  }

  function bytesFor(slug: string) {
    return $offlineStatuses[slug]?.totalBytes ?? 0;
  }

  function formatBytes(value: number | undefined) {
    return formatOfflineBytes(value) || 'size pending';
  }

  function healthFor(slug: string) {
    return describeOfflineHealth($offlineStatuses[slug], {
      cached: $cachedSlugs.has(slug),
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    });
  }

  function downloadFor(slug: string) {
    return $offlineStatuses[slug]?.state ?? ($cachedSlugs.has(slug) ? 'saved' : 'idle');
  }

  function stateFor(app: SheetApp) {
    return toolState({
      slug: app.slug,
      isRunning: false,
      savedSlugs,
      recentSlugs: EMPTY_SLUGS,
      download: downloadFor(app.slug),
      updateSeverity: null,
      surface: 'drawer',
    });
  }
</script>

<Sheet open onClose={onClose} label="Manage saved tools">
  <header class="sheet-head">
    <div>
      <p class="eyebrow">Manage</p>
      <h2 id="manage-saved-title">Saved tools</h2>
      <p class="lede">
        Saved Dock tools on this device. Remove one to take it out of Dock and delete its offline copy.
      </p>
    </div>
    <button
      type="button"
      class="close"
      aria-label="Close manage saved sheet"
      onclick={onClose}
    >
      ×
    </button>
  </header>

  <section class="storage-budget" aria-label="Offline storage budget">
    <div>
      <span class="budget-label">Saved copies</span>
      <strong>{formatBytes(savedBytes)}</strong>
      {#if storageQuota > 0}
        <span>{formatBytes(storageUsage)} used by Shippie in this browser, of {formatBytes(storageQuota)} quota</span>
      {:else}
        <span>{formatBytes(storageUsage)} used by Shippie in this browser</span>
      {/if}
    </div>
    <button
      type="button"
      class:pinned={persisted}
      disabled={pinning || persisted}
      onclick={pinStorage}
      title="Ask the browser to protect saved offline copies from eviction"
    >
      {persisted ? 'Protected' : pinning ? 'Protecting' : 'Protect'}
    </button>
  </section>

  {#if apps.length === 0}
    <p class="empty">No saved tools yet. Tap Save on any tool to keep it ready here.</p>
  {:else}
    <ul class="list" role="list">
      {#each apps as app (app.slug)}
        {@const health = healthFor(app.slug)}
        <li class="list-row">
          <div class="row-main">
            <ToolRow
              app={launcherAppToToolDisplay(app)}
              state={stateFor(app)}
              href={`/run/${encodeURIComponent(app.slug)}`}
              caption={`${health.label}${bytesFor(app.slug) > 0 ? ` · ${formatBytes(bytesFor(app.slug))}` : ''}`}
              hideRelationship
              onOpen={onClose}
              onSave={() => onSaveOffline(app.slug)}
              onRemove={() => onRemoveSaved(app.slug)}
            />
            <small class:warn={health.state !== 'ready'}>{health.detail}</small>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>

<style>
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0;
    color: var(--text-light);
  }
  .sheet-head h2 {
    margin: 4px 0 6px;
    font-family: var(--font-heading);
    font-size: var(--text-heading);
    letter-spacing: 0;
  }
  .lede {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-small);
    line-height: 1.5;
    max-width: 36rem;
  }
  .close {
    width: var(--touch-min);
    height: var(--touch-min);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-light);
    font-family: var(--font-heading);
    font-size: var(--text-heading);
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }
  .close:hover { color: var(--text); border-color: var(--sunset); }
  .close:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }

  .storage-budget {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin-bottom: var(--space-md);
    padding: 12px;
    border: 1px solid var(--border-light);
    background: rgba(255, 255, 255, 0.03);
  }
  .storage-budget div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .budget-label {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-light);
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .storage-budget strong {
    font-family: var(--font-heading);
    font-size: var(--text-body);
    color: var(--text);
  }
  .storage-budget span:last-child {
    color: var(--text-secondary);
    font-size: var(--text-caption);
  }
  .storage-budget button {
    min-width: 70px;
    min-height: var(--touch-min);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .storage-budget button:hover:not(:disabled) {
    border-color: var(--sunset);
    color: var(--sunset);
  }
  .storage-budget button.pinned {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
  }
  .storage-budget button:disabled {
    cursor: default;
    opacity: 0.75;
  }

  .empty {
    color: var(--text-secondary);
    padding: var(--space-md);
    border: 1px dashed var(--border);
    text-align: center;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border-light);
  }
  .list-row {
    display: block;
    border-bottom: 1px solid var(--border-light);
  }
  .list-row :global(.row) {
    border-bottom: 0;
  }
  .row-main {
    min-width: 0;
    display: grid;
    gap: 2px;
    padding: 4px 0;
  }
  .row-main small {
    color: var(--text-light);
    font-size: var(--text-caption);
    line-height: 1.3;
    padding-left: 2px;
  }
  .row-main small.warn {
    color: var(--marigold);
  }
</style>
