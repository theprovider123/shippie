<!--
  P1A.5 (deep container split, A1.5) — transfer-drop grant prompt
  modal.

  Bug fix: the P1A.3 commit (77ccbab) wired up `pendingTransferQueue`
  state + `approvePendingTransfer` / `declinePendingTransfer` handlers,
  but never rendered a modal. Drag-drops between apps would queue but
  surface invisibly. This component renders the missing modal.

  Mirrors IntentPromptModal's shape so the two prompts feel like one
  consistent grant-flow vocabulary.
-->
<script lang="ts">
  export interface PendingTransferPromptShape {
    sourceId: string;
    sourceName: string;
    targetId: string;
    targetName: string;
    kind: string;
  }

  interface Props {
    prompt: PendingTransferPromptShape | null;
    onApprove: () => void;
    onDeny: () => void;
  }

  let { prompt, onApprove, onDeny }: Props = $props();
</script>

{#if prompt}
  <div class="intent-prompt-backdrop" role="presentation">
    <div class="intent-prompt" role="dialog" aria-labelledby="transfer-prompt-title">
      <h3 id="transfer-prompt-title">Send to another app</h3>
      <p>
        <strong>{prompt.sourceName}</strong> wants to send
        <code>{prompt.kind}</code> data to <strong>{prompt.targetName}</strong>.
      </p>
      <p class="hint">
        Allowing this once means future drops from {prompt.sourceName} reach
        {prompt.targetName} silently. Both apps stay sandboxed. You can revoke later in Your Data.
      </p>
      <div class="intent-prompt-actions">
        <button class="intent-deny" onclick={onDeny}>Deny</button>
        <button class="intent-allow" onclick={onApprove}>Allow</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Reuses the same visual language as IntentPromptModal — the two
     prompts feel like one grant vocabulary. The styles are duplicated
     rather than imported because Svelte component-scoped CSS doesn't
     cross component boundaries. */
  .intent-prompt-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 18, 15, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-md);
  }
  .intent-prompt {
    background: var(--bg);
    border: 1px solid var(--border-light);
    border-radius: 0;
    padding: var(--space-lg);
    max-width: 440px;
    width: 100%;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  }
  .intent-prompt h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
  }
  .intent-prompt p {
    margin: 0 0 0.75rem 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .intent-prompt code {
    background: var(--surface-alt);
    padding: 0.1rem 0.3rem;
    border-radius: 0;
    font-size: 0.85rem;
  }
  .intent-prompt .hint {
    color: var(--text-light);
    font-size: 0.85rem;
  }
  .intent-prompt-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: var(--space-md);
  }
  .intent-prompt-actions button {
    padding: 0.5rem 1rem;
    border-radius: 0;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .intent-deny {
    background: var(--surface-alt);
    border: 1px solid var(--border-light);
    color: var(--text);
  }
  .intent-allow {
    background: var(--sunset, #e8603c);
    border: 1px solid var(--sunset, #e8603c);
    color: var(--bg-pure, #fff);
    font-weight: 600;
  }
</style>
