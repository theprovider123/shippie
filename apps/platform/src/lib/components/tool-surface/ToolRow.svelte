<script lang="ts">
  /**
   * ToolRow — one of the two harmonization primitives (spec §4.1). The
   * row shape used by the Dock sections, the drawer, mobile Tools, and
   * maker lists. Presentational: the parent computes `state` via the
   * `toolState` selector and passes the handlers it wants. A rail button
   * renders only when the action is BOTH applicable (state.actions) AND
   * the surface provided its handler — so surface policy stays in the
   * parent, not the primitive.
   *
   * Height is owned here (64px mobile / 68px desktop) so no parent can
   * drift it via an external --row-height override. Labels come only
   * from ./labels (enforced by the guardrail test).
   */
  import { onDestroy } from 'svelte';
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import ToolGlyph from './ToolGlyph.svelte';
  import { recordAppLaunch } from '$lib/stores/launcher-memory';
  import { isOnline } from '$lib/stores/network-status';
  import { titleCap } from '$lib/marketplace/display-text';
  import { createToolLaunch, addPrefetchLink } from './use-tool-launch';
  import { relationshipLabel, updateChipLabel, saveActionLabel } from './labels';
  import type { ToolDisplay, ToolState } from './types';

  interface Props {
    app: ToolDisplay;
    state: ToolState;
    /** Navigating row → anchor + prefetch. Omit for in-app frame swaps (onOpen). */
    href?: string;
    intent?: 'launch' | 'details';
    /** Drawer "current tool" highlight. */
    current?: boolean;
    /** Optional secondary text (last opened, size). Takes precedence over the relationship label. */
    caption?: string;
    /** Sectioned surfaces (Dock) already label the group, so suppress the inline relationship label. */
    hideRelationship?: boolean;
    /** Presentation mode: 'row' (default list row) or 'tile' (icon-forward launchpad grid tile). */
    variant?: 'row' | 'tile';
    onOpen?: (app: ToolDisplay) => void;
    onSave?: (app: ToolDisplay) => void;
    onInfo?: (app: ToolDisplay) => void;
    onClose?: (app: ToolDisplay) => void;
    onRemove?: (app: ToolDisplay) => void;
    onReview?: (app: ToolDisplay) => void;
  }

  let {
    app,
    state,
    href,
    intent = 'launch',
    current = false,
    caption = '',
    hideRelationship = false,
    variant = 'row',
    onOpen,
    onSave,
    onInfo,
    onClose,
    onRemove,
    onReview,
  }: Props = $props();

  const safeName = $derived(app.display?.safeName ?? titleCap(app.name));
  const launchHref = $derived(href ?? `/${encodeURIComponent(app.slug)}`);

  const relLabel = $derived(relationshipLabel(state.relationship));
  const showRel = $derived(!hideRelationship && relLabel !== '');
  const updateLabel = $derived(updateChipLabel(state.updateState));
  const saveLabel = $derived(saveActionLabel(state.offlineState));
  const isRepair = $derived(state.offlineState === 'needs-refresh' || state.offlineState === 'failed');
  const offlineReady = $derived(state.offlineState === 'ready');
  const isSaving = $derived(state.offlineState === 'saving');
  // Show the secondary line only when it has content, so name-only rows stay centered.
  const showCaption = $derived(!showRel && caption !== '');
  const offlineSubLabel = $derived(!$isOnline ? (offlineReady ? '● ready offline' : '● not saved') : '');
  const showOfflineLabel = $derived(!$isOnline);
  const hasStatus = $derived(showRel || isSaving || showCaption || showOfflineLabel);

  // Render a button only when applicable AND the surface wired a handler.
  const showReview = $derived(state.actions.review && !!onReview);
  const showSave = $derived(state.actions.save && !!onSave);
  const showClose = $derived(state.actions.close && !!onClose);
  const showRemove = $derived(state.actions.remove && !!onRemove);
  const showInfo = $derived(state.actions.info && !!onInfo);

  const launch = createToolLaunch({
    getHref: () => href,
    getLaunchHref: () => launchHref,
    getSlug: () => app.slug,
    launchesTool: () => intent === 'launch',
    onOpen: () => onOpen?.(app),
    recordLaunch: recordAppLaunch,
    preloadData,
    addPrefetchLink,
  });
  onDestroy(launch.dispose);

  function stop(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }
