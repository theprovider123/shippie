<script lang="ts">
  import type { ContainerApp, LocalRow } from '$lib/container/state';
  import type { AppReceipt } from '@shippie/app-package-contract';
  import AppDataSheet from './AppDataSheet.svelte';

  interface Props {
    installedApps: ContainerApp[];
    receiptsByApp: Record<string, AppReceipt>;
    rowsByApp: Record<string, LocalRow[]>;
    recoveredReceipts: Array<{ appId: string; receipt: AppReceipt }>;
    onOpenApp: (id: string) => void;
    onClearData: (id: string) => void;
    onUninstall: (id: string) => void;
    onImportPackageForReceipt: (appId: string) => void;
    onForgetRecoveredReceipt: (appId: string) => void;
    dataTrustLine: (app: ContainerApp) => string;
  }

  const {
    installedApps,
    receiptsByApp,
    rowsByApp,
    recoveredReceipts,
    onOpenApp,
    onClearData,
    onUninstall,
    onImportPackageForReceipt,
    onForgetRecoveredReceipt,
    dataTrustLine,
  }: Props = $props();

  let query = $state('');
  let openSheetForApp = $state<string | null>(null);
  const showSearch = $derived(installedApps.length > 5);

  const filteredApps = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return installedApps;
    return installedApps.filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
  });

  function initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  }

  function rowCount(appId: string): number {
    return rowsByApp[appId]?.length ?? 0;
  }

  function itemLabel(count: number): string {
    if (count === 0) return 'No saved items yet';
    return `${count} local item${count === 1 ? '' : 's'}`;
  }
</script>

<section class="card" aria-labelledby="tools-heading">
  <header>
    <div>
      <p class="mini-label">Apps</p>
      <h3 id="tools-heading">Apps on this device</h3>
      <p class="lede">Tap an app to see what it keeps, clear its data, or uninstall it.</p>
    </div>
    {#if showSearch}
      <input
        type="search"
        bind:value={query}
        placeholder="Search apps…"
        aria-label="Search installed apps"
      />
    {/if}
  </header>

  {#if installedApps.length === 0}
    <p class="empty">No apps here yet. Use Home to add one.</p>
  {:else if filteredApps.length === 0}
    <p class="empty">No apps match "{query}".</p>
  {:else}
    <ul class="rows">
      {#each filteredApps as app (app.id)}
        {@const count = rowCount(app.id)}
        <li>
          <button class="row" onclick={() => (openSheetForApp = app.id)} aria-label={`Review data for ${app.name}`}>
            <span class="icon" style={`--accent:${app.accent}`} aria-hidden="true">{initials(app.name)}</span>
            <span class="meta">
              <span class="name">{app.name}</span>
              <span class="count">{itemLabel(count)}</span>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if recoveredReceipts.length > 0}
  <section class="card waiting" aria-labelledby="waiting-heading">
    <h3 id="waiting-heading">Restored app data</h3>
    <p class="lede">
      These came back from a backup, but the matching app is not installed here yet.
      Import the app package when you are ready to reconnect it.
    </p>
    <ul class="rows">
      {#each recoveredReceipts as item (item.appId)}
        <li class="row-waiting">
          <span class="meta">
            <span class="name">{item.receipt.name ?? item.appId}</span>
            <span class="count">v{item.receipt.version} · {rowCount(item.appId)} restored rows</span>
          </span>
          <span class="waiting-actions">
            <button onclick={() => onImportPackageForReceipt(item.appId)}>Import package</button>
            <button onclick={() => onForgetRecoveredReceipt(item.appId)}>Forget</button>
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if openSheetForApp}
  {@const app = installedApps.find((a) => a.id === openSheetForApp)}
  {#if app}
    <AppDataSheet
      {app}
      receipt={receiptsByApp[app.id]}
      rows={rowsByApp[app.id] ?? []}
      trustLine={dataTrustLine(app)}
      onOpen={() => onOpenApp(app.id)}
      onClearData={() => onClearData(app.id)}
      onUninstall={() => onUninstall(app.id)}
      onClose={() => (openSheetForApp = null)}
    />
  {/if}
{/if}

<style>
  h3,
  .mini-label,
  p {
    margin: 0;
  }
  .mini-label {
    margin-bottom: 4px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .card {
    padding: var(--space-lg);
    border: 1px solid var(--border-light);
    background: var(--surface);
    display: grid;
    gap: var(--space-md);
  }
  .card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  h3 {
    font-family: var(--font-heading);
    font-size: 1.35rem;
    line-height: 1.1;
  }
  .lede {
    margin-top: 0.35rem;
    color: var(--text-secondary);
    line-height: 1.55;
    font-size: var(--small-size);
  }
  input[type='search'] {
    flex: 1;
    min-width: 180px;
    min-height: var(--touch-min);
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: var(--type-body-mobile);
  }
  .empty {
    color: var(--text-secondary);
    font-size: var(--small-size);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .row {
    width: 100%;
    min-height: 68px;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: var(--touch-min) 1fr auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--border-light);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .row:hover {
    background: var(--surface);
  }
  .icon {
    width: var(--touch-min);
    height: var(--touch-min);
    display: grid;
    place-items: center;
    border: 1px solid var(--border-light);
    background: var(--accent, var(--surface));
    color: var(--bg-pure);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    font-weight: 700;
  }
  .meta {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .count {
    color: var(--text-secondary);
    font-size: var(--small-size);
  }
  .chev {
    color: var(--text-secondary);
    font-size: 1.1rem;
    line-height: 1;
  }
  .waiting {
    border-style: dashed;
    background: var(--surface);
  }
  .waiting .lede {
    color: var(--text-secondary);
    line-height: 1.55;
    font-size: var(--small-size);
  }
  .row-waiting {
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    flex-wrap: wrap;
  }
  .waiting-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .waiting-actions button {
    min-height: var(--touch-min);
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  @media (max-width: 640px) {
    .card {
      padding: var(--space-md);
    }
    .card header {
      display: grid;
      align-items: stretch;
    }
  }
</style>
