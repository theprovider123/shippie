<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import RailShell from '$lib/container/RailShell.svelte';
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
  import { localFeedbackIds } from '$lib/feedback/local-store';
  import type { UserFeedbackView } from '$lib/feedback/history';

  let { data }: { data: PageData } = $props();

  type YouApp = (typeof data.apps)[number];

  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let storagePinned = $state(false);
  let storagePinning = $state(false);

  const dockToolCount = $derived.by(() => {
    const slugs = new Set<string>();
    for (const slug of $launcherMemory.saved) slugs.add(slug);
    for (const recent of $launcherMemory.recents) slugs.add(recent.slug);
    return slugs.size;
  });
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
  const hasLocalData = $derived(dockToolCount > 0 || offlineApps.length > 0 || totalLaunches > 0);
  const privateMakerCount = $derived(
    data.makerApps.filter((app) => app.visibilityScope === 'private').length,
  );

  // "Your feedback": signed-in items come from the loader (by user id); items
  // submitted on this device (incl. while signed out) are fetched by id from
  // the capability endpoint. Merge, server-authoritative, newest first.
  let localFeedback = $state<UserFeedbackView[]>([]);
  const feedbackHistory = $derived.by(() => {
    const byId = new Map<string, UserFeedbackView>();
    for (const item of localFeedback) byId.set(item.id, item);
    for (const item of data.myFeedback) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });

  function formatFeedbackDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
  }

  onMount(() => {
    hydrateLauncherMemory();
    void refreshCachedSlugs(data.apps.map((app) => app.slug));
    void refreshStorageEstimate();
    void loadLocalFeedback();
  });

  async function loadLocalFeedback() {
    const ids = localFeedbackIds();
    if (ids.length === 0) return;
    try {
      const res = await fetch(`/api/feedback/mine?ids=${ids.map(encodeURIComponent).join(',')}`);
      if (!res.ok) return;
      const payload = (await res.json()) as { items?: UserFeedbackView[] };
      localFeedback = Array.isArray(payload.items) ? payload.items : [];
    } catch {
      // best-effort — the local entries simply won't refresh
    }
  }

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
    const ok = window.confirm('Clear Dock memory on this device? Offline app files stay available.');
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

