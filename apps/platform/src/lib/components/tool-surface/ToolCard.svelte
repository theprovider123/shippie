<script lang="ts">
  /**
   * ToolCard — the second harmonization primitive (spec §4.2). The
   * desktop Tools browse card. Fixed height regardless of badge or
   * description content: the eyebrow, a 2-line description clamp, and a
   * single reserved badge row are ALWAYS laid out, so cards never differ
   * in height across the grid. Action rail is save + info only — close /
   * remove / review are Dock concepts and never appear on browse.
   *
   * Labels come only from ./labels (guardrail test).
   */
  import { onDestroy } from 'svelte';
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import CapabilityBadges from '$lib/components/marketplace/CapabilityBadges.svelte';
  import { recordAppLaunch } from '$lib/stores/launcher-memory';
  import { titleCap, displayCategory, normaliseBlurb } from '$lib/marketplace/display-text';
  import { connectionBadgesFromKind } from '$lib/marketplace/connection-badges';
  import { createToolLaunch, addPrefetchLink } from './use-tool-launch';
  import { saveActionLabel } from './labels';
  import type { ToolDisplay, ToolState } from './types';

  interface Props {
    app: ToolDisplay;
    state: ToolState;
    href?: string;
    intent?: 'launch' | 'details';
    onOpen?: (app: ToolDisplay) => void;
    onSave?: (app: ToolDisplay) => void;
    onInfo?: (app: ToolDisplay) => void;
  }

  let { app, state, href, intent = 'launch', onOpen, onSave, onInfo }: Props = $props();

  const safeName = $derived(app.display?.safeName ?? titleCap(app.name));
  const categoryLabel = $derived(app.display?.categoryLabel ?? displayCategory(app.category ?? null));
  const blurb = $derived(
    app.display?.blurb ?? normaliseBlurb(app.blurb ?? `${safeName} on Shippie`),
  );
  const connectionBadges = $derived(app.display?.connectionBadges ?? connectionBadgesFromKind(app.kind));
  const launchHref = $derived(href ?? `/run/${encodeURIComponent(app.slug)}`);

  const saveLabel = $derived(saveActionLabel(state.offlineState));
  const isRepair = $derived(state.offlineState === 'needs-refresh' || state.offlineState === 'failed');
  const offlineReady = $derived(state.offlineState === 'ready');
  const isSaving = $derived(state.offlineState === 'saving');
  const showSave = $derived(state.actions.save && !!onSave);
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

