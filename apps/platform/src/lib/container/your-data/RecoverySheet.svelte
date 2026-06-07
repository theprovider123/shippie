<script lang="ts">
  import Sheet from '$lib/components/ui/Sheet.svelte';

  type RecoveryAction = 'add-device' | 'move-phone' | 'recovery-card' | 'restore';

  interface Props {
    open: boolean;
    onPick: (action: RecoveryAction) => void;
    onClose: () => void;
  }

  const { open, onPick, onClose }: Props = $props();

  const choices: { action: RecoveryAction; title: string; sub: string }[] = [
    { action: 'add-device', title: 'Add another device', sub: 'Keep this phone, also use an iPad or laptop.' },
    { action: 'move-phone', title: 'Move to a new phone', sub: 'Hand everything over, then clear this device.' },
    { action: 'recovery-card', title: 'Show recovery card', sub: 'Paper key in case both devices are lost.' },
    { action: 'restore', title: 'Restore from a copy', sub: 'Pick up where another device left off.' },
  ];
</script>

<Sheet {open} {onClose} title="Move or recover">
  <ul>
    {#each choices as choice (choice.action)}
      <li>
        <button onclick={() => onPick(choice.action)}>
          <strong>{choice.title}</strong>
          <small>{choice.sub}</small>
        </button>
      </li>
    {/each}
  </ul>
  <button class="close" onclick={onClose}>Close</button>
</Sheet>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li button {
    width: 100%;
    min-height: 60px;
    padding: 12px 14px;
    display: grid;
    gap: 2px;
    text-align: left;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  li button strong {
    font-weight: 600;
  }
  li button small {
    color: var(--text-secondary);
    font-size: var(--text-small);
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
