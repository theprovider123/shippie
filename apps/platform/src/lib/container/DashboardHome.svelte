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
    type ToolTileApp,
    type ToolRuntimeState,
  } from '$lib/components/tool-surface';
  import type { UpdateCard } from '$lib/container/state';
  import type { RailGroups, RailTool } from '$lib/container/rail-groups';
  import type { Insight } from '@shippie/agent';
  import type { MeshStatus } from '$lib/container/mesh-status';

  interface Props {
    insights: readonly Insight[];
    dockGroups: RailGroups;
    updateCards: readonly UpdateCard[];
    meshStatus: MeshStatus;
    meshJoinCodeInput: string;
    meshError: string;
    onOpenInsight: (insight: Insight) => void;
    onDismissInsight: (insight: Insight) => void;
    onOpenTool: (slug: string) => void;
    onCloseTool?: (slug: string) => void;
    onRemoveSavedTool?: (slug: string) => void;
    onStayOnCurrent: (appId: string) => void;
    onAcceptUpdate: (appId: string) => void;
    onCreateMeshRoom: () => void;
    onJoinMeshRoom: () => void;
    onLeaveMeshRoom: () => void;
    onMeshJoinCodeChange: (value: string) => void;
  }

  let {
    insights,
    dockGroups,
    updateCards,
    meshStatus,
    meshJoinCodeInput,
    meshError,
    onOpenInsight,
    onDismissInsight,
    onOpenTool,
    onCloseTool,
    onRemoveSavedTool,
    onStayOnCurrent,
    onAcceptUpdate,
    onCreateMeshRoom,
    onJoinMeshRoom,
    onLeaveMeshRoom,
    onMeshJoinCodeChange,
  }: Props = $props();
  function sectionRuntimeState(_section: 'open' | 'saved' | 'recent'): ToolRuntimeState {
    return 'idle';
  }

  function railToolToTile(tool: RailTool): ToolTileApp {
    return {
      slug: tool.slug,
      name: tool.name,
      category: tool.category ?? null,
      iconUrl: null,
      themeColor: tool.accent,
      glyph: tool.icon,
      firstPartySigned: false,
      badges: [],
    };
  }

  function captionFor(label: string, category: string | undefined): string {
    if (label === 'Running') return 'Open now';
    if (label === 'Saved') return 'Saved';
    if (label === 'Recent') return 'Recent';
    return category ?? 'Tool';
  }
</script>