<article class="card">
  {#if href}
    <a
      class="card-open"
      href={launchHref}
      onclick={launch.launchAndRemember}
      onpointerdown={launch.warmLaunch}
      onpointerenter={launch.warmLaunch}
      onfocus={launch.warmLaunch}
      data-sveltekit-preload-data="hover"
      aria-label={`Open ${safeName}`}
    >
      <span class="card-icon">
        <IconOrMonogram
          name={app.name}
          slug={app.slug}
          iconUrl={app.iconUrl ?? null}
          themeColor={app.themeColor}
          size={56}
        />
        {#if app.firstPartySigned}
          <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
        {/if}
        {#if offlineReady}
          <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
        {/if}
      </span>
      <span class="card-body">
        <span class="card-eyebrow">
          <span class="category">{categoryLabel}</span>
          {#each connectionBadges as badge (badge.label)}
            <span class="conn-pill conn-{badge.tone}" title={badge.title}>{badge.label}</span>
          {/each}
        </span>
        <span class="card-name">{safeName}</span>
        <span class="card-blurb">{blurb}</span>
        <span class="card-badge-row">
          <CapabilityBadges badges={app.badges ?? []} max={2} compact />
        </span>
      </span>
    </a>
  {:else}
    <button class="card-open" type="button" onclick={launch.launchAndRemember} aria-label={`Open ${safeName}`}>
      <span class="card-icon">
        <IconOrMonogram
          name={app.name}
          slug={app.slug}
          iconUrl={app.iconUrl ?? null}
          themeColor={app.themeColor}
          size={56}
        />
        {#if app.firstPartySigned}
          <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
        {/if}
        {#if offlineReady}
          <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
        {/if}
      </span>
      <span class="card-body">
        <span class="card-eyebrow"><span class="category">{categoryLabel}</span></span>
        <span class="card-name">{safeName}</span>
        <span class="card-blurb">{blurb}</span>
        <span class="card-badge-row">
          <CapabilityBadges badges={app.badges ?? []} max={2} compact />
        </span>
      </span>
    </button>
  {/if}

  <div class="card-actions">
    {#if showSave}
      <button
        type="button"
        class="icon-btn"
        class:repair={isRepair}
        disabled={isSaving}
        onclick={(e) => { stop(e); onSave?.(app); }}
        aria-label={`${saveLabel} ${safeName}`}
        title={saveLabel}
      >{isSaving ? '…' : isRepair ? '↻' : '+'}</button>
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
</article>

<style>
  .card {
    position: relative;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 16px;
    padding: 16px;
    /* Fixed height: eyebrow + name + 2-line blurb + reserved badge row. */
    min-height: 148px;
    background: var(--surface, transparent);
    color: var(--text);
    border: 1px solid var(--border, transparent);
    box-sizing: border-box;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    isolation: isolate;
  }
  .card:hover {
    border-color: var(--sunset);
    background: var(--surface-alt);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
    transform: translateY(-1px);
  }

  .card-open {
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    color: inherit;
    text-decoration: none;
    background: transparent;
    border: 0;
    padding: 0;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card-open:focus-visible { outline: 2px solid var(--sunset); outline-offset: 2px; }

  .card-icon {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
  }
  .card-icon :global(.shippie-icon) { width: 56px !important; height: 56px !important; }
  .dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--surface, #fff);
    border-radius: 50%;
  }
  .dot-signed { top: -3px; right: -3px; background: var(--sage-leaf); }
  .dot-offline { bottom: -3px; right: -3px; background: var(--text-secondary); }

  .card-body { min-width: 0; display: grid; gap: 4px; align-content: start; }
  .card-eyebrow {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    min-height: 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }
  .card-name {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1.125rem;
    line-height: 1.2;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-blurb {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    /* Reserve exactly two lines so cards stay equal height. */
    min-height: calc(14px * 1.5 * 2);
  }
  .card-badge-row {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    /* Reserved even when empty, so a card with badges matches one without. */
    min-height: 22px;
  }

  .conn-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    font-size: 10px;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    background: transparent;
  }
  .conn-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .conn-service, .conn-hosted { color: var(--sunset); border-color: rgba(232, 96, 60, 0.45); background: rgba(232, 96, 60, 0.08); }
  .conn-ai { color: var(--accent-violet); border-color: rgba(124, 92, 196, 0.42); background: rgba(124, 92, 196, 0.08); }
  .conn-weather, .conn-location { color: var(--sage-leaf); border-color: rgba(122, 154, 110, 0.4); background: rgba(122, 154, 110, 0.08); }
  .conn-payment { color: var(--marigold); border-color: rgba(232, 197, 71, 0.42); background: rgba(232, 197, 71, 0.08); }

  .card-actions { display: flex; flex-direction: column; gap: 4px; align-self: start; }
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
    font-size: 1.05rem;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .icon-btn:hover { color: var(--text); border-color: var(--border); }
  .icon-btn:focus-visible { outline: 2px solid var(--sunset); outline-offset: -2px; color: var(--text); }
  .icon-btn:disabled { cursor: progress; color: var(--text-light); opacity: 0.58; }
  .icon-btn.repair { color: var(--marigold); border-color: rgba(232, 197, 71, 0.35); background: rgba(232, 197, 71, 0.08); }

  @media (prefers-reduced-motion: reduce) {
    .card, .card:hover { transform: none; box-shadow: none; transition: none; }
  }
  @media (max-width: 768px) {
    /* Mobile Tools uses ToolRow, not this card; keep a graceful fallback. */
    .card { min-height: 120px; gap: 12px; padding: 12px; }
  }
</style>
