<script lang="ts">
  import RecoverySheet from './RecoverySheet.svelte';

  type RecoveryAction = 'add-device' | 'move-phone' | 'recovery-card' | 'restore';

  interface Props {
    installedAppsCount: number;
    totalRows: number;
    onRecoveryAction: (action: RecoveryAction) => void;
    recoveryStatus: string;
  }

  const {
    installedAppsCount,
    totalRows,
    onRecoveryAction,
    recoveryStatus,
  }: Props = $props();

  let sheetOpen = $state(false);

  function pick(action: RecoveryAction) {
    sheetOpen = false;
    onRecoveryAction(action);
  }

  const deviceSummary = $derived(
    `This device has ${installedAppsCount} app${installedAppsCount === 1 ? '' : 's'} and ${totalRows} local item${totalRows === 1 ? '' : 's'}. Shippie can count them, not read them.`,
  );
</script>

<section class="section" aria-labelledby="devices-heading">
  <p class="mini-label">Move</p>
  <h3 id="devices-heading">Move to another device</h3>
  <p class="lede">
    Use this when you get a new phone, set up another device, or restore a backup.
  </p>

  <button class="primary" onclick={() => (sheetOpen = true)}>
    Move or recover <span aria-hidden="true">→</span>
  </button>

  <ul class="move-list" aria-label="Move and recovery options">
    <li>
      <strong>Move to a new phone</strong>
      <span>Pass your apps and data to another device.</span>
    </li>
    <li>
      <strong>Restore a backup</strong>
      <span>Bring back an encrypted copy you saved.</span>
    </li>
    <li>
      <strong>Recovery card</strong>
      <span>Keep a paper fallback for later.</span>
    </li>
  </ul>

  <p class="device-summary">{deviceSummary}</p>

  {#if recoveryStatus}
    <p class="status" role="status">{recoveryStatus}</p>
  {/if}
</section>

<RecoverySheet open={sheetOpen} onPick={pick} onClose={() => (sheetOpen = false)} />

<style>
  h3,
  p,
  ul {
    margin: 0;
  }
  .mini-label {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  h3 {
    font-family: var(--font-heading);
    font-size: 1.35rem;
    line-height: 1.1;
  }
  .lede {
    color: var(--text-secondary);
    line-height: 1.55;
    font-size: var(--small-size);
  }
  .section {
    display: grid;
    gap: var(--space-md);
  }
  .primary {
    min-height: 48px;
    padding: 0.7rem 1rem;
    border: 1px solid var(--sunset);
    background: var(--sunset);
    color: var(--bg);
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
  .move-list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 1px;
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .move-list li {
    min-height: 58px;
    padding: 10px 12px;
    display: grid;
    gap: var(--space-sm);
    background: var(--bg);
    font-size: var(--small-size);
  }
  .move-list strong {
    color: var(--text);
  }
  .move-list span {
    color: var(--text-secondary);
  }
  .device-summary {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
  }
  .status {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
  }
  @media (max-width: 640px) {
    h3 {
      font-size: 1.35rem;
    }
  }
</style>