</script>

{#snippet rowInner()}
  <span class="row-icon">
    <IconOrMonogram
      name={app.name}
      slug={app.slug}
      iconUrl={app.iconUrl ?? null}
      themeColor={app.themeColor}
      size={44}
    />
    {#if app.firstPartySigned}
      <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
    {/if}
  </span>
  <span class="row-body">
    <span class="row-name">{safeName}</span>
    {#if hasStatus}
      <span class="row-status">
        {#if showRel}<span class="row-rel">{relLabel}</span>{/if}
        {#if isSaving}<span class="chip chip-saving">Saving</span>{/if}
        {#if showCaption}<span class="row-caption">{caption}</span>{/if}
        {#if showOfflineLabel}<span class="row-offline-label" class:ready={offlineReady}>{offlineSubLabel}</span>{/if}
      </span>
    {/if}
  </span>
{/snippet}

{#snippet tileInner()}
  <ToolGlyph
    slug={app.slug}
    name={app.name}
    iconUrl={app.iconUrl ?? null}
    glyph={app.glyph ?? null}
    themeColor={app.themeColor}
    size={56}
    running={state.relationship === 'running'}
    float={true}
  />
  <span class="tile-name">{safeName}</span>
{/snippet}

{#if variant === 'tile'}
  <div class="tile" class:current>
    {#if href}
      <a class="tile-open" href={launchHref} onclick={launch.launchAndRemember}
         data-sveltekit-preload-data="hover" aria-label={`Open ${safeName}`}>
        {@render tileInner()}
      </a>
    {:else}
      <button class="tile-open" type="button" onclick={launch.launchAndRemember} aria-label={`Open ${safeName}`}>
        {@render tileInner()}
      </button>
    {/if}
    <div class="tile-actions">
      {#if showClose}<button class="manage" type="button" onclick={() => onClose?.(app)} aria-label={`Close ${safeName}`}>×</button>{/if}
      {#if showRemove}<button class="manage" type="button" onclick={() => onRemove?.(app)} aria-label={`Remove ${safeName}`}>−</button>{/if}
    </div>
  </div>
{:else}
<div class="row" class:current>
  {#if href}
    <a
      class="row-open"
      href={launchHref}
      onclick={launch.launchAndRemember}
      onpointerdown={launch.warmLaunch}
      ontouchstart={launch.warmLaunch}
      onpointerenter={launch.warmLaunch}
      onfocus={launch.warmLaunch}
      data-sveltekit-preload-data="hover"
      aria-label={`Open ${safeName}`}
    >
      {@render rowInner()}
    </a>
  {:else}
    <button class="row-open" type="button" onclick={launch.launchAndRemember} aria-label={`Open ${safeName}`}>
      {@render rowInner()}
    </button>
  {/if}

  <div class="row-actions">
    {#if showReview}
      <button
        type="button"
        class="chip chip-review"
        onclick={(e) => { stop(e); onReview?.(app); }}
        aria-label={`${updateLabel} for ${safeName}`}
      >{updateLabel}</button>
    {/if}
    {#if showSave}
      <button
        type="button"
        class="icon-btn"
        class:repair={isRepair}
        onclick={(e) => { stop(e); onSave?.(app); }}
        aria-label={`${saveLabel} ${safeName}`}
        title={saveLabel}
      >{isRepair ? '↻' : '+'}</button>
    {/if}
    {#if showClose}
      <button
        type="button"
        class="icon-btn"
        onclick={(e) => { stop(e); onClose?.(app); }}
        aria-label={`Close ${safeName}`}
        title="Close"
      >×</button>
    {/if}
    {#if showRemove}
      <button
        type="button"
        class="icon-btn"
        onclick={(e) => { stop(e); onRemove?.(app); }}
        aria-label={`Remove ${safeName} from Dock`}
        title="Remove from Dock"
      >−</button>
    {/if}
    {#if showInfo}
      <button
        type="button"
        class="icon-btn"
        onclick={(e) => { stop(e); onInfo?.(app); }}
        aria-label={`About ${safeName}`}
        title="About this tool"
      >i</button>
    {/if}
  </div>
</div>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 64px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
    background: transparent;
    box-sizing: border-box;
  }
  /* Hover/current must LIGHTEN on the dark theme (a black overlay did nothing).
     Current = subtle lift + a clean sunset edge bar, not a muddy orange wash. */
  .row:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
  /* Current tool is marked by the sunset edge bar alone — no fill band. */
  .row.current {
    box-shadow: inset 3px 0 0 var(--sunset, #e8603c);
  }
  @media (min-width: 641px) {
    .row { min-height: 68px; }
  }

  .row-open {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
    background: transparent;
    border: 0;
    padding: 0;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row-open:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }

  .row-icon {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }
  .row-icon :global(.shippie-icon) { width: 44px !important; height: 44px !important; }
  .dot {
    position: absolute;
    width: 11px;
    height: 11px;
    border: 2px solid var(--surface, #fff);
    border-radius: 50%;
  }
  .dot-signed { top: -3px; right: -3px; background: var(--sage-leaf); }
  .dot-offline { bottom: -3px; right: -3px; background: var(--text-secondary); }
  .row-offline-label { font-family: var(--font-mono); font-size: var(--text-caption); color: var(--text-secondary); white-space: nowrap; }
  .row-offline-label.ready { color: var(--amber, #f5a623); }

  .row-body { min-width: 0; display: grid; gap: 2px; }
  .row-name {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: var(--text-body);
    line-height: 1.2;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
  .row-rel, .row-caption {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-rel { color: var(--sage-leaf); }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    /* Reserve so rows don't reflow as action buttons toggle. */
    min-width: 44px;
  }
  .icon-btn {
    width: var(--touch-min, 44px);
    height: var(--touch-min, 44px);
    display: inline-grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-body);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .icon-btn:hover { color: var(--text); border-color: var(--border); }
  .icon-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
    color: var(--text);
  }
  .icon-btn.repair {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.35);
    background: rgba(232, 197, 71, 0.08);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-light);
    background: transparent;
  }
  .chip-saving {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.48);
    background: rgba(232, 96, 60, 0.08);
  }
  button.chip-review {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.42);
    background: rgba(232, 197, 71, 0.08);
    cursor: pointer;
  }
  button.chip-review:hover { color: var(--text); }
  button.chip-review:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .row, .row:hover { transition: none; }
  }

  .tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 14px 8px; text-align: center; }
  .tile-open { display: flex; flex-direction: column; align-items: center; gap: 9px; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; font: inherit; text-decoration: none; max-width: 100%; }
  .tile-open:focus-visible { outline: 2px solid var(--sunset); outline-offset: 2px; border-radius: var(--tool-icon-radius); }
  .tile-name { max-width: 100%; font-family: var(--font-heading); font-size: var(--text-small); font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Both close (×) and remove (−) can apply to one tool (running + saved); lay them in a row so they never overlap. */
  .tile-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; }
  .tile-actions .manage { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 24px; padding: 4px; line-height: 1; opacity: 0; transition: opacity 0.12s; background: none; border: 0; color: var(--text-dim, #8c8170); cursor: pointer; }
  .tile:hover .manage, .tile:focus-within .manage { opacity: 1; }
  /* No hover on touch — the × / − must always be reachable there (this is what
     the removed "Manage" mode used to expose). Desktop keeps the hover reveal. */
  @media (hover: none) { .tile-actions .manage { opacity: 1; } }
  .tile-actions .manage:focus-visible { opacity: 1; outline: 2px solid var(--sunset); outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { .tile-actions .manage { transition: none; } }
</style>
