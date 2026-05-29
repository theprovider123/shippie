<!--
  P1A.5 (deep container split, A1.5) — extracted Home section from
  /container/+page.svelte.

  Owns the dashboard-style home view: insights strip, app grid,
  updates list, and the nearby (mesh) panel. Pure UI with everything
  wired in via props — the parent shell still owns the reactive
  state.

  Future: when the unification plan moves the dashboard to apex `/`,
  this component is what renders there. The /container route's
  remaining home block will simply re-use this component, so the
  collapse plan's "apex / becomes the container home" step lands
  with no new markup.
-->
<script lang="ts">
  import InsightStrip from '$lib/container/InsightStrip.svelte';
  import {
    ToolTile,
    containerAppToToolTile,
    type ToolRuntimeState,
  } from '$lib/components/tool-surface';
  import type { ContainerApp, UpdateCard } from '$lib/container/state';
  import type { Insight } from '@shippie/agent';
  import type { MeshStatus } from '$lib/container/mesh-status';

  interface Props {
    insights: readonly Insight[];
    apps: readonly ContainerApp[];
    openAppIds: readonly string[];
    updateCards: readonly UpdateCard[];
    meshStatus: MeshStatus;
    meshJoinCodeInput: string;
    meshError: string;
    onOpenInsight: (insight: Insight) => void;
    onDismissInsight: (insight: Insight) => void;
    onOpenApp: (appId: string) => void;
    onStayOnCurrent: (appId: string) => void;
    onAcceptUpdate: (appId: string) => void;
    onCreateMeshRoom: () => void;
    onJoinMeshRoom: () => void;
    onLeaveMeshRoom: () => void;
    onMeshJoinCodeChange: (value: string) => void;
  }

  let {
    insights,
    apps,
    openAppIds,
    updateCards,
    meshStatus,
    meshJoinCodeInput,
    meshError,
    onOpenInsight,
    onDismissInsight,
    onOpenApp,
    onStayOnCurrent,
    onAcceptUpdate,
    onCreateMeshRoom,
    onJoinMeshRoom,
    onLeaveMeshRoom,
    onMeshJoinCodeChange,
  }: Props = $props();
  let showMineOnly = $state(false);
  const visibleApps = $derived(showMineOnly ? apps.filter((app) => app.owned || app.visibility === 'local') : apps);

  function runtimeStateFor(app: ContainerApp): ToolRuntimeState {
    return openAppIds.includes(app.id) ? 'live' : 'idle';
  }
</script>

