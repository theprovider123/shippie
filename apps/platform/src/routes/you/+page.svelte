<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import {
    describeOfflineHealth,
    formatOfflineBytes,
    getOfflineStorageEstimate,
    requestPersistentOfflineStorage,
  } from '$lib/offline/download-app';
  import { cachedSlugs, offlineStatuses, refreshCachedSlugs, repairAppOffline } from '$lib/stores/cached-slugs';
  import {
    clearLauncherMemory,
    hydrateLauncherMemory,
    launcherMemory,
  } from '$lib/stores/launcher-memory';

  let { data }: { data: PageData } = $props();

  type YouApp = (typeof data.apps)[number];

  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let storagePinned = $state(false);
  let storagePinning = $state(false);

  const savedCount = $derived($launcherMemory.saved.length);
  const recentCount = $derived($launcherMemory.recents.length);
  const totalLaunches = $derived(
    Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, count) => sum + count, 0),
  );
  const offlineApps = $derived.by(() =>
    data.apps.filter((app) => $cachedSlugs.has(app.slug) || $offlineStatuses[app.slug]?.state === 'saved'),
  );
  const offlineAttentionRows = $derived.by(() =>
    data.apps
      .map((app) => {
        const status = $offlineStatuses[app.slug];
        const health = describeOfflineHealth(status, {
          cached: $cachedSlugs.has(app.slug),
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
        });
        return { app, health };
      })
      .filter(({ health }) => health.state === 'needs_refresh' || health.state === 'needs_connection' || health.state === 'failed'),
  );
  const hasLocalData = $derived(savedCount > 0 || recentCount > 0 || offlineApps.length > 0 || totalLaunches > 0);

  onMount(() => {
    hydrateLauncherMemory();
    void refreshCachedSlugs(data.apps.map((app) => app.slug));
    void refreshStorageEstimate();
  });

  async function refreshStorageEstimate() {
    const estimate = await getOfflineStorageEstimate();
    storageUsage = estimate.usage;
    storageQuota = estimate.quota;
    storagePinned = estimate.persisted;
  }

  async function pinStorage() {
    storagePinning = true;
    try {
      storagePinned = await requestPersistentOfflineStorage();
      await refreshStorageEstimate();
    } finally {
      storagePinning = false;
    }
  }

  function clearLocalMemory() {
    if (!hasLocalData) return;
    const ok = window.confirm('Clear saved and recent launcher memory on this device? Offline app files stay saved.');
    if (ok) clearLauncherMemory();
  }

  function repairOfflineCopy(app: YouApp) {
    void repairAppOffline(app.slug).then(refreshStorageEstimate).catch(() => {});
  }
</script>

<svelte:head>
  <title>You · Shippie</title>
  <meta
    name="description"
    content="Your Shippie settings: account, local device data, offline storage, maker tools, and help."
  />
</svelte:head>

