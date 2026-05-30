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
    ToolTile,
    launcherAppToToolTile,
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
    onUnpin: (slug: string) => void;
    onSaveOffline: (slug: string) => void;
  }

  let { apps, onClose, onUnpin, onSaveOffline }: Props = $props();
  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let persisted = $state(false);
  let pinning = $state(false);
  const savedBytes = $derived(apps.reduce((sum, app) => sum + bytesFor(app.slug), 0));

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
</script>

<Sheet open onClose={onClose} label="Manage saved tools">
  <header class="sheet-head">
    <div>
      <p class="eyebrow">Manage</p>
      <h2 id="manage-saved-title">Saved tools</h2>
      <p class="lede">
        Sealed offline capsules on this device. Open one to launch it; unsave to remove the local copy.
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
      title="Ask the browser to protect saved capsules from eviction"
    >
      {persisted ? 'Pinned' : pinning ? 'Pinning' : 'Pin'}
    </button>
  </section>

  {#if apps.length === 0}
    <p class="empty">No saved tools yet. Tap the ★ on any tool to keep it ready here.</p>
  {:else}
    <ul class="list" role="list">
      {#each apps as app (app.slug)}
        {@const health = healthFor(app.slug)}
        <li class="row">
          <div class="row-tile">
            <ToolTile
              app={launcherAppToToolTile(app)}
              density="drawer"
              href={`/run/${encodeURIComponent(app.slug)}`}
              captionLabel={`${health.label}${bytesFor(app.slug) > 0 ? ` · ${formatBytes(bytesFor(app.slug))}` : ''}`}
              noActions
              onOpen={onClose}
            />
            <small class:warn={health.state !== 'ready'}>{health.detail}</small>
          </div>
          <span class="row-actions">
            <button
              type="button"
              class="row-btn"
              aria-label={`Refresh offline copy of ${app.name}`}
              title="Refresh offline copy"
              onclick={() => onSaveOffline(app.slug)}
            >
              ↻
            </button>
            <button
              type="button"
              class="row-btn danger"
              aria-label={`Remove ${app.name} from saved`}
              title="Unsave"
              onclick={() => onUnpin(app.slug)}
            >
              ★
            </button>
          </span>
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
    font-size: var(--caption-size);
    letter-spacing: 0;
    color: var(--text-light);
  }
  .sheet-head h2 {
    margin: 4px 0 6px;
    font-family: var(--font-heading);
    font-size: 1.5rem;
    letter-spacing: 0;
  }
  .lede {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
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
    font-size: 1.5rem;
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
    font-size: 10px;
    color: var(--text-light);
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .storage-budget strong {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    color: var(--text);
  }
  .storage-budget span:last-child {
    color: var(--text-secondary);
    font-size: 12px;
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
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 8px;
    align-items: center;
    border-bottom: 1px solid var(--border-light);
  }
  .row-tile {
    min-width: 0;
    display: grid;
    gap: 2px;
    padding: 4px 0;
  }
  .row-tile small {
    color: var(--text-light);
    font-size: 11px;
    line-height: 1.3;
    padding-left: 2px;
  }
  .row-tile small.warn {
    color: var(--marigold);
  }
  .row-actions {
    display: inline-flex;
    gap: 6px;
  }
  .row-btn {
    width: var(--touch-min);
    height: var(--touch-min);
    display: inline-grid;
    place-items: center;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.95rem;
    cursor: pointer;
  }
  .row-btn:hover { color: var(--text); border-color: var(--sunset); }
  .row-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
    color: var(--text);
  }
  .row-btn.danger {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.4);
    background: rgba(232, 197, 71, 0.06);
  }
  .row-btn.danger:hover { color: var(--sunset); border-color: var(--sunset); }
</style>