{#if insights.length > 0}
  <InsightStrip {insights} onOpen={onOpenInsight} onDismiss={onDismissInsight} />
{/if}
<div class="section-head">
  <div class="section-title-row">
    <h2>Tools</h2>
    <button
      class="mine-toggle"
      class:active={showMineOnly}
      type="button"
      aria-pressed={showMineOnly}
      onclick={() => (showMineOnly = !showMineOnly)}
    >
      My tools
    </button>
  </div>
  <p>Open tools stay warm. Switch away and come back without a reload.</p>
</div>
<div class="updates">
  <h3>Updates</h3>
  {#if updateCards.length > 0}
    {#each updateCards as card (card.app.id)}
      <article>
        <div>
          <strong>{card.app.name} v{card.app.version}</strong>
          <p>
            Installed v{card.receipt.version}.
            {card.packageHashChanged ? ' Package changed.' : ' Package hash unchanged.'}
            {card.kindChanged ? ' App kind changed.' : ' Data posture unchanged.'}
            {#if card.addedNetworkDomains.length > 0}
              New domains: {card.addedNetworkDomains.join(', ')}.
            {/if}
            {#if card.addedPermissions.length > 0}
              New capabilities: {card.addedPermissions.join(', ')}.
            {/if}
            {#if card.dataCompatibility.status !== 'same-schema'}
              Data: {card.dataCompatibility.summary}
            {/if}
            {#if card.latestSecurityScore !== null || card.latestPrivacyGrade}
              Trust now: {card.latestSecurityScore ?? 'unscored'} security · {card.latestPrivacyGrade ?? 'ungraded'} privacy.
            {/if}
          </p>
        </div>
        <div class="row-actions">
          <button onclick={() => onStayOnCurrent(card.app.id)}>Stay</button>
          <button onclick={() => onAcceptUpdate(card.app.id)}>Update</button>
        </div>
      </article>
    {/each}
  {:else}
    <p>All installed apps match their latest package receipt.</p>
  {/if}
</div>
<div class="app-grid">
  {#each visibleApps as app (app.id)}
    <ToolTile
      app={containerAppToToolTile(app)}
      density="card"
      runtimeState={runtimeStateFor(app)}
      onOpen={() => onOpenApp(app.id)}
    />
  {/each}
</div>
<div class="nearby-panel">
  <h3>Nearby</h3>
  {#if meshStatus.state === 'connected'}
    <p>
      In a local room. Join code <code>{meshStatus.joinCode}</code> · {meshStatus.peerCount} other device{meshStatus.peerCount === 1 ? '' : 's'} connected.
    </p>
    <button class="mesh-leave" onclick={onLeaveMeshRoom}>Leave room</button>
  {:else if meshStatus.state === 'connecting'}
    <p>Connecting locally…</p>
  {:else}
    <p>Connect with nearby people. App content stays peer-to-peer when possible, with encrypted relay fallback.</p>
    <div class="mesh-actions">
      <button class="mesh-create" onclick={onCreateMeshRoom}>Start a room</button>
      <span>or</span>
      <input
        class="mesh-code-input"
        id="mesh-join-code"
        name="mesh-join-code"
        placeholder="Paste join code"
        value={meshJoinCodeInput}
        oninput={(e) => onMeshJoinCodeChange((e.currentTarget as HTMLInputElement).value)}
        spellcheck="false"
        autocapitalize="characters"
        maxlength="32"
      />
      <button class="mesh-join" onclick={onJoinMeshRoom}>Join</button>
    </div>
    {#if meshError}
      <p class="error-text">{meshError}</p>
    {/if}
  {/if}
</div>

<style>
  /* Inherits container-shell variables (--space-md, --bg, --border, etc).
     The shell loads them at :root, so component-scoped CSS can use them. */
  .section-head {
    margin: var(--space-md) 0 var(--space-sm);
  }
  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .section-head h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
  }
  .section-head p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  .mine-toggle {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    cursor: pointer;
  }
  .mine-toggle.active,
  .mine-toggle:hover {
    color: var(--text);
    border-color: var(--sunset);
  }
  .updates {
    margin-bottom: var(--space-md);
  }
  .updates h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    margin: 0 0 0.5rem;
  }
  .updates article {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm);
    border: 1px solid var(--border-light);
    margin-bottom: 6px;
    background: var(--surface);
  }
  .row-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .app-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .nearby-panel {
    border: 1px solid var(--border-light);
    padding: var(--space-md);
    background: var(--surface);
  }
  .nearby-panel h3 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }
  .mesh-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .mesh-actions span {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  .mesh-code-input {
    flex: 1;
    min-width: 120px;
    padding: 6px 10px;
    border: 1px solid var(--border-light);
    background: var(--bg);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .mesh-create,
  .mesh-join,
  .mesh-leave {
    padding: 6px 12px;
    background: var(--sunset, #e8603c);
    color: var(--bg-pure, #fff);
    border: 1px solid var(--sunset, #e8603c);
    cursor: pointer;
  }
  .error-text {
    color: var(--danger, #b6472d);
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
  @media (max-width: 640px) {
    .section-head {
      margin: 0 0 var(--space-sm);
    }
    .section-title-row h2 {
      font-size: clamp(2rem, 10vw, 3rem);
      line-height: 0.96;
    }
    .section-head p {
      font-size: 1rem;
      line-height: 1.45;
    }
    .mine-toggle {
      min-height: var(--touch-min);
    }
    .updates {
      margin-bottom: var(--space-sm);
    }
    .updates h3 {
      font-size: 11px;
    }
    .updates article {
      align-items: stretch;
      flex-direction: column;
      padding: var(--space-md);
      background: var(--surface);
    }
    .row-actions {
      flex-direction: row;
    }
    .row-actions button {
      min-height: var(--touch-min);
      flex: 1;
    }
    .app-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .nearby-panel {
      padding: var(--space-md);
    }
    .mesh-actions {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
    }
    .mesh-actions span {
      display: none;
    }
    .mesh-code-input,
    .mesh-create,
    .mesh-join,
    .mesh-leave {
      min-height: var(--touch-min);
      font-size: var(--type-body-mobile);
    }
  }
</style>
