<script lang="ts">
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

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div
    class="scrim"
    role="presentation"
    onclick={onClose}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
  ></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Move or recover data">
    <div class="grab" aria-hidden="true"></div>
    <h3>Move or recover</h3>
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
  </div>
{/if}

<style>
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
    gap: 14px;
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
  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.05rem;
  }
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
    font-size: var(--small-size);
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