{#if insights.length > 0}
  <InsightStrip {insights} onOpen={onOpenInsight} onDismiss={onDismissInsight} />
{/if}
<div class="section-head">
  <div class="section-title-row">
    <h1>Dock</h1>
  </div>
  <p>Running, recent, and saved tools stay close. Use Tools when you want to find something new.</p>
</div>
{#if updateCards.length > 0}
  <details class="updates" open>
    <summary>
      <span class="updates-summary-copy">
        <strong>Updates available</strong>
        <small>Review package changes before installing.</small>
      </span>
      <span class="updates-count">{updateCards.length}</span>
    </summary>
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
          <button onclick={() => onStayOnCurrent(card.app.id)}>Keep current</button>
          <button onclick={() => onAcceptUpdate(card.app.id)}>Install update</button>
        </div>
      </article>
    {/each}
  </details>
{/if}
<div class="dock-sections">
  {#if dockGroups.open.length > 0}
    {@render DockSection({
      label: 'Running',
      tools: dockGroups.open,
      state: sectionRuntimeState('open'),
      action: onCloseTool,
      actionLabel: (tool) => `Close ${tool.name}`,
      actionTitle: 'Close running tool',
    })}
  {/if}
  {#if dockGroups.recent.length > 0}
    {@render DockSection({
      label: 'Recent',
      tools: dockGroups.recent,
      state: sectionRuntimeState('recent'),
    })}
  {/if}
  {#if dockGroups.saved.length > 0}
    {@render DockSection({
      label: 'Saved',
      tools: dockGroups.saved,
      state: sectionRuntimeState('saved'),
      action: onRemoveSavedTool,
      actionLabel: (tool) => `Remove ${tool.name} from Dock`,
      actionTitle: 'Remove from Dock',
    })}
  {/if}
</div>
<div class="nearby-panel">
  <h3>Share nearby</h3>
  {#if meshStatus.state === 'connected'}
    <p>
      Sharing with nearby devices. Join code <code>{meshStatus.joinCode}</code> · {meshStatus.peerCount} other device{meshStatus.peerCount === 1 ? '' : 's'} connected.
    </p>
    <button class="mesh-leave" onclick={onLeaveMeshRoom}>Leave session</button>
  {:else if meshStatus.state === 'connecting'}
    <p>Connecting locally…</p>
  {:else}
    <p>Share a tool with people on the same Wi-Fi, or connect another of your own devices. Stays peer-to-peer when possible, with encrypted relay fallback.</p>
    <div class="mesh-actions">
      <button class="mesh-create" onclick={onCreateMeshRoom}>Create a nearby session</button>
      <span>or join with a code</span>
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

{#snippet DockSection({
  label,
  tools,
  state,
  action,
  actionLabel,
  actionTitle,
}: {
  label: string;
  tools: readonly RailTool[];
  state: ToolRuntimeState;
  action?: (slug: string) => void;
  actionLabel?: (tool: RailTool) => string;
  actionTitle?: string;
})}
  <section class="dock-section">
    <div class="dock-section-head">
      <div>
        <h3>{label}</h3>
        <p>
          {#if label === 'Running'}
            Still open in the background.
          {:else if label === 'Saved'}
            Ready here and offline.
          {:else}
            Opened on this device.
          {/if}
        </p>
      </div>
    </div>
    <div class="dock-row-list">
      {#each tools as tool (tool.slug)}
        <div class="dock-tool-row" class:with-close={action}>
          <ToolTile
            app={railToolToTile(tool)}
            density="drawer"
            runtimeState={state}
            captionLabel={captionFor(label, tool.category)}
            noActions
            onOpen={() => onOpenTool(tool.slug)}
          />
          {#if action}
            <button
              class="dock-row-close"
              type="button"
              aria-label={actionLabel?.(tool) ?? `Remove ${tool.name}`}
              title={actionTitle}
              onclick={() => action(tool.slug)}
            >
              ×
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/snippet}

<style>
  /* Inherits container-shell variables (--space-md, --bg, --border, etc).
     The shell loads them at :root, so component-scoped CSS can use them. */
  .section-head {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 clamp(1rem, 2vw, 1.5rem);
  }
  .section-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .section-head h1 {
    min-width: 0;
    margin: 0;
    font-size: 1.08rem;
  }
  .section-head p {
    max-width: 44rem;
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .dock-sections {
    display: grid;
    gap: clamp(1rem, 1.8vw, 1.35rem);
    margin-bottom: var(--space-md);
  }
  .dock-section {
    display: grid;
    gap: var(--space-sm);
  }
  .dock-section-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-md);
  }
  .dock-section-head h3 {
    margin: 0;
    font-size: 0.9rem;
    letter-spacing: 0;
  }
  .dock-section-head p {
    margin: 3px 0 0;
    color: var(--text-secondary);
    font-size: 0.86rem;
  }
  .dock-row-list {
    --dock-tool-row-height: 64px;
    display: grid;
    gap: 6px;
  }
  .dock-tool-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: var(--dock-tool-row-height);
    background: var(--surface);
    border: 1px solid var(--border-light);
  }
  .dock-tool-row :global(.tile-drawer) {
    min-height: var(--dock-tool-row-height);
    border: 0;
    background: transparent;
  }
  .dock-tool-row :global(.chip) {
    display: none;
  }
  .dock-row-close {
    display: grid;
    place-items: center;
    width: 52px;
    min-height: 100%;
    border: 0;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.2rem;
    text-decoration: none;
    cursor: pointer;
  }
  .dock-row-close:hover,
  .dock-row-close:focus-visible {
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  .updates {
    border: 1px solid color-mix(in srgb, var(--sunset) 38%, var(--border-light));
    background: color-mix(in srgb, var(--sunset) 9%, var(--surface));
    box-shadow: inset 3px 0 0 var(--sunset);
    margin-bottom: var(--space-md);
  }
  .updates > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    min-height: 48px;
    font-family: var(--font-mono);
    color: var(--text);
    cursor: pointer;
    padding: 0.75rem var(--space-sm);
    list-style: none;
  }
  .updates > summary::-webkit-details-marker { display: none; }
  .updates > summary::after {
    content: 'Hide';
    flex: none;
    color: var(--text-secondary);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .updates:not([open]) > summary::after { content: 'Review'; color: var(--sunset); }
  .updates-summary-copy {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
  }
  .updates-summary-copy strong {
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 0.98rem;
    letter-spacing: 0;
  }
  .updates-summary-copy small {
    color: var(--text-secondary);
    font-size: 0.78rem;
    letter-spacing: 0;
  }
  .updates-count {
    flex: none;
    display: grid;
    place-items: center;
    min-width: 1.75rem;
    min-height: 1.75rem;
    border: 1px solid color-mix(in srgb, var(--sunset) 60%, transparent);
    background: color-mix(in srgb, var(--sunset) 18%, transparent);
    color: var(--sunset);
    font-size: 0.8rem;
  }
  .updates article {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-sm);
    border: 1px solid var(--border-light);
    margin: 0 var(--space-sm) var(--space-sm);
    background: var(--surface);
  }
  .row-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    min-height: var(--touch-min);
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
    min-height: var(--touch-min);
    padding: 6px 12px;
    background: var(--sunset, #e8603c);
    color: var(--bg-pure, #fff);
    border: 1px solid var(--sunset, var(--sunset));
    cursor: pointer;
  }
  .error-text {
    color: var(--danger, #b6472d);
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
  @media (min-width: 641px) {
    .section-head h1 {
      position: fixed;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .section-title-row {
      justify-content: flex-end;
    }
    .section-head p {
      max-width: min(54rem, calc(100vw - 360px));
    }
  }
  @media (max-width: 640px) {
    .section-head {
      gap: 0.65rem;
      margin: 0 0 var(--space-md);
    }
    .section-title-row {
      gap: var(--space-sm);
    }
    .section-title-row h1 {
      font-size: clamp(2.05rem, 10vw, 3rem);
      line-height: 0.96;
    }
    .section-head p {
      font-size: 1rem;
      line-height: 1.45;
    }
    .updates {
      margin-bottom: var(--space-sm);
    }
    .updates > summary {
      align-items: flex-start;
      padding: var(--space-sm);
    }
    .updates > summary::after {
      padding-top: 0.12rem;
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
    .dock-section-head {
      align-items: flex-start;
    }
    .dock-tool-row :global(.tile-drawer) {
      padding: 10px 12px;
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
