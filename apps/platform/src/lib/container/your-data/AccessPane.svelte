<script lang="ts">
  import type { ContainerApp } from '$lib/container/state';

  type Flow = {
    provider: ContainerApp;
    intent: string;
    consumers: ContainerApp[];
  };

  interface Props {
    flows: Flow[];
    onRevoke: (consumerId: string, intent: string) => void;
  }

  const { flows, onRevoke }: Props = $props();
</script>

<div class="section-head">
  <h2>Access</h2>
  <p>What each tool can broadcast, and which other tools have access. Revoke a grant to stop a consumer subscribing on the next cross-app prompt.</p>
</div>

{#if flows.length === 0}
  <p class="muted">No cross-tool intents declared by installed apps yet.</p>
{:else}
  <ul class="flow-list">
    {#each flows as flow (flow.provider.id + ':' + flow.intent)}
      <li class="flow-row">
        <div class="flow-meta">
          <strong>{flow.provider.name}</strong>
          <code class="flow-intent">{flow.intent}</code>
        </div>
        {#if flow.consumers.length === 0}
          <p class="muted small">No subscribers yet.</p>
        {:else}
          <ul class="flow-consumers">
            {#each flow.consumers as consumer (consumer.id)}
              <li>
                <span>{consumer.name}</span>
                <button
                  class="revoke-button"
                  onclick={() => onRevoke(consumer.id, flow.intent)}
                  aria-label={`Revoke ${consumer.name}'s access to ${flow.intent}`}
                >Revoke</button>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .section-head {
    display: grid;
    gap: 0.35rem;
    margin-bottom: var(--space-md);
  }
  h2 {
    margin: 0;
    font-family: var(--font-heading);
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .muted {
    color: var(--text-secondary);
  }
  .muted.small {
    font-size: var(--small-size);
  }
  .flow-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-md);
  }
  .flow-row {
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: var(--space-md);
    display: grid;
    gap: 0.6rem;
  }
  .flow-meta {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .flow-intent {
    font-family: var(--font-mono);
    font-size: var(--small-size);
    color: var(--text-secondary);
  }
  .flow-consumers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .flow-consumers li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
  }
  .revoke-button {
    min-height: var(--touch-min);
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
</style>