<RailShell user={data.user} current="you">
<div class="you-page">
  <header class="you-head wrap">
    <div class="head-row">
      <div>
        <h1>You</h1>
        <p class="lede">Account, device storage, local data, and builder tools. Dock is for launching; Tools is for browsing.</p>
      </div>
      <a class="home-link" href="/dock">Dock →</a>
    </div>
  </header>

  <main class="content wrap">
    <section class="overview-grid" aria-label="This device summary">
      <div>
        <span>Apps</span>
        <strong>{data.makerApps.length}</strong>
      </div>
      <div>
        <span>Dock</span>
        <strong>{dockToolCount}</strong>
      </div>
      <div>
        <span>Offline</span>
        <strong>{offlineApps.length}</strong>
      </div>
      <div>
        <span>Storage</span>
        <strong>{formatOfflineBytes(storageUsage) || '...'}</strong>
      </div>
    </section>

    <section class="panel app-panel" aria-labelledby="apps-title">
      <div class="section-head">
        <div>
          <h2 id="apps-title">Apps</h2>
          <p>{data.user ? `${data.makerApps.length} total · ${privateMakerCount} private` : 'Published and private apps appear after sign-in.'}</p>
        </div>
      </div>

      {#if data.user}
        <div class="maker-entry">
          <a class="primary" href="/maker/apps">Manage apps</a>
          <a href="/new">Ship app</a>
        </div>
      {:else}
        <div class="empty-apps">
          <strong>No account connected.</strong>
          <p>Your owned, private, and demo apps will appear here after you sign in.</p>
        </div>
      {/if}
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
            <a href="/you/access">Access</a>
            <a href="/maker">Maker</a>
            {#if data.user.isAdmin}
              <a href="/admin">Admin</a>
            {/if}
            <form method="POST" action="/auth/logout">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
      {:else}
        <div class="account-row">
          <div>
            <strong>Sign in for sync and builder tools.</strong>
            <p>Everything local still works without an account.</p>
          </div>
          <div class="account-actions">
            <a href="/auth/login?return_to=%2Fyou">Sign in</a>
          </div>
        </div>
      {/if}
    </section>

    <section class="panel" aria-labelledby="feedback-title">
      <div class="section-head">
        <div>
          <h2 id="feedback-title">Your feedback</h2>
          <p>
            {#if feedbackHistory.length > 0}
              Status and replies on what you sent.
            {:else if data.user}
              Feedback you send on any app appears here.
            {:else}
              Feedback you send on this device appears here.
            {/if}
          </p>
        </div>
        <span>{data.user ? 'account' : 'this device'}</span>
      </div>

      {#if feedbackHistory.length > 0}
        <div class="feedback-list">
          {#each feedbackHistory as item (item.id)}
            <div class="feedback-row">
              <div class="feedback-main">
                <div class="feedback-top">
                  <strong>{item.appName}</strong>
                  <span class="fb-status tone-{item.tone}">{item.status}</span>
                </div>
                {#if item.preview}<p class="feedback-preview">{item.preview}</p>{/if}
                {#if item.makerReply}
                  <p class="feedback-reply"><span>Maker reply</span>{item.makerReply}</p>
                {/if}
              </div>
              <time datetime={item.createdAt}>{formatFeedbackDate(item.createdAt)}</time>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-apps">
          <strong>No feedback yet.</strong>
          <p>Open any app and tap the feedback button next to Share to send an idea or report a bug.</p>
        </div>
      {/if}
    </section>

    <section class="panel" aria-labelledby="data-title">
      <div class="section-head">
        <div>
          <h2 id="data-title">Your data</h2>
          <p>Everything you save stays on this device unless you back it up.</p>
        </div>
        <span>{storagePinned ? 'protected' : 'local first'}</span>
      </div>
      <div class="device-grid">
        <div>
          <span>Storage</span>
          <strong>{formatOfflineBytes(storageUsage) || 'Measuring'}</strong>
          <small>{storageQuota > 0 ? `of ${formatOfflineBytes(storageQuota)}` : 'used locally'}</small>
        </div>
        <div>
          <span>Offline files</span>
          <strong>{storagePinned ? 'Protected' : 'Standard'}</strong>
          <small>{storagePinned ? 'Browser should keep saved tools.' : 'Ask the browser to protect saved tools.'}</small>
        </div>
      </div>

      {#if offlineAttentionRows.length > 0}
        <div class="repair-block">
          <p class="repair-head">
            {offlineAttentionRows.length} saved {offlineAttentionRows.length === 1 ? 'app needs' : 'apps need'} attention
          </p>
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
        </div>
      {/if}

      <div class="data-actions">
        <a href="/dock?section=data" class="secondary-action primary-action">Manage data →</a>
        <button type="button" class="secondary-action" disabled={storagePinned || storagePinning} onclick={pinStorage}>
          {storagePinned ? 'Storage protected' : storagePinning ? 'Protecting storage' : 'Protect offline storage'}
        </button>
        <button type="button" class="text-danger" disabled={!hasLocalData} onclick={clearLocalMemory}>
          Clear Dock memory
        </button>
      </div>
    </section>

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
        <a href="/maker/apps">Maker</a>
        {#if data.user?.isAdmin}
          <a href="/admin">Admin</a>
        {/if}
      </div>
    </section>
  </main>
</div>
</RailShell>

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
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1;
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
  .link-list a,
  .maker-entry a {
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
  .link-list a:hover,
  .maker-entry a:hover {
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

  .section-head p {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: var(--small-size);
  }

  .account-row,
  .overview-grid,
  .device-grid,
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
  .device-grid strong,
  .repair-row strong {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    color: var(--text);
  }

  .account-row p,
  .device-grid small,
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

  .app-panel {
    gap: var(--space-md);
  }

  .maker-entry {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .maker-entry a.primary {
    border-color: var(--sunset);
    color: var(--sunset);
  }

  .empty-apps {
    display: grid;
    gap: 0.55rem;
    align-items: start;
    padding: var(--space-lg);
    border: 1px solid var(--border-light);
    background: var(--surface);
  }

  .empty-apps strong {
    font-family: var(--font-heading);
    font-size: 1.1rem;
  }

  .empty-apps p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
  }

  .overview-grid span,
  .device-grid span {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .overview-grid,
  .device-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--border-light);
  }

  .overview-grid > div,
  .device-grid > div {
    display: grid;
    gap: 0.35rem;
    padding: var(--space-md);
    background: var(--surface);
  }

  .overview-grid strong {
    font-family: var(--font-heading);
    font-size: clamp(1.7rem, 5vw, 2.35rem);
    line-height: 0.95;
    color: var(--text);
  }

  .device-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .device-grid strong {
    line-height: 1.1;
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
    border: 1px solid var(--border-light);
    background: var(--surface);
  }

  .repair-row {
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-light);
  }

  .repair-row:last-child {
    border-bottom: 0;
  }

  .repair-block {
    margin-top: var(--space-md);
  }

  .repair-head {
    margin: 0 0 var(--space-sm);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .primary-action {
    border-color: var(--sunset);
    color: var(--sunset);
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
      line-height: 1;
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

    .overview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .device-grid {
      grid-template-columns: 1fr;
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
    .repair-row button,
    .maker-entry a {
      flex: 1 1 140px;
    }
  }

  .feedback-list {
    display: grid;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .feedback-row {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-light);
  }
  .feedback-row:last-child {
    border-bottom: 0;
  }
  .feedback-main {
    min-width: 0;
    display: grid;
    gap: 0.3rem;
  }
  .feedback-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .feedback-top strong {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--text);
  }
  .fb-status {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 7px;
    border: 1px solid var(--border-light);
    color: var(--text-light);
  }
  .fb-status.tone-open {
    border-color: var(--sunset);
    color: var(--sunset);
  }
  .fb-status.tone-progress {
    border-color: var(--warning);
    color: var(--warning);
  }
  .fb-status.tone-done {
    border-color: var(--success);
    color: var(--success);
  }
  .feedback-preview {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.4;
  }
  .feedback-reply {
    margin: 0.15rem 0 0;
    padding: 0.4rem 0.6rem;
    border-left: 2px solid var(--sunset);
    background: rgba(232, 96, 60, 0.05);
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.4;
  }
  .feedback-reply span {
    display: block;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .feedback-row time {
    flex-shrink: 0;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 11px;
  }
</style>
