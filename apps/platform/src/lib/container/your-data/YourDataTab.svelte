<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import type { ContainerApp, LocalRow } from '$lib/container/state';
  import type { AppReceipt } from '@shippie/app-package-contract';
  import DevicesPane from './DevicesPane.svelte';
  import ToolsPane from './ToolsPane.svelte';
  import BackupPane from './BackupPane.svelte';

  type RecoveryAction = 'add-device' | 'move-phone' | 'recovery-card' | 'restore';
  type Pane = 'devices' | 'tools' | 'backup';

  interface Props {
    installedAppsCount: number;
    totalRows: number;
    triggerAppName: string | null;
    onDismissTrigger: () => void;
    onRecoveryAction: (action: RecoveryAction) => void;
    recoveryStatus: string;
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
    backupPassphrase: string;
    backupError: string;
    backupExport: string;
    onCreateBackup: () => void;
    restorePayload: string;
    restorePassphrase: string;
    restoreStatus: string;
    onRestore: () => void;
  }

  let {
    installedAppsCount,
    totalRows,
    triggerAppName,
    onDismissTrigger,
    onRecoveryAction,
    recoveryStatus,
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
    backupPassphrase = $bindable(),
    backupError,
    backupExport,
    onCreateBackup,
    restorePayload = $bindable(),
    restorePassphrase = $bindable(),
    restoreStatus,
    onRestore,
  }: Props = $props();

  let pane = $state<Pane>('tools');
  const appWord = $derived(installedAppsCount === 1 ? 'app' : 'apps');
  const itemSummary = $derived(
    totalRows === 0
      ? 'No app data has been saved yet.'
      : `${totalRows} local item${totalRows === 1 ? '' : 's'} saved across your apps.`,
  );
  const privacySummary = $derived(
    backupExport
      ? 'Shippie can count it, not read it. Your encrypted backup is ready.'
      : 'Shippie can count it, not read it. Backups are optional.',
  );
  const backupState = $derived(backupExport ? 'Ready' : 'Optional');
  const restoredCount = $derived(recoveredReceipts.length);

  onMount(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const requested = url.searchParams.get('pane');
    if (requested === 'apps') {
      pane = 'tools';
    } else if (requested === 'move') {
      pane = 'devices';
    } else if (requested === 'devices' || requested === 'tools' || requested === 'backup') {
      pane = requested;
    }
  });

  function pickPane(next: Pane) {
    pane = next;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('pane', next);
    replaceState(url, {});
  }
</script>

<div class="your-data-tab">
  <header class="head">
    <h2>Your data</h2>
    <p>Review local app data, move it to another device, or make a backup. Sign-in stays optional.</p>
  </header>

  <section class="data-overview" aria-label="Your data summary">
    <div>
      <span>Apps</span>
      <strong>{installedAppsCount}</strong>
      <small>{appWord} saved here</small>
    </div>
    <div>
      <span>Items</span>
      <strong>{totalRows}</strong>
      <small>{itemSummary}</small>
    </div>
    <div>
      <span>Backup</span>
      <strong>{backupState}</strong>
      <small>{privacySummary}</small>
    </div>
    <div>
      <span>Restored</span>
      <strong>{restoredCount}</strong>
      <small>Waiting receipts</small>
    </div>
  </section>

  {#if triggerAppName}
    <div class="data-trigger" role="status">
      <span><strong>{triggerAppName}</strong> opened this view. Review its local data from Apps below.</span>
      <button class="dismiss" onclick={onDismissTrigger}>Close</button>
    </div>
  {/if}

  <div class="segmented" role="tablist" aria-label="Your data sections">
    <button
      role="tab"
      aria-selected={pane === 'tools'}
      class:active={pane === 'tools'}
      onclick={() => pickPane('tools')}
    >Apps <span class="count">{installedAppsCount}</span></button>
    <button
      role="tab"
      aria-selected={pane === 'devices'}
      class:active={pane === 'devices'}
      onclick={() => pickPane('devices')}
    >Move</button>
    <button
      role="tab"
      aria-selected={pane === 'backup'}
      class:active={pane === 'backup'}
      onclick={() => pickPane('backup')}
    >Backup</button>
  </div>

  <div class="pane">
    {#if pane === 'tools'}
      <ToolsPane
        {installedApps}
        {receiptsByApp}
        {rowsByApp}
        {recoveredReceipts}
        {onOpenApp}
        {onClearData}
        {onUninstall}
        {onImportPackageForReceipt}
        {onForgetRecoveredReceipt}
        {dataTrustLine}
      />
    {:else if pane === 'devices'}
      <DevicesPane
        {installedAppsCount}
        {totalRows}
        {onRecoveryAction}
        {recoveryStatus}
      />
    {:else}
      <BackupPane
        bind:backupPassphrase
        {backupError}
        {backupExport}
        {onCreateBackup}
        bind:restorePayload
        bind:restorePassphrase
        {restoreStatus}
        {onRestore}
        {onExportReceipts}
        {receiptExport}
      />
    {/if}
  </div>
</div>

<style>
  .your-data-tab {
    display: grid;
    gap: var(--space-md);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .head {
    display: grid;
    gap: 0.4rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: clamp(2rem, 8vw, 3.25rem);
    line-height: 0.96;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .data-overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .data-overview > div {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
    padding: 14px 16px;
    background: var(--surface);
  }
  .data-overview span {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .data-overview strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-heading);
    font-size: clamp(1.6rem, 5vw, 2.2rem);
    font-weight: 600;
    line-height: 0.95;
    color: var(--text);
  }
  .data-overview small {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .data-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(232, 96, 60, 0.34);
    background: rgba(232, 96, 60, 0.08);
    font-size: 13px;
  }
  .dismiss {
    min-height: var(--touch-min);
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .segmented {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
  }
  .segmented button {
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .segmented button:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }
  .segmented button.active {
    background: var(--surface-alt);
    color: var(--sunset);
    font-weight: 600;
    box-shadow: inset 0 -2px 0 var(--sunset);
  }
  .count {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    padding: 1px 6px;
    border: 1px solid currentColor;
    opacity: 0.85;
  }
  .pane {
    display: grid;
    gap: var(--space-md);
  }
  @media (min-width: 1025px) {
    h2 {
      font-size: 2.6rem;
    }
  }
  @media (max-width: 640px) {
    .your-data-tab {
      gap: var(--space-md);
    }
    .head p:not(.eyebrow) {
      font-size: 1rem;
    }
    .data-overview {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .data-trigger {
      align-items: stretch;
      flex-direction: column;
    }
    .dismiss {
      justify-content: center;
    }
    .segmented {
      top: calc(var(--safe-top) + 62px);
    }
  }
</style>
