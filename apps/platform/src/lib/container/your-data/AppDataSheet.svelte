<script lang="ts">
  import type { ContainerApp, LocalRow } from '$lib/container/state';
  import type { AppReceipt } from '@shippie/app-package-contract';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';

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

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="scrim"
  role="presentation"
  onclick={onClose}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={`${app.name} data`}>
  <div class="grab" aria-hidden="true"></div>
  <header>
    <h3>{app.name}</h3>
    <KindBadge kind={app.appKind} status="estimated" compact />
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
</div>

<style>
  h3,
  p,
  dl,
  dt,
  dd {
    margin: 0;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.36);
    z-index: 1000;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1001;
    margin: 0 auto;
    max-width: 520px;
    padding: 14px 18px calc(18px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border-light);
    background: var(--bg-pure);
    display: grid;
    gap: 12px;
    animation: rise 180ms ease-out;
  }
  @keyframes rise {
    from { transform: translateY(20px); opacity: 0.6; }
    to   { transform: translateY(0);    opacity: 1;   }
  }
  .grab {
    width: 36px;
    height: 4px;
    margin: 2px auto 6px;
    background: var(--border);
    border-radius: 2px;
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
    border-color: var(--text);
    background: var(--text);
    color: var(--bg-pure);
    font-weight: 600;
  }
  .actions .danger {
    color: #B6472D;
  }
  .disclosure {
    min-height: 36px;
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
    min-height: 44px;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  @media (min-width: 700px) {
    .sheet {
      bottom: auto;
      top: 50%;
      transform: translateY(-50%);
      border: 1px solid var(--border-light);
      animation: fade 140ms ease-out;
    }
    @keyframes fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .grab { display: none; }
  }
</style>
