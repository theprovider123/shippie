<!--
  P1A.5 (deep container split, A1.5) — extracted intent-grant prompt
  modal. Renders only when `prompt` is non-null. The container's
  orchestrator queues PendingPrompt entries; this component reads the
  head of the queue and renders the consent dialog around it.

  Same markup and CSS as the inline version that used to live in
  /container/+page.svelte. Pulled out so the parent can shed
  orchestration weight without changing the user-visible UI.
-->
<script lang="ts">
  export interface PendingIntentPrompt {
    consumerId: string;
    consumerName: string;
    intent: string;
  }

  interface Props {
    prompt: PendingIntentPrompt | null;
    onApprove: () => void;
    onDeny: () => void;
  }

  let { prompt, onApprove, onDeny }: Props = $props();
</script>

{#if prompt}
  <div class="intent-prompt-backdrop" role="presentation">
    <div class="intent-prompt" role="dialog" aria-labelledby="intent-prompt-title">
      <h3 id="intent-prompt-title">Cross-app permission</h3>
      <p>
        <strong>{prompt.consumerName}</strong> wants to receive
        <code>{prompt.intent}</code> events from any installed app.
      </p>
      <p class="hint">
        Both apps stay sandboxed. Only the matching event rows are shared — never any other data.
        New apps that fire this event later won't ask again. You can revoke later in Your Data.
      </p>
      <div class="intent-prompt-actions">
        <button class="intent-deny" onclick={onDeny}>Deny</button>
        <button class="intent-allow" onclick={onApprove}>Allow</button>
      </div>
    </div>
  </div>
{/if}

<style>
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
