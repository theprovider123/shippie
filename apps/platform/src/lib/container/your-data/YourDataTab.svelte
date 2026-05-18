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

  let pane = $state<Pane>('devices');
  const readableRows = 0;
  const backupState = $derived(backupExport ? 'Ready' : 'Local');

  onMount(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const requested = url.searchParams.get('pane');
    if (requested === 'devices' || requested === 'tools' || requested === 'backup') {
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
    <p class="eyebrow">Data</p>
    <h2>Your data</h2>
    <p>Local tools, sealed recovery, and what this device is holding now.</p>
  </header>

  <section class="data-summary" aria-label="Your data summary">
    <div>
      <span>Tools</span>
      <strong>{installedAppsCount}</strong>
    </div>
    <div>
      <span>Records</span>
      <strong>{totalRows}</strong>
    </div>
    <div>
      <span>Readable</span>
      <strong>{readableRows}</strong>
    </div>
    <div>
      <span>Backup</span>
      <strong>{backupState}</strong>
    </div>
  </section>

  <div class="segmented" role="tablist" aria-label="Your data sections">
    <button
      role="tab"
      aria-selected={pane === 'devices'}
      class:active={pane === 'devices'}
      onclick={() => pickPane('devices')}
    >Devices</button>
    <button
      role="tab"
      aria-selected={pane === 'tools'}
      class:active={pane === 'tools'}
      onclick={() => pickPane('tools')}
    >Tools <span class="count">{installedAppsCount}</span></button>
    <button
      role="tab"
      aria-selected={pane === 'backup'}
      class:active={pane === 'backup'}
      onclick={() => pickPane('backup')}
    >Backup</button>
  </div>

  <div class="pane">
    {#if pane === 'devices'}
      <DevicesPane
        {installedAppsCount}
        {totalRows}
        {triggerAppName}
        {onDismissTrigger}
        {onRecoveryAction}
        {recoveryStatus}
      />
    {:else if pane === 'tools'}
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
        {onExportReceipts}
        {receiptExport}
        {dataTrustLine}
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
  .eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
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
  .data-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .data-summary div {
    min-height: 88px;
    padding: 12px;
    display: grid;
    align-content: space-between;
    background: var(--surface);
  }
  .data-summary span {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }
  .data-summary strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-heading);
    font-size: clamp(1.8rem, 6vw, 2.7rem);
    font-weight: 600;
    line-height: 0.95;
    color: var(--text);
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
    background: var(--text);
    color: var(--bg-pure);
    font-weight: 600;
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
    .data-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .data-summary div {
      min-height: 76px;
    }
    .segmented {
      top: calc(var(--safe-top) + 62px);
    }
  }
</style>
