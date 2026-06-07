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
    ToolRow,
    toolState,
    type ToolDisplay,
  } from '$lib/components/tool-surface';
  import type { UpdateCard } from '$lib/container/state';
  import type { RailGroups, RailTool } from '$lib/container/rail-groups';
  import {
    updateBadgeLabel,
    updateChips,
    updateCounts,
    updateReviewNote,
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
    onAcceptAllUpdates: (appIds: readonly string[]) => void;
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
    onAcceptAllUpdates,
  }: Props = $props();

  let updateSheetOpen = $state(false);
  const counts = $derived(updateCounts(updateCards));
  const updateSubtitle = $derived(updateCards.length === 1 ? '1 tool' : `${updateCards.length} tools`);
  const updateCountSummary = $derived.by(() => {
    const parts: string[] = [];
    if (counts.attention > 0) parts.push(counts.attention === 1 ? '1 needs review' : `${counts.attention} need review`);
    if (counts.review > 0) parts.push(counts.review === 1 ? '1 ready' : `${counts.review} ready`);
    if (counts.quiet > 0) parts.push(counts.quiet === 1 ? '1 quiet' : `${counts.quiet} quiet`);
    return parts.join(' · ');
  });
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

  function installAllUpdates() {
    onAcceptAllUpdates(updateCards.map((card) => card.app.id));
    closeUpdates();
  }

  function keepCurrent(card: UpdateCard) {
    onStayOnCurrent(card.app.id);
    if (updateCards.length <= 1) closeUpdates();
  }

  function updateCardForTool(tool: RailTool): UpdateCard | null {
    return updateCards.find((card) => card.app.slug === tool.slug) ?? null;
  }

  function railToolToTile(tool: RailTool): ToolDisplay {
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

  const EMPTY_SLUGS: ReadonlySet<string> = new Set();
  // Per-section dynamic state for the dock rows. The section is known, so
  // membership is trivial: a Running row is running, a Saved row is saved.
  // The selector then yields the right actions (close / remove / review).
  function stateForTool(tool: RailTool, sectionId: 'open' | 'recent' | 'saved') {
    const card = updateCardForTool(tool);
    return toolState({
      slug: tool.slug,
      isRunning: sectionId === 'open',
      savedSlugs: sectionId === 'saved' ? new Set([tool.slug]) : EMPTY_SLUGS,
      recentSlugs: sectionId === 'recent' ? new Set([tool.slug]) : EMPTY_SLUGS,
      download: undefined,
      updateSeverity: card ? updateSeverity(card) : null,
      surface: 'dock',
    });
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
      <div class="updates-toolbar">
        <div>
          <strong>{counts.total} {counts.total === 1 ? 'tool' : 'tools'} pending</strong>
          {#if updateCountSummary}
            <span>{updateCountSummary}</span>
          {/if}
        </div>
        <button type="button" class="update-all" onclick={installAllUpdates}>Update all</button>
      </div>
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
    {@render DockSection({ label: 'Running', sectionId: 'open', tools: dockGroups.open })}
  {/if}
  {#if dockGroups.recent.length > 0}
    {@render DockSection({ label: 'Recent', sectionId: 'recent', tools: dockGroups.recent })}
  {/if}
  {#if dockGroups.saved.length > 0}
    {@render DockSection({ label: 'Saved', sectionId: 'saved', tools: dockGroups.saved })}
  {/if}
</div>
{#snippet DockSection({
  label,
  sectionId,
  tools,
}: {
  label: string;
  sectionId: 'open' | 'recent' | 'saved';
  tools: readonly RailTool[];
})}
  <section class="dock-section">
    <div class="dock-section-head">
      <div>
        <h3>{label}</h3>
        <p>
          {#if sectionId === 'open'}
            Still open in the background.
          {:else if sectionId === 'saved'}
            Ready here and offline.
          {:else}
            Opened on this device.
          {/if}
        </p>
      </div>
    </div>
    <div class="dock-tile-grid">
      {#each tools as tool (tool.slug)}
        <ToolRow
          app={railToolToTile(tool)}
          state={stateForTool(tool, sectionId)}
          variant="tile"
          hideRelationship
          onOpen={() => onOpenTool(tool.slug)}
          onReview={() => openUpdates()}
          onClose={sectionId === 'open' && onCloseTool ? () => onCloseTool(tool.slug) : undefined}
          onRemove={sectionId === 'saved' && onRemoveSavedTool ? () => onRemoveSavedTool(tool.slug) : undefined}
        />
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
        {@const reviewNote = updateReviewNote(card)}
        {@const flaggedChips = updateChips(card).filter((chip) => chip.tone === 'attention')}
        <article class="update-row" class:attention={updateSeverity(card) === 'attention'}>
          <div class="update-copy">
            <div class="update-row-title">
              <strong>{card.app.name}</strong>
              <small>{updateSummary(card)}</small>
            </div>
            {#if flaggedChips.length > 0}
              <div class="update-chips" aria-label={`Changes that need review for ${card.app.name}`}>
                {#each flaggedChips as chip (chip.label)}
                  <span class="attention">{chip.label}</span>
                {/each}
              </div>
            {/if}
            {#if reviewNote}
              <p class="update-note">{reviewNote}</p>
            {/if}
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
    font-family: var(--font-heading);
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
  .dock-tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: clamp(0.75rem, 1.4vw, 1.1rem) 0.75rem;
  }
  .updates-sheet {
    display: grid;
    gap: 0.9rem;
  }
  .updates-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: 0 0 0.8rem;
    border-bottom: 1px solid var(--border-light);
  }
  .updates-toolbar div {
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }
  .updates-toolbar strong {
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 0.98rem;
  }
  .updates-toolbar span {
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.35;
  }
  .update-all {
    flex: none;
    min-height: 38px;
    padding: 0 0.9rem;
    border: 1px solid var(--sunset);
    background: var(--sunset);
    color: var(--bg);
    font: inherit;
    cursor: pointer;
  }
  .update-all:hover,
  .update-all:focus-visible {
    filter: brightness(1.06);
    outline: none;
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
    gap: 0.85rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: 0.75rem 0.8rem;
  }
  .update-row.attention {
    border-color: color-mix(in srgb, var(--sunset) 20%, var(--border-light));
    box-shadow: inset 2px 0 0 color-mix(in srgb, var(--sunset) 78%, var(--border-light));
  }
  .update-copy,
  .update-row-title {
    min-width: 0;
    display: grid;
    gap: 0.3rem;
  }
  .update-row-title strong {
    color: var(--text);
    font-family: var(--font-heading);
    font-size: 0.98rem;
  }
  .update-row-title small {
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.35;
  }
  .update-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .update-chips span {
    min-height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 0.42rem;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
  }
  .update-chips span.attention {
    color: var(--sunset);
    border-color: color-mix(in srgb, var(--sunset) 34%, var(--border-light));
    background: color-mix(in srgb, var(--sunset) 6%, transparent);
  }
  .update-note {
    margin: 0.05rem 0 0;
    color: color-mix(in srgb, var(--sunset) 82%, var(--text-secondary));
    font-size: 0.76rem;
    line-height: 1.4;
  }
  .update-row-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .update-row-actions button {
    min-height: 44px;
    padding: 0 0.72rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .update-row-actions button.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: var(--bg);
  }
  .update-row-actions button:hover,
  .update-row-actions button:focus-visible {
    background: var(--surface-alt);
    border-color: var(--sunset);
    outline: none;
  }
  .update-row-actions button.primary:hover,
  .update-row-actions button.primary:focus-visible {
    background: var(--sunset);
    filter: brightness(1.06);
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
    .updates-toolbar {
      align-items: stretch;
      display: grid;
    }
    .update-all {
      width: 100%;
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
      padding: 0.85rem;
    }
    .update-row-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .update-row-actions button {
      width: 100%;
    }
    .dock-section-head {
      align-items: flex-start;
    }
  }
</style>
