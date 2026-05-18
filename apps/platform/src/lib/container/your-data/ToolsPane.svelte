<script lang="ts">
  import type { ContainerApp, LocalRow } from '$lib/container/state';
  import type { AppReceipt } from '@shippie/app-package-contract';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
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
    onExportReceipts: () => void;
    receiptExport: string;
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
    onExportReceipts,
    receiptExport,
    dataTrustLine,
  }: Props = $props();

  let query = $state('');
  let openSheetForApp = $state<string | null>(null);
  let showExportDetail = $state(false);

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
</script>

<section class="card" aria-labelledby="tools-heading">
  <header>
    <div>
      <p class="mini-label">Tools</p>
      <h3 id="tools-heading">On this device</h3>
    </div>
    <input
      type="search"
      bind:value={query}
      placeholder="Search by name…"
      aria-label="Search installed tools"
    />
  </header>

  {#if installedApps.length === 0}
    <p class="empty">Nothing installed on this device yet. Visit Home to add a tool.</p>
  {:else if filteredApps.length === 0}
    <p class="empty">No tools match "{query}".</p>
  {:else}
    <ul class="rows">
      {#each filteredApps as app (app.id)}
        <li>
          <button class="row" onclick={() => (openSheetForApp = app.id)} aria-label={`Manage ${app.name}`}>
            <span class="icon" style={`--accent:${app.accent}`} aria-hidden="true">{initials(app.name)}</span>
            <span class="meta">
              <span class="name">{app.name}</span>
              <span class="count">{rowCount(app.id)} item{rowCount(app.id) === 1 ? '' : 's'}</span>
            </span>
            <KindBadge kind={app.appKind} status="estimated" compact />
            <span class="chev" aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if recoveredReceipts.length > 0}
  <section class="card waiting" aria-labelledby="waiting-heading">
    <h3 id="waiting-heading">Tool data waiting for package import</h3>
    <p class="lede">
      These came back from a backup, but the matching tool isn't installed here yet.
      The install record stays local until you import the matching <code>.shippie</code> archive.
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

<details class="export" bind:open={showExportDetail}>
  <summary>Export install records (advanced)</summary>
  <button class="export-button" onclick={onExportReceipts}>Generate install record JSON</button>
  {#if receiptExport}
    <pre>{receiptExport}</pre>
  {/if}
</details>

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
    grid-template-columns: var(--touch-min) 1fr auto auto;
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
  .export {
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: 0;
  }
  .export summary {
    list-style: none;
    cursor: pointer;
    padding: 12px 14px;
    color: var(--text-secondary);
    font-size: var(--small-size);
  }
  .export summary::-webkit-details-marker {
    display: none;
  }
  .export[open] summary {
    border-bottom: 1px solid var(--border-light);
  }
  .export-button {
    margin: 12px 14px 0;
    min-height: var(--touch-min);
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  pre {
    margin: 12px 14px;
    padding: var(--space-sm);
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    overflow: auto;
    max-height: 260px;
    font-size: var(--caption-size);
  }
  code {
    font-family: var(--font-mono);
  }
  @media (max-width: 640px) {
    .card {
      padding: var(--space-md);
    }
    .card header {
      display: grid;
      align-items: stretch;
    }
    .row {
      grid-template-columns: var(--touch-min) 1fr auto;
    }
    .row :global(.kind-badge) {
      display: none;
    }
  }
</style>
