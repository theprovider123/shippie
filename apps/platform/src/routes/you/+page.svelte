<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import SavedDock from '$lib/components/marketplace/SavedDock.svelte';
  import {
    describeOfflineHealth,
    formatOfflineBytes,
    getOfflineStorageEstimate,
    requestPersistentOfflineStorage,
  } from '$lib/offline/download-app';
  import { displayCategory, titleCap } from '$lib/marketplace/display-text';
  import { cachedSlugs, offlineStatuses, refreshCachedSlugs, repairAppOffline } from '$lib/stores/cached-slugs';
  import {
    clearLauncherMemory,
    hydrateLauncherMemory,
    launcherMemory,
    recordAppLaunch,
  } from '$lib/stores/launcher-memory';

  let { data }: { data: PageData } = $props();
  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let storagePinned = $state(false);
  let storagePinning = $state(false);

  type YouApp = (typeof data.apps)[number];

  const appBySlug = $derived.by(() => new Map(data.apps.map((app) => [app.slug, app])));
  const savedApps = $derived.by(() =>
    $launcherMemory.pinned
      .map((slug) => appBySlug.get(slug))
      .filter((app): app is YouApp => Boolean(app)),
  );
  const recentApps = $derived.by(() =>
    $launcherMemory.recents
      .map((recent) => {
        const app = appBySlug.get(recent.slug);
        return app ? { app, lastOpened: recent.lastOpened } : null;
      })
      .filter((item): item is { app: YouApp; lastOpened: string } => Boolean(item))
      .slice(0, 6),
  );
  const offlineApps = $derived.by(() =>
    data.apps.filter((app) => $cachedSlugs.has(app.slug) || $offlineStatuses[app.slug]?.state === 'saved'),
  );
  const offlineAttentionCount = $derived.by(() =>
    data.apps.filter((app) => {
      const state = $offlineStatuses[app.slug]?.state;
      return state === 'partial' || state === 'evicted' || state === 'error';
    }).length,
  );
  const totalLaunches = $derived.by(() =>
    Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, count) => sum + count, 0),
  );
  const localAppRows = $derived.by(() =>
    data.apps
      .map((app) => {
        const recent = $launcherMemory.recents.find((item) => item.slug === app.slug);
        const launches = $launcherMemory.launchCounts?.[app.slug] ?? 0;
        const saved = $launcherMemory.pinned.includes(app.slug);
        const offlineStatus = $offlineStatuses[app.slug];
        const health = describeOfflineHealth(offlineStatus, {
          cached: $cachedSlugs.has(app.slug),
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
        });
        const offline = health.state === 'ready';
        const offlineAttention = health.state === 'needs_refresh' || health.state === 'needs_connection' || health.state === 'failed';
        return {
          app,
          saved,
          recent,
          launches,
          offline,
          offlineAttention,
          health,
          hasLocalSignal: saved || Boolean(recent) || launches > 0 || offline || offlineAttention,
        };
      })
      .filter((row) => row.hasLocalSignal)
      .sort((a, b) => {
        const aTime = a.recent ? Date.parse(a.recent.lastOpened) : 0;
        const bTime = b.recent ? Date.parse(b.recent.lastOpened) : 0;
        return bTime - aTime || b.launches - a.launches;
      }),
  );
  const hasLocalData = $derived(
    savedApps.length > 0 || recentApps.length > 0 || offlineApps.length > 0 || totalLaunches > 0,
  );

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

  function theme(app: YouApp): string {
    return app.themeColor || '#E8603C';
  }

  function openedLabel(value: string): string {
    const opened = new Date(value);
    if (Number.isNaN(opened.getTime())) return 'recently';
    const minutes = Math.max(1, Math.round((Date.now() - opened.getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function clearLocalMemory() {
    if (!hasLocalData) return;
    const ok = window.confirm('Clear saved and recent launcher memory on this device? Offline app files stay saved.');
    if (ok) clearLauncherMemory();
  }

  function repairOfflineCopy(slug: string) {
    void repairAppOffline(slug).then(refreshStorageEstimate).catch(() => {});
  }
</script>

<svelte:head>
  <title>You · Shippie</title>
  <meta
    name="description"
    content="Your local Shippie profile: saved tools, recent launches, offline-ready apps, and optional account sync."
  />
</svelte:head>

<div class="you-page">
  <header class="you-head wrap">
    <p class="eyebrow">You</p>
    <div class="head-row">
      <div>
        <h1>This device</h1>
        <p class="lede">
          Saved tools, recent launches, and offline copies live here. Sign-in is optional.
        </p>
      </div>
      <a class="home-link" href="/">Home →</a>
    </div>
  </header>

  <!-- Summary first: the user's own state is the headline. Trust band
       drops below as a quiet expander. First-visit users (all stats 0)
       see a quiet "Nothing saved yet" hint instead of four big zeros. -->
  {#if hasLocalData}
    <section class="summary wrap" aria-label="Local Shippie summary">
      <div class="stat">
        <span>Saved</span>
        <strong>{savedApps.length}</strong>
      </div>
      <div class="stat">
        <span>Recent</span>
        <strong>{recentApps.length}</strong>
      </div>
      <div class="stat">
        <span>Offline</span>
        <strong>{offlineApps.length}</strong>
      </div>
      <div class="stat">
        <span>Launches</span>
        <strong>{totalLaunches}</strong>
      </div>
    </section>
  {:else}
    <p class="summary-empty wrap">
      Nothing saved yet — tap the ★ on any tool to keep it ready here.
    </p>
  {/if}

  <div class="content wrap">
    <SavedDock apps={savedApps} />

    <details class="trust-band wrap" aria-labelledby="trust-band-title">
      <summary>
        <span class="eyebrow">Your data on Shippie</span>
        <span class="trust-band-summary">
          Local by default, sealed optional cloud, no cross-app tracking. <em>Tap for the full list.</em>
        </span>
      </summary>
      <ul class="trust-band-list">
        <li><span aria-hidden="true">✓</span> Tools run on your device, offline by default.</li>
        <li><span aria-hidden="true">✓</span> Saved tools, recents, and app data stay on this device unless you back them up.</li>
        <li><span aria-hidden="true">✓</span> Backup, sync, and relay are optional and should be sealed when used.</li>
        <li><span aria-hidden="true">✖</span> Shippie does not read local app content.</li>
        <li><span aria-hidden="true">✖</span> Shippie doesn't track you across apps.</li>
      </ul>
      <div class="trust-band-grid">
        <article>
          <strong id="trust-band-title">Recorded (aggregate)</strong>
          <ul>
            <li>Which tools you opened (count only)</li>
            <li>App slug + version for compatibility</li>
            <li>Failed-deploy / error signals so makers can fix things</li>
            <li>Technical metadata for sealed backup, sync, relay, or private spaces when enabled</li>
          </ul>
        </article>
        <article>
          <strong>Not recorded</strong>
          <ul>
            <li>Form contents, photos, voice memos, or anything you typed inside an app</li>
            <li>Your identity across different tools</li>
            <li>IP address, browser fingerprint, or third-party tracking IDs</li>
          </ul>
        </article>
      </div>
    </details>

    <section class="panel" aria-labelledby="recent-title">
      <div class="section-head">
        <h2 id="recent-title">Recent</h2>
        <span>{recentApps.length > 0 ? 'local history' : 'nothing opened yet'}</span>
      </div>

      {#if recentApps.length > 0}
        <ul class="recent-list" role="list">
          {#each recentApps as item (item.app.slug)}
            {@const app = item.app}
            <li>
              <a
                class="recent-row"
                href={`/run/${encodeURIComponent(app.slug)}`}
                onclick={() => recordAppLaunch(app.slug)}
              >
                <span class="recent-icon">
                  <IconOrMonogram
                    name={app.name}
                    slug={app.slug}
                    iconUrl={app.iconUrl}
                    themeColor={theme(app)}
                    size={48}
                  />
                </span>
                <span class="recent-copy">
                  <strong>{titleCap(app.name)}</strong>
                  <small>{displayCategory(app.category)} · {openedLabel(item.lastOpened)}</small>
                </span>
                <span class="recent-action" aria-hidden="true">→</span>
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty-block">
          <p>Open a tool from Home and it will appear here.</p>
          <a href="/">Explore tools →</a>
        </div>
      {/if}
    </section>

    <section class="panel data-panel" aria-labelledby="data-title">
      <div class="section-head">
        <h2 id="data-title">Local data</h2>
        <span>on this device</span>
      </div>
      <div class="data-grid">
        <div>
          <strong>Launcher memory</strong>
          <p>Saved and recent tools are stored locally, with a cookie backup for this browser.</p>
        </div>
        <div>
          <strong>Offline copies</strong>
          <p>
            {offlineApps.length} {offlineApps.length === 1 ? 'tool is' : 'tools are'} ready without the network{offlineAttentionCount > 0 ? ` · ${offlineAttentionCount} need repair` : ''}.
          </p>
        </div>
        <div>
          <strong>Storage budget</strong>
          <p>
            {formatOfflineBytes(storageUsage) || 'Measuring'} used{storageQuota > 0 ? ` of ${formatOfflineBytes(storageQuota)}` : ''}.
            {storagePinned ? ' Browser storage is pinned.' : ' Pinning asks the browser to protect saved tools.'}
          </p>
        </div>
      </div>
      <div class="data-actions">
        <button type="button" class="secondary-action" disabled={storagePinned || storagePinning} onclick={pinStorage}>
          {storagePinned ? 'Storage pinned' : storagePinning ? 'Pinning storage' : 'Pin offline storage'}
        </button>
        <button type="button" class="text-danger" disabled={!hasLocalData} onclick={clearLocalMemory}>
          Clear local launcher memory
        </button>
      </div>
    </section>

    <section class="panel app-data-panel" aria-labelledby="app-data-title">
      <div class="section-head">
        <h2 id="app-data-title">Per-app data</h2>
        <span>{localAppRows.length > 0 ? 'local signals' : 'none yet'}</span>
      </div>
      {#if localAppRows.length > 0}
        <div class="app-data-table" role="table" aria-label="Local app data on this device">
          <div class="app-data-row app-data-head" role="row">
            <span role="columnheader">Tool</span>
            <span role="columnheader">Stored here</span>
            <span role="columnheader">Last opened</span>
            <span role="columnheader">Action</span>
          </div>
          {#each localAppRows as row (row.app.slug)}
            <div class="app-data-row" role="row">
              <strong>{titleCap(row.app.name)}</strong>
              <span>
                {[
                  row.saved ? 'saved' : '',
                  row.offline ? 'ready offline' : row.offlineAttention ? row.health.label.toLowerCase() : '',
                  row.launches > 0 ? `${row.launches} launch${row.launches === 1 ? '' : 'es'}` : '',
                ].filter(Boolean).join(' · ')}
              </span>
              <span>{row.recent ? openedLabel(row.recent.lastOpened) : 'not opened recently'}</span>
              {#if row.health.actionable && row.offlineAttention}
                <button type="button" class="table-action" onclick={() => repairOfflineCopy(row.app.slug)}>Repair</button>
              {:else}
                <a href={`/run/${encodeURIComponent(row.app.slug)}`} onclick={() => recordAppLaunch(row.app.slug)}>Open</a>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-block">
          <p>Save or open a tool and its local status will appear here.</p>
        </div>
      {/if}
      <div class="move-row">
        <div>
          <strong>Move to another phone</strong>
          <p>Use Your Data in the workspace to export, back up, or restore app data when you choose.</p>
        </div>
        <a href="/workspace?section=data">Open Your Data →</a>
      </div>
    </section>

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
            <a href="/dashboard">Dashboard →</a>
            <form method="POST" action="/auth/logout">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>

        {#if data.makerApps.length > 0}
          <div class="maker-strip">
            <span>{data.makerApps.length} {data.makerApps.length === 1 ? 'tool shipped' : 'tools shipped'}</span>
            <a href="/dashboard/apps">Manage apps →</a>
          </div>
        {:else}
          <div class="maker-strip">
            <span>No maker apps yet</span>
            <a href="/new">Ship a tool →</a>
          </div>
        {/if}
      {:else}
        <div class="account-row">
          <div>
            <strong>Use Shippie without an account.</strong>
            <p>Sign in only when you want sync, recovery, builder tools, or a dashboard.</p>
          </div>
          <div class="account-actions">
            <a href="/auth/login?return_to=%2Fyou">Sign in →</a>
            <a class="quiet" href="/new">Ship a tool</a>
          </div>
        </div>
      {/if}
    </section>
  </div>
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

  .head-row {
    display: flex;
    align-items: end;
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

  .lede {
    max-width: 36rem;
    margin-top: var(--space-sm);
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.5;
  }

  .home-link {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    border: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .home-link:hover {
    color: var(--sunset);
    border-color: var(--sunset);
  }

  /* Trust band as <details> — quiet by default; closed state shows
     just the eyebrow + one-line summary. The full list expands on tap.
     Designed to fit BELOW the user's saved/recent data so a returning
     user reads their content first. */
  .trust-band {
    margin-top: var(--space-xl);
    padding: var(--space-md) var(--space-lg);
    background: rgba(46, 125, 91, 0.05);
    border-left: 3px solid var(--success);
  }
  .trust-band > summary {
    cursor: pointer;
    list-style: none;
    display: grid;
    gap: 0.2rem;
    min-height: var(--touch-min, 44px);
    padding: 0.25rem 0;
  }
  .trust-band > summary::-webkit-details-marker { display: none; }
  .trust-band-summary {
    font-size: 0.92rem;
    color: var(--ink-soft-warm);
  }
  .trust-band-summary em {
    font-style: normal;
    color: var(--success);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-left: 0.3rem;
  }
  .trust-band[open] > summary .trust-band-summary em { display: none; }
  .trust-band-list {
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.3rem;
    font-size: 0.95rem;
  }
  .trust-band-list li { display: grid; grid-template-columns: 1.2rem 1fr; gap: 0.4rem; align-items: baseline; }
  .trust-band-list li span { font-family: ui-monospace, monospace; }
  .trust-band-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
    margin-top: 0.6rem;
  }
  @media (max-width: 640px) {
    .trust-band-grid { grid-template-columns: 1fr; }
  }
  .trust-band-grid article { padding: 0.6rem; background: rgba(255, 255, 255, 0.5); }
  .trust-band-grid strong { display: block; margin-bottom: 0.3rem; font-size: 0.92rem; }
  .trust-band-grid ul { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; font-size: 0.9rem; color: var(--ink-warm-line); }

  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    padding-top: var(--space-md);
  }

  /* Compact stat tile. The previous 104px height made the four boxes
     dominate above-the-fold even for users with content below; halved
     so the saved/recent surfaces lead. */
  .stat {
    min-height: 76px;
    padding: 12px 14px;
    display: grid;
    align-content: space-between;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }

  .stat span {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }

  .stat strong {
    font-family: var(--font-heading);
    font-size: clamp(1.6rem, 5vw, 2.2rem);
    line-height: 0.95;
    color: var(--text);
  }

  /* First-visit empty state — a quiet hint, not four big zeros. */
  .summary-empty {
    margin: var(--space-md) 0 0;
    padding: 14px 16px;
    border: 1px dashed var(--border-light);
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .content {
    padding-top: var(--space-xl);
  }

  .content :global(.dock-section) {
    margin-bottom: var(--space-lg);
  }

  .panel {
    margin-bottom: var(--space-xl);
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: 10px;
  }

  .section-head h2 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .section-head span {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
    text-align: right;
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border-light);
  }

  .recent-list li {
    border-bottom: 1px solid var(--border-light);
  }

  .recent-row {
    min-height: 72px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    color: inherit;
  }

  .recent-row:hover .recent-action {
    color: var(--sunset);
  }

  .recent-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
  }

  .recent-icon :global(.shippie-icon) {
    width: 48px !important;
    height: 48px !important;
  }

  .recent-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .recent-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-heading);
    font-size: 1.05rem;
  }

  .recent-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }

  .recent-action {
    color: var(--text-light);
    font-family: var(--font-mono);
  }

  .empty-block,
  .account-row,
  .data-grid,
  .maker-strip {
    border: 1px solid var(--border-light);
    background: var(--surface);
  }

  .empty-block {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-lg);
    color: var(--text-secondary);
  }

  .empty-block a,
  .account-actions a,
  .maker-strip a {
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--border-light);
  }

  .data-grid > div {
    padding: var(--space-md);
    background: var(--surface);
  }

  .data-grid strong,
  .account-row strong {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    color: var(--text);
  }

  .data-grid p,
  .account-row p {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.45;
  }

  .app-data-panel {
    grid-column: 1 / -1;
  }

  .app-data-table {
    display: grid;
    border-top: 1px solid var(--border-light);
  }

  .app-data-row {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.2fr) minmax(120px, 0.8fr) auto;
    gap: var(--space-sm);
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border-light);
    font-size: var(--small-size);
  }

  .app-data-head {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .app-data-row span {
    color: var(--text-secondary);
  }

  .app-data-row a,
  .app-data-row .table-action,
  .move-row a {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-decoration: none;
    background: transparent;
    cursor: pointer;
  }

  .app-data-row .table-action {
    color: var(--marigold);
  }

  .move-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border-light);
  }

  .move-row p {
    margin-top: 0.2rem;
    color: var(--text-secondary);
    font-size: var(--small-size);
  }

  .data-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
  }

  .secondary-action {
    min-height: var(--touch-min);
    padding: 0 12px;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }

  .secondary-action:disabled {
    cursor: default;
    color: var(--text-light);
    opacity: 0.7;
  }

  .text-danger {
    min-height: var(--touch-min);
    padding: 0 12px;
    border: 1px solid rgba(232, 96, 60, 0.35);
    background: transparent;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
  }

  .text-danger:disabled {
    cursor: not-allowed;
    color: var(--text-light);
    border-color: var(--border-light);
    opacity: 0.55;
  }

  .account-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-lg);
    align-items: center;
    padding: var(--space-lg);
  }

  .account-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .account-actions a,
  .account-actions button {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
  }

  .account-actions a:first-child {
    border-color: var(--sunset);
    color: var(--sunset);
  }

  .account-actions .quiet {
    color: var(--text-secondary);
  }

  .maker-strip {
    margin-top: 10px;
    min-height: 52px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    padding: 0 var(--space-md);
    color: var(--text-secondary);
    font-size: var(--small-size);
  }

  @media (max-width: 640px) {
    .you-page {
      padding-top: var(--space-md);
    }

    .you-head {
      padding-bottom: var(--space-md);
    }

    .head-row {
      align-items: start;
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

    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding-top: var(--space-md);
    }

    .stat {
      min-height: 78px;
      padding: 12px;
    }

    .content {
      padding-top: var(--space-md);
    }

    .panel {
      margin-bottom: var(--space-lg);
    }

    .recent-row {
      min-height: 64px;
      padding: 8px 0;
    }

    .section-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .data-grid,
    .account-row,
    .app-data-row {
      grid-template-columns: 1fr;
    }

    .move-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .account-actions {
      justify-content: stretch;
    }

    .account-actions a,
    .account-actions button {
      justify-content: center;
      flex: 1 1 120px;
    }

    .maker-strip {
      align-items: flex-start;
      flex-direction: column;
      justify-content: center;
      padding: 12px var(--space-md);
    }
  }
</style>
