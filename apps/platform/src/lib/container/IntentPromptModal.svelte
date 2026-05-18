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
  import Sheet from '$lib/components/ui/Sheet.svelte';

  export interface PendingIntentPrompt {
    consumerId: string;
    consumerName: string;
    intents: string[];
  }

  interface Props {
    prompt: PendingIntentPrompt | null;
    onApprove: () => void;
    onDeny: () => void;
  }

  let { prompt, onApprove, onDeny }: Props = $props();
</script>

<Sheet open={prompt !== null} onClose={onDeny} title="Cross-app permission">
  {#if prompt}
    <div class="intent-prompt">
      {#if prompt.intents.length === 1}
        <p>
          <strong>{prompt.consumerName}</strong> wants to receive
          <code>{prompt.intents[0]}</code> events from any installed app.
        </p>
      {:else}
        <p>
          <strong>{prompt.consumerName}</strong> wants to receive these events from installed apps.
        </p>
        <div class="intent-list" aria-label="Requested events">
          {#each prompt.intents as intent (intent)}
            <code>{intent}</code>
          {/each}
        </div>
      {/if}
      <p class="hint">
        Both apps stay sandboxed. Only the matching event rows are shared — never any other data.
        New apps that fire this event later won't ask again. You can revoke later in Your Data.
      </p>
      <div class="intent-prompt-actions">
        <button class="intent-deny" onclick={onDeny}>Deny</button>
        <button class="intent-allow" onclick={onApprove}>Allow</button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .intent-prompt {
    display: grid;
    gap: 0.75rem;
  }
  .intent-prompt p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .intent-prompt code {
    background: var(--surface-alt);
    padding: 0.1rem 0.3rem;
    border-radius: 0;
    font-size: 0.85rem;
  }
  .intent-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .intent-prompt .hint {
    color: var(--text-light);
    font-size: 0.85rem;
  }
  .intent-prompt-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }
  .intent-prompt-actions button {
    min-height: var(--touch-min);
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
