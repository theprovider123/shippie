<script lang="ts">
  import type { ContainerApp } from '$lib/container/state';
  import type { MeshStatus } from '$lib/container/mesh-status';

  type Flow = {
    provider: ContainerApp;
    intent: string;
    consumers: ContainerApp[];
  };

  interface Props {
    flows: Flow[];
    nearbyStatus: MeshStatus;
    nearbyJoinCodeInput: string;
    nearbyError: string;
    onRevoke: (consumerId: string, intent: string) => void;
    onCreateNearby: () => void;
    onJoinNearby: () => void;
    onLeaveNearby: () => void;
    onNearbyJoinCodeChange: (value: string) => void;
  }

  const {
    flows,
    nearbyStatus,
    nearbyJoinCodeInput,
    nearbyError,
    onRevoke,
    onCreateNearby,
    onJoinNearby,
    onLeaveNearby,
    onNearbyJoinCodeChange,
  }: Props = $props();
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

<section class="nearby-card" aria-labelledby="nearby-title">
  <div class="nearby-copy">
    <p class="eyebrow">Nearby</p>
    <h3 id="nearby-title">Nearby devices</h3>
    {#if nearbyStatus.state === 'connected'}
      <p>
        Session active. Join code <code>{nearbyStatus.joinCode}</code> · {nearbyStatus.peerCount} device{nearbyStatus.peerCount === 1 ? '' : 's'} connected.
      </p>
    {:else if nearbyStatus.state === 'connecting'}
      <p>Connecting to nearby devices...</p>
    {:else}
      <p>Occasionally share with another device or someone on the same network. Dock stays focused on launching.</p>
    {/if}
  </div>
  {#if nearbyStatus.state === 'connected'}
    <button type="button" class="nearby-button" onclick={onLeaveNearby}>Leave</button>
  {:else}
    <div class="nearby-actions">
      <button type="button" class="nearby-button primary" onclick={onCreateNearby}>Start</button>
      <input
        id="nearby-join-code"
        name="nearby-join-code"
        placeholder="Join code"
        value={nearbyJoinCodeInput}
        oninput={(event) => onNearbyJoinCodeChange((event.currentTarget as HTMLInputElement).value)}
        spellcheck="false"
        autocapitalize="characters"
        maxlength="32"
      />
      <button type="button" class="nearby-button" onclick={onJoinNearby}>Join</button>
    </div>
  {/if}
  {#if nearbyError}
    <p class="nearby-error">{nearbyError}</p>
  {/if}
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
  .nearby-card {
    margin-bottom: var(--space-md);
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    background: var(--surface);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-md);
    align-items: center;
  }
  .nearby-copy {
    display: grid;
    gap: 0.35rem;
  }
  .nearby-copy h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: clamp(1.25rem, 4vw, 1.65rem);
    line-height: 1;
  }
  .nearby-copy code {
    font-family: var(--font-mono);
    color: var(--text);
  }
  .nearby-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nearby-actions input {
    width: 128px;
    min-height: var(--touch-min);
    padding: 0 10px;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    font-family: var(--font-mono);
    text-transform: uppercase;
  }
  .nearby-button {
    min-height: var(--touch-min);
    padding: 0 0.85rem;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .nearby-button.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: var(--bg);
  }
  .nearby-error {
    grid-column: 1 / -1;
    color: var(--danger, #b6472d);
    font-size: var(--small-size);
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
    .nearby-card,
    .nearby-actions {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
    .nearby-actions {
      display: grid;
    }
    .nearby-actions input {
      width: auto;
    }
    .flow-consumers li {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
