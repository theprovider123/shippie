<script lang="ts">
  import RecoverySheet from './RecoverySheet.svelte';

  type RecoveryAction = 'add-device' | 'move-phone' | 'recovery-card' | 'restore';

  interface Props {
    installedAppsCount: number;
    totalRows: number;
    triggerAppName: string | null;
    onDismissTrigger: () => void;
    onRecoveryAction: (action: RecoveryAction) => void;
    recoveryStatus: string;
  }

  const {
    installedAppsCount,
    totalRows,
    triggerAppName,
    onDismissTrigger,
    onRecoveryAction,
    recoveryStatus,
  }: Props = $props();

  let sheetOpen = $state(false);

  function pick(action: RecoveryAction) {
    sheetOpen = false;
    onRecoveryAction(action);
  }
</script>

{#if triggerAppName}
  <div class="data-trigger" role="status">
    <span><strong>{triggerAppName}</strong> opened this panel.</span>
    <button class="dismiss" onclick={onDismissTrigger}>Dismiss</button>
  </div>
{/if}

<section class="card" aria-labelledby="devices-heading">
  <p class="mini-label">Private by default</p>
  <h3 id="devices-heading">This device</h3>
  <p class="lede">
    Move saved tools to another phone, restore from a backup, or keep everything local.
  </p>

  <button class="primary" onclick={() => (sheetOpen = true)}>
    Move or recover data <span aria-hidden="true">→</span>
  </button>

  <dl class="stats">
    <div>
      <dt>Tools</dt>
      <dd>{installedAppsCount}</dd>
    </div>
    <div>
      <dt>Local rows</dt>
      <dd>{totalRows}</dd>
    </div>
    <div>
      <dt>Readable by Shippie</dt>
      <dd>0</dd>
    </div>
  </dl>

  {#if recoveryStatus}
    <p class="status" role="status">{recoveryStatus}</p>
  {/if}
</section>

<RecoverySheet open={sheetOpen} onPick={pick} onClose={() => (sheetOpen = false)} />

<style>
  h3,
  p,
  dl,
  dt,
  dd {
    margin: 0;
  }
  .mini-label {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    color: var(--sunset);
  }
  h3 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    line-height: 1.2;
  }
  .lede {
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .data-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: var(--space-md);
    padding: 12px 14px;
    border: 1px solid var(--border-light);
    background: rgba(232, 96, 60, 0.08);
    font-size: 13px;
  }
  .dismiss {
    min-height: var(--touch-min);
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .card {
    padding: var(--space-lg);
    border: 1px solid var(--border-light);
    background: var(--surface);
    display: grid;
    gap: var(--space-md);
  }
  .primary {
    min-height: 48px;
    padding: 0.7rem 1rem;
    border: 1px solid var(--text);
    background: var(--text);
    color: var(--bg-pure);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .primary:hover {
    opacity: 0.92;
  }
  .stats {
    display: grid;
    gap: 1px;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .stats div {
    min-height: 46px;
    padding: 0 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    background: var(--bg);
    font-size: var(--small-size);
  }
  dt {
    color: var(--text-secondary);
  }
  dd {
    color: var(--text);
    font-weight: 500;
  }
  .status {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
  }
  @media (max-width: 640px) {
    .card {
      padding: var(--space-md);
    }
    h3 {
      font-size: 1.35rem;
    }
    .data-trigger {
      align-items: stretch;
      flex-direction: column;
    }
    .dismiss {
      justify-content: center;
    }
  }
</style>
