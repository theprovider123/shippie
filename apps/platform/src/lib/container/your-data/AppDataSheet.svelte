<script lang="ts">
  import type { ContainerApp, LocalRow } from '$lib/container/state';
  import type { AppReceipt } from '@shippie/app-package-contract';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';

  interface Props {
    app: ContainerApp;
    receipt: AppReceipt | undefined;
    rows: LocalRow[];
    trustLine: string;
    onOpen: () => void;
    onClearData: () => void;
    onUninstall: () => void;
    onClose: () => void;
  }

  const { app, receipt, rows, trustLine, onOpen, onClearData, onUninstall, onClose }: Props = $props();

  let showDetails = $state(false);
</script>

<Sheet open onClose={onClose} label={`${app.name} data`}>
  <header>
    <h3>{app.name}</h3>
    {#if app.appKind !== 'local'}
      <KindBadge kind={app.appKind} status="estimated" compact />
    {/if}
  </header>
  <p class="count">{rows.length} item{rows.length === 1 ? '' : 's'} on this device</p>

  <div class="actions">
    <button class="primary" onclick={() => { onOpen(); onClose(); }}>Open tool</button>
    <button class="danger" onclick={() => { onClearData(); onClose(); }}>Clear this tool's data</button>
    <button class="danger" onclick={() => { onUninstall(); onClose(); }}>Uninstall</button>
  </div>

  <button class="disclosure" onclick={() => (showDetails = !showDetails)} aria-expanded={showDetails}>
    {showDetails ? 'Hide' : 'Show'} technical details
  </button>
  {#if showDetails}
    <dl class="details">
      <div>
        <dt>Version</dt>
        <dd>{receipt?.version ?? app.version}</dd>
      </div>
      <div>
        <dt>Package hash</dt>
        <dd><code>{app.packageHash.slice(0, 24)}...</code></dd>
      </div>
      <div>
        <dt>Trust</dt>
        <dd>{trustLine}</dd>
      </div>
    </dl>
  {/if}

  <button class="close" onclick={onClose}>Close</button>
</Sheet>

<style>
  h3,
  p,
  dl,
  dt,
  dd {
    margin: 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  h3 {
    font-family: var(--font-heading);
    font-size: 1.1rem;
  }
  .count {
    color: var(--text-secondary);
    font-size: var(--small-size);
  }
  .actions {
    display: grid;
    gap: 8px;
  }
  .actions button {
    min-height: 48px;
    padding: 0.7rem 1rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .actions .primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: var(--bg);
    font-weight: 600;
  }
  .actions .danger {
    color: var(--danger-hover);
  }
  .disclosure {
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--small-size);
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
  }
  .details {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--border-light);
    background: var(--surface);
    font-size: var(--small-size);
  }
  .details div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  dt {
    color: var(--text-secondary);
  }
  dd {
    color: var(--text);
    text-align: right;
    overflow-wrap: anywhere;
  }
  code {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
  }
  .close {
    min-height: var(--touch-min);
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
</style>