<div class="you-page">
  <header class="you-head wrap">
    <p class="eyebrow">You</p>
    <div class="head-row">
      <div>
        <h1>Settings</h1>
        <p class="lede">Account, local data, offline storage, and builder tools. Your apps live in Dock and Tools.</p>
      </div>
      <a class="home-link" href="/dock">Dock →</a>
    </div>
  </header>

  <main class="content wrap">
    <section class="panel account-panel" aria-labelledby="account-title">
      <div class="section-head">
        <h2 id="account-title">Account</h2>
        <span>{data.user ? 'signed in' : 'optional'}</span>
      </div>
      {#if data.user}
        <div class="account-row">
          <div>
            <strong>{data.user.displayName ?? data.user.username ?? data.user.email}</strong>
            <p>{data.user.email}</p>
          </div>
          <div class="account-actions">
            <a href="/dashboard">Dashboard</a>
            <form method="POST" action="/auth/logout">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
      {:else}
        <div class="account-row">
          <div>
            <strong>Use Shippie without an account.</strong>
            <p>Sign in only for sync, recovery, builder tools, or a dashboard.</p>
          </div>
          <div class="account-actions">
            <a href="/auth/login?return_to=%2Fyou">Sign in</a>
          </div>
        </div>
      {/if}
    </section>

    <section class="nav-grid" aria-label="Shippie places">
      <a href="/dock">
        <span>Dock</span>
        <strong>{savedCount} saved · {recentCount} recent</strong>
        <small>Your running, saved, and recent tools.</small>
      </a>
      <a href="/tools">
        <span>Tools</span>
        <strong>Browse catalog</strong>
        <small>Search, view details, save, and open new tools.</small>
      </a>
      <a href="/dock?section=data">
        <span>Data</span>
        <strong>{offlineApps.length} offline</strong>
        <small>Export, restore, repair, and move local app data.</small>
      </a>
      <a href="/new">
        <span>Ship</span>
        <strong>{data.makerApps.length || 'Make'} tools</strong>
        <small>Publish or manage tools you build.</small>
      </a>
    </section>

    <section class="panel" aria-labelledby="device-title">
      <div class="section-head">
        <h2 id="device-title">This Device</h2>
        <span>local first</span>
      </div>
      <div class="metric-grid">
        <div>
          <span>Saved</span>
          <strong>{savedCount}</strong>
        </div>
        <div>
          <span>Recent</span>
          <strong>{recentCount}</strong>
        </div>
        <div>
          <span>Offline</span>
          <strong>{offlineApps.length}</strong>
        </div>
        <div>
          <span>Launches</span>
          <strong>{totalLaunches}</strong>
        </div>
      </div>
      <div class="data-grid">
        <div>
          <strong>Launcher memory</strong>
          <p>Saved and recent tools are stored locally, with a small cookie backup for this browser.</p>
        </div>
        <div>
          <strong>Storage budget</strong>
          <p>
            {formatOfflineBytes(storageUsage) || 'Measuring'} used{storageQuota > 0 ? ` of ${formatOfflineBytes(storageQuota)}` : ''}.
            {storagePinned ? ' Browser storage is protected.' : ' You can ask the browser to protect saved tools.'}
          </p>
        </div>
      </div>
      <div class="data-actions">
        <button type="button" class="secondary-action" disabled={storagePinned || storagePinning} onclick={pinStorage}>
          {storagePinned ? 'Storage protected' : storagePinning ? 'Protecting storage' : 'Protect offline storage'}
        </button>
        <button type="button" class="text-danger" disabled={!hasLocalData} onclick={clearLocalMemory}>
          Clear Dock memory
        </button>
      </div>
    </section>

    {#if offlineAttentionRows.length > 0}
      <section class="panel" aria-labelledby="offline-title">
        <div class="section-head">
          <h2 id="offline-title">Offline Repair</h2>
          <span>{offlineAttentionRows.length} need attention</span>
        </div>
        <div class="repair-list">
          {#each offlineAttentionRows.slice(0, 5) as row (row.app.slug)}
            <div class="repair-row">
              <div>
                <strong>{row.app.name}</strong>
                <p>{row.health.label}</p>
              </div>
              {#if row.health.actionable}
                <button type="button" onclick={() => repairOfflineCopy(row.app)}>Repair</button>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="panel" aria-labelledby="privacy-title">
      <div class="section-head">
        <h2 id="privacy-title">Privacy</h2>
        <span>device-first</span>
      </div>
      <details class="trust-band">
        <summary>
          Local by default, sealed optional cloud, no cross-app tracking.
        </summary>
        <ul>
          <li>Tools run on your device and keep app contents local unless you choose backup or sync.</li>
          <li>Shippie can count tool opens and versions for compatibility, but not what you type inside apps.</li>
          <li>Backup, sync, relay, and private spaces are optional surfaces you control.</li>
        </ul>
      </details>
    </section>

    <section class="panel" aria-labelledby="help-title">
      <div class="section-head">
        <h2 id="help-title">Help</h2>
        <span>support</span>
      </div>
      <div class="link-list">
        <a href="/docs">Docs</a>
        <a href="/dock?section=access">Access</a>
        <a href="/dock?section=data">Your data</a>
        <a href="/dashboard/apps">Maker dashboard</a>
      </div>
    </section>
  </main>
</div>

<style>
  .you-page {
    padding-top: var(--space-xl);
    padding-bottom: max(var(--space-3xl), env(safe-area-inset-bottom, 0px));
  }

  .you-head {
    padding-bottom: var(--space-lg);
    border-bottom: 1px solid var(--border-light);
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
  }

  .head-row,
  .section-head,
  .account-row,
  .repair-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-family: var(--font-heading);
    font-size: clamp(2.25rem, 8vw, 4.25rem);
    line-height: 0.96;
    letter-spacing: 0;
  }

  h2 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    letter-spacing: 0;
  }

  .lede {
    max-width: 36rem;
    margin-top: var(--space-sm);
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.5;
  }

  .home-link,
  .account-actions a,
  .account-actions button,
  .secondary-action,
  .text-danger,
  .repair-row button,
  .link-list a {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
  }

  .home-link:hover,
  .account-actions a:hover,
  .account-actions button:hover,
  .secondary-action:hover,
  .repair-row button:hover,
  .link-list a:hover {
    color: var(--sunset);
    border-color: var(--sunset);
  }

  .content {
    display: grid;
    gap: var(--space-xl);
    padding-top: var(--space-xl);
  }

  .panel {
    display: grid;
    gap: var(--space-md);
  }

  .section-head {
    align-items: baseline;
  }

  .section-head span {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .account-row,
  .data-grid,
  .metric-grid,
  .nav-grid,
  .repair-list,
  .trust-band,
  .link-list {
    border: 1px solid var(--border-light);
    background: var(--surface);
  }

  .account-row {
    padding: var(--space-lg);
  }

  .account-row strong,
  .data-grid strong,
  .repair-row strong {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    color: var(--text);
  }

  .account-row p,
  .data-grid p,
  .repair-row p {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.45;
  }

  .account-actions,
  .data-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .account-actions a:first-child {
    border-color: var(--sunset);
    color: var(--sunset);
  }

  .nav-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--border-light);
  }

  .nav-grid a {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
    min-height: 132px;
    padding: var(--space-md);
    background: var(--surface);
    color: inherit;
    text-decoration: none;
  }

  .nav-grid a:hover {
    background: var(--surface-alt);
  }

  .nav-grid span,
  .metric-grid span {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .nav-grid strong {
    font-family: var(--font-heading);
    font-size: 1.12rem;
    color: var(--text);
  }

  .nav-grid small {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.4;
  }

  .metric-grid,
  .data-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--border-light);
  }

  .metric-grid > div,
  .data-grid > div {
    display: grid;
    gap: 0.35rem;
    padding: var(--space-md);
    background: var(--surface);
  }

  .metric-grid strong {
    font-family: var(--font-heading);
    font-size: clamp(1.7rem, 5vw, 2.35rem);
    line-height: 0.95;
    color: var(--text);
  }

  .data-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .text-danger {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.35);
  }

  .secondary-action:disabled,
  .text-danger:disabled {
    cursor: default;
    color: var(--text-light);
    border-color: var(--border-light);
    opacity: 0.65;
  }

  .repair-list {
    display: grid;
  }

  .repair-row {
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-light);
  }

  .repair-row:last-child {
    border-bottom: 0;
  }

  .trust-band {
    padding: var(--space-md);
    border-left: 3px solid var(--success);
  }

  .trust-band summary {
    min-height: var(--touch-min);
    cursor: pointer;
    color: var(--text);
  }

  .trust-band ul {
    margin: 0.75rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.5;
  }

  .link-list {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    background: var(--border-light);
  }

  .link-list a {
    flex: 1 1 150px;
    border: 0;
    background: var(--surface);
  }

  @media (max-width: 760px) {
    .you-page {
      padding-top: var(--space-md);
    }

    .you-head {
      padding-bottom: var(--space-md);
    }

    .head-row,
    .account-row,
    .repair-row {
      align-items: flex-start;
      flex-direction: column;
    }

    h1 {
      font-size: clamp(2rem, 12vw, 2.7rem);
    }

    .lede {
      font-size: 1rem;
    }

    .home-link {
      display: none;
    }

    .content {
      gap: var(--space-lg);
      padding-top: var(--space-md);
    }

    .nav-grid,
    .metric-grid,
    .data-grid {
      grid-template-columns: 1fr;
    }

    .nav-grid a {
      min-height: 104px;
    }

    .section-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .account-actions,
    .data-actions {
      justify-content: stretch;
      width: 100%;
    }

    .account-actions a,
    .account-actions button,
    .secondary-action,
    .text-danger,
    .repair-row button {
      flex: 1 1 140px;
    }
  }
</style>
