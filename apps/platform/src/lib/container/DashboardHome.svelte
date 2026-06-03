<!--
  P1A.5 (deep container split, A1.5) — extracted Home section from
  /container/+page.svelte.

  Owns the Dock home view: insights strip, app grid, and updates list.
  Pure UI with everything wired in via props — the parent shell still
  owns the reactive state.

  Future: when the unification plan moves the dashboard to apex `/`,
  this component is what renders there. The /container route's
  remaining home block will simply re-use this component, so the
  collapse plan's "apex / becomes the container home" step lands
  with no new markup.
-->
<script lang="ts">
  import InsightStrip from '$lib/container/InsightStrip.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import {
    ToolTile,
    type ToolTileApp,
    type ToolRuntimeState,
  } from '$lib/components/tool-surface';
  import type { UpdateCard } from '$lib/container/state';
  import type { RailGroups, RailTool } from '$lib/container/rail-groups';
  import {
    updateBadgeLabel,
    updateChips,
    updateSeverity,
    updateSummary,
  } from '$lib/container/update-status';
  import type { Insight } from '@shippie/agent';

  interface Props {
    insights: readonly Insight[];
    dockGroups: RailGroups;
    updateCards: readonly UpdateCard[];
    onOpenInsight: (insight: Insight) => void;
    onDismissInsight: (insight: Insight) => void;
    onOpenTool: (slug: string) => void;
    onCloseTool?: (slug: string) => void;
    onRemoveSavedTool?: (slug: string) => void;
    onStayOnCurrent: (appId: string) => void;
    onAcceptUpdate: (appId: string) => void;
  }

  let {
    insights,
    dockGroups,
    updateCards,
    onOpenInsight,
    onDismissInsight,
    onOpenTool,
    onCloseTool,
    onRemoveSavedTool,
    onStayOnCurrent,
    onAcceptUpdate,
  }: Props = $props();
  function sectionRuntimeState(_section: 'open' | 'saved' | 'recent'): ToolRuntimeState {
    return 'idle';
  }

  let updateSheetOpen = $state(false);
  const updateSubtitle = $derived(updateCards.length === 1 ? '1 tool' : `${updateCards.length} tools`);
  const attentionUpdates = $derived(updateCards.filter((card) => updateSeverity(card) === 'attention'));
  const reviewUpdates = $derived(updateCards.filter((card) => updateSeverity(card) === 'review'));
  const quietUpdates = $derived(updateCards.filter((card) => updateSeverity(card) === 'quiet'));

  function openUpdates() {
    updateSheetOpen = true;
  }

  function closeUpdates() {
    updateSheetOpen = false;
  }

  function installUpdate(card: UpdateCard) {
    onAcceptUpdate(card.app.id);
    if (updateCards.length <= 1) closeUpdates();
  }

  function keepCurrent(card: UpdateCard) {
    onStayOnCurrent(card.app.id);
    if (updateCards.length <= 1) closeUpdates();
  }

  function updateCardForTool(tool: RailTool): UpdateCard | null {
    return updateCards.find((card) => card.app.slug === tool.slug) ?? null;
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
    {#if updateCards.length > 0}
      <button
        type="button"
        class="update-trigger"
        class:attention={attentionUpdates.length > 0}
        onclick={openUpdates}
      >
        <span>{updateBadgeLabel(updateCards)}</span>
      </button>
    {/if}
  </div>
  <p>Running, recent, and saved tools stay close. Use Tools when you want to find something new.</p>
</div>
{#if updateCards.length > 0}
  <Sheet
    open={updateSheetOpen}
    onClose={closeUpdates}
    title="Updates"
    subtitle={updateSubtitle}
    dismissOnBack={false}
  >
    <div class="updates-sheet">
      {#if attentionUpdates.length > 0}
        {@render UpdateGroup('Needs review', attentionUpdates)}
      {/if}
      {#if reviewUpdates.length > 0}
        {@render UpdateGroup('Ready', reviewUpdates)}
      {/if}
      {#if quietUpdates.length > 0}
        {@render UpdateGroup('Quiet', quietUpdates)}
      {/if}
    </div>
  </Sheet>
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
        {@const updateCard = updateCardForTool(tool)}
        <div class="dock-tool-row" class:with-close={action}>
          <ToolTile
            app={railToolToTile(tool)}
            density="drawer"
            runtimeState={state}
            captionLabel={captionFor(label, tool.category)}
            noActions
            onOpen={() => onOpenTool(tool.slug)}
          />
          {#if updateCard}
            <button
              type="button"
              class="dock-row-update-chip"
              class:attention={updateSeverity(updateCard) === 'attention'}
              onclick={openUpdates}
              aria-label={`Review update for ${tool.name}`}
            >
              {updateSeverity(updateCard) === 'attention' ? 'Review' : 'Update'}
            </button>
          {/if}
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

{#snippet UpdateGroup(label: string, cards: readonly UpdateCard[])}
  <section class="update-group" aria-label={label}>
    <div class="update-group-head">
      <h3>{label}</h3>
      <span>{cards.length}</span>
    </div>
    <div class="update-list">
      {#each cards as card (card.app.id)}
        <article class="update-row" class:attention={updateSeverity(card) === 'attention'}>
          <div class="update-copy">
            <div class="update-row-title">
              <strong>{card.app.name}</strong>
              <small>{updateSummary(card)}</small>
            </div>
            <div class="update-chips" aria-label={`Changes for ${card.app.name}`}>
              {#each updateChips(card) as chip (chip.label)}
                <span class:attention={chip.tone === 'attention'} class:safe={chip.tone === 'safe'}>{chip.label}</span>
              {/each}
            </div>
          </div>
          <div class="update-row-actions">
            <button type="button" onclick={() => keepCurrent(card)}>Later</button>
            <button type="button" class="primary" onclick={() => installUpdate(card)}>Update</button>
          </div>
        </article>
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
    align-items: center;
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
  .update-trigger {
    flex: none;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .update-trigger:hover,
  .update-trigger:focus-visible {
    color: var(--sunset);
    border-color: var(--sunset);
    outline: none;
  }
  .update-trigger.attention {
    color: var(--sunset);
    border-color: color-mix(in srgb, var(--sunset) 55%, var(--border-light));
    background: color-mix(in srgb, var(--sunset) 8%, var(--surface));
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
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: stretch;
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
  .dock-row-update-chip {
    align-self: center;
    min-height: 32px;
    margin-right: 8px;
    padding: 0 0.65rem;
    border: 1px solid color-mix(in srgb, var(--sage-leaf) 45%, var(--border-light));
    background: color-mix(in srgb, var(--sage-leaf) 9%, transparent);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .dock-row-update-chip:hover,
  .dock-row-update-chip:focus-visible {
    color: var(--text);
    border-color: var(--sage-leaf);
    outline: none;
  }
  .dock-row-update-chip.attention {
    color: var(--sunset);
    border-color: color-mix(in srgb, var(--sunset) 60%, var(--border-light));
    background: color-mix(in srgb, var(--sunset) 8%, transparent);
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
  .updates-sheet {
    display: grid;
    gap: 1rem;
  }
  .update-group {
    display: grid;
    gap: 0.55rem;
  }
  .update-group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .update-group-head h3 {
    margin: 0;
    font-size: 0.78rem;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .update-group-head span {
    display: grid;
    place-items: center;
    min-width: 1.5rem;
    min-height: 1.5rem;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .update-list {
    display: grid;
    gap: 6px;
  }
  .update-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-md);
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: var(--space-sm);
  }
  .update-row.attention {
    border-color: color-mix(in srgb, var(--sunset) 42%, var(--border-light));
    box-shadow: inset 3px 0 0 var(--sunset);
  }
  .update-copy,
  .update-row-title {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }
  .update-row-title strong {
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 1rem;
  }
  .update-row-title small {
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .update-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .update-chips span {
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    padding: 0 0.45rem;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.04em;
  }
  .update-chips span.safe {
    color: var(--sage-leaf);
    border-color: color-mix(in srgb, var(--sage-leaf) 42%, var(--border-light));
  }
  .update-chips span.attention {
    color: var(--sunset);
    border-color: color-mix(in srgb, var(--sunset) 48%, var(--border-light));
  }
  .update-row-actions {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .update-row-actions button {
    min-height: var(--touch-min);
    padding: 0 0.85rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .update-row-actions button.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: var(--bg);
  }
  .update-row-actions button:hover,
  .update-row-actions button:focus-visible {
    border-color: var(--sunset);
    outline: none;
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
    .update-trigger {
      min-height: 36px;
      padding: 0 0.6rem;
    }
    .section-title-row h1 {
      font-size: clamp(2.05rem, 10vw, 3rem);
      line-height: 0.96;
    }
    .section-head p {
      font-size: 1rem;
      line-height: 1.45;
    }
    .update-row {
      grid-template-columns: 1fr;
      padding: var(--space-md);
    }
    .update-row-actions button {
      flex: 1;
    }
    .dock-section-head {
      align-items: flex-start;
    }
    .dock-tool-row :global(.tile-drawer) {
      padding: 10px 12px;
    }
  }
</style>
