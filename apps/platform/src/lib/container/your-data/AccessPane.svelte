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
  const grantCount = $derived(flows.reduce((sum, flow) => sum + flow.consumers.length, 0));
</script>

<div class="section-head">
  <p class="eyebrow">Access</p>
  <h2>Access</h2>
  <p>Local signals tools can share with each other. Nothing subscribes until you allow it.</p>
</div>

<section class="access-summary" aria-label="Access summary">
  <div>
    <span>Signals</span>
    <strong>{flows.length}</strong>
  </div>
  <div>
    <span>Grants</span>
    <strong>{grantCount}</strong>
  </div>
</section>

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
  .eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: clamp(2rem, 8vw, 3.25rem);
    line-height: 0.96;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .muted {
    color: var(--text-secondary);
  }
  .access-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    margin-bottom: var(--space-md);
    border: 1px solid var(--border-light);
    background: var(--border-light);
  }
  .access-summary div {
    min-height: 88px;
    padding: 12px;
    display: grid;
    align-content: space-between;
    background: var(--surface);
  }
  .access-summary span {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }
  .access-summary strong {
    font-family: var(--font-heading);
    font-size: clamp(1.8rem, 6vw, 2.7rem);
    line-height: 0.95;
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
  @media (max-width: 640px) {
    .section-head p:not(.eyebrow) {
      font-size: 1rem;
    }
    .access-summary div {
      min-height: 76px;
    }
    .flow-consumers li {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
