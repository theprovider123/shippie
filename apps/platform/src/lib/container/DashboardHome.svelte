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

  function tierLabel(app: ContainerApp): string {
    if (app.visibility === 'private') return 'Private';
    if (app.visibility === 'team') return 'Team';
    if (app.visibility === 'local') return 'On device';
    if (app.visibility === 'unlisted') return 'Unlisted';
    return '';
  }
</script>

<InsightStrip {insights} onOpen={onOpenInsight} onDismiss={onDismissInsight} />
<div class="section-head">
  <div class="section-title-row">
    <h2>Your Apps</h2>
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
  <p>Open apps stay warm in their sandbox. Switch away and return without a reload.</p>
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
    {@const installed = openAppIds.includes(app.id)}
    <button class="app-tile" class:installable={!installed} onclick={() => onOpenApp(app.id)}>
      <span class="app-icon" style={`--accent:${app.accent}`}>{app.icon}</span>
      {#if tierLabel(app)}
        <span class={`tier-badge tier-${app.visibility ?? 'public'}`}>{tierLabel(app)}</span>
      {/if}
      <strong>{app.name}</strong>
      <small>{installed ? app.labelKind : 'Install'}</small>
    </button>
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
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .app-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: var(--space-sm);
    border: 1px solid var(--border);
    background: var(--bg);
    cursor: pointer;
    text-align: left;
  }
  .app-tile.installable {
    border-style: dashed;
  }
  .app-tile strong {
    font-size: 0.95rem;
  }
  .app-tile small {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }
  .app-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent, var(--surface-alt));
    color: var(--bg-pure, #fff);
    font-weight: 600;
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
  .tier-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 3px 6px;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    line-height: 1;
    text-transform: uppercase;
  }
  .tier-private,
  .tier-local {
    color: var(--text);
    border-color: var(--border);
  }
  .tier-team {
    color: #355f49;
    border-color: rgba(53, 95, 73, 0.35);
    background: rgba(94, 167, 119, 0.08);
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
</style>
