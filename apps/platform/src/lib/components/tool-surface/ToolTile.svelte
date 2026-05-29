<!--
  ToolTile — single tool primitive, three densities.

  See ./types.ts for the rationale. This file owns the markup +
  density-specific CSS. State (saved / saving / pinned) is read from
  the same stores the LauncherCard used, so every surface reflects the
  same truth without prop drilling.

  Palette: tokens only. Drop the tile inside the dark `--bg` shell or
  the cream drawer and it skins itself.
-->
<script lang="ts">
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import CapabilityBadges from '$lib/components/marketplace/CapabilityBadges.svelte';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import {
    recordAppLaunch,
    togglePinnedApp,
  } from '$lib/stores/launcher-memory';
  import { toast } from '$lib/stores/toast';
  import { copyText } from '$lib/utils/copy-link';
  import {
    displayCategory,
    normaliseBlurb,
    titleCap,
  } from '$lib/marketplace/display-text';
  import { connectionBadgesFromKind } from '$lib/marketplace/connection-badges';
  import type {
    ToolDensity,
    ToolRuntimeState,
    ToolTileApp,
  } from './types';

  interface Props {
    app: ToolTileApp;
    /** Defaults to 'card' so the homepage migration is a one-line swap. */
    density?: ToolDensity;
    pinned?: boolean;
    /** Drawer-only — overrides the offline label with a runtime hint. */
    runtimeState?: ToolRuntimeState;
    recentLabel?: string;
    /**
     * When provided, the tile renders as an anchor (with prefetching).
     * Omit it for in-app surfaces that don't navigate (drawer tile that
     * swaps the focused frame via `onOpen`).
     */
    href?: string;
    onOpen?: (app: ToolTileApp) => void;
    onTogglePin?: (slug: string) => void;
    onInspect?: (app: ToolTileApp) => void;
    /** Card-density-only; drawer/dock hide the copy-link affordance. */
    onCopyLink?: (app: ToolTileApp) => void;
    /**
     * Suppress the built-in pin/save/copy/inspect column. Use when the
     * parent surface needs its own action set (e.g. the
     * SavedManageSheet renders refresh + unsave instead of pin).
     */
    noActions?: boolean;
    /** Caption rendered below the name (size, last opened, etc). */
    captionLabel?: string;
  }

  let {
    app,
    density = 'card',
    pinned = false,
    runtimeState = 'idle',
    recentLabel = '',
    href,
    onOpen,
    onTogglePin,
    onInspect,
    onCopyLink,
    noActions = false,
    captionLabel = '',
  }: Props = $props();

  let launching = $state(false);
  let prewarmed = false;
  let copyState = $state<'idle' | 'copied' | 'error'>('idle');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const safeName = $derived(titleCap(app.name));
  const launchHref = $derived(href ?? `/run/${encodeURIComponent(app.slug)}`);
  const offlineStatus = $derived($offlineStatuses[app.slug]);
  const isOffline = $derived($cachedSlugs.has(app.slug) || offlineStatus?.state === 'saved');
  const isSaving = $derived(
    offlineStatus?.state === 'requested' ||
      offlineStatus?.state === 'downloading' ||
      offlineStatus?.state === 'verifying',
  );
  const offlineWarn = $derived(
    offlineStatus?.state === 'partial' ||
      offlineStatus?.state === 'evicted' ||
      offlineStatus?.state === 'error',
  );
  const saveActionLabel = $derived.by(() => {
    if (isSaving) return `Saving ${safeName}`;
    if (isOffline) return `Remove ${safeName} from saved tools`;
    return `Save ${safeName}`;
  });
  const saveActionTitle = $derived.by(() => {
    if (isSaving) return 'Saving offline copy';
    if (isOffline) return 'Saved offline';
    return 'Save';
  });
  const saveGlyph = $derived(isSaving ? '...' : isOffline ? '★' : '☆');
  const categoryLabel = $derived(displayCategory(app.category ?? null));
  const blurb = $derived(
    normaliseBlurb(app.blurb ?? `${safeName} on Shippie`),
  );
  const connectionBadges = $derived(connectionBadgesFromKind(app.kind));

  /**
   * One-line state chip rendered in `card` and `drawer` densities:
   * - drawer favours runtime state (`current` / `live` / `opening`)
   * - card favours offline state (`Saved` / `Saving` / `Refresh`)
   * - tier surfaces in both when present
   */
  const stateChip = $derived.by<{ label: string; tone: 'current' | 'live' | 'saved' | 'saving' | 'warn' | 'tier' | 'idle' } | null>(() => {
    if (density === 'drawer') {
      if (runtimeState === 'current') return { label: 'Current', tone: 'current' };
      if (runtimeState === 'live') return { label: 'Live', tone: 'live' };
      if (runtimeState === 'opening') return { label: 'Opening', tone: 'live' };
    }
    if (isSaving) return { label: 'Saving', tone: 'saving' };
    if (isOffline) return { label: density === 'dock' ? '' : 'Saved', tone: 'saved' };
    if (offlineWarn) return { label: 'Refresh', tone: 'warn' };
    if (app.tier && app.tier !== 'public') {
      const map: Record<string, string> = {
        private: 'Private',
        team: 'Team',
        local: 'On device',
        unlisted: 'Unlisted',
      };
      return { label: map[app.tier] ?? '', tone: 'tier' };
    }
    return null;
  });

  function addPrefetchLink(target: string) {
    if (typeof document === 'undefined') return;
    if (document.head.querySelector(`link[rel="prefetch"][href="${target}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = target;
    link.as = 'document';
    document.head.appendChild(link);
  }

  function warmLaunch() {
    if (prewarmed || !href) return; // only prefetch for navigating tiles
    prewarmed = true;
    void preloadData(launchHref).catch(() => {});
    addPrefetchLink(launchHref);
    addPrefetchLink(`/__shippie-run/${encodeURIComponent(app.slug)}/?shippie_embed=1`);
  }

  function launchAndRemember(event?: MouseEvent) {
    launching = true;
    warmLaunch();
    recordAppLaunch(app.slug);
    if (!href && onOpen) {
      event?.preventDefault();
      onOpen(app);
    }
  }

  function handlePin(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (onTogglePin) onTogglePin(app.slug);
    else togglePinnedApp(app.slug);
  }

  async function handleSave(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isSaving) return;
    if (isOffline) {
      try {
        if (pinned) {
          if (onTogglePin) onTogglePin(app.slug);
          else togglePinnedApp(app.slug);
        }
        await removeAppAndTrack(app.slug);
      } catch {
        toast.push({ kind: 'error', message: 'Could not remove saved copy yet.' });
      }
      return;
    }
    try {
      const result = await ensureAppOffline(app.slug);
      if (result.state === 'saved') {
        if (!pinned) {
          if (onTogglePin) onTogglePin(app.slug);
          else togglePinnedApp(app.slug);
        }
      } else {
        toast.push({ kind: 'error', message: 'Saved copy needs a refresh before it can launch offline.' });
      }
    } catch {
      toast.push({ kind: 'error', message: 'Could not save this tool yet.' });
    }
  }

  function handleInspect(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onInspect?.(app);
  }

  async function handleCopyLink(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (onCopyLink) {
      onCopyLink(app);
      return;
    }
    const origin = typeof window === 'undefined' ? 'https://shippie.app' : window.location.origin;
    const url = `${origin}/apps/${encodeURIComponent(app.slug)}`;
    const copied = await copyText(url);
    copyState = copied ? 'copied' : 'error';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyState = 'idle';
      copyTimer = null;
    }, 1600);
    toast.push(
      copied
        ? { kind: 'success', message: 'Link copied.' }
        : { kind: 'error', message: 'Could not copy link.' },
    );
  }

  const iconSize = $derived(density === 'card' ? 64 : density === 'drawer' ? 52 : 66);
</script>

<article
  class="tile tile-{density}"
  class:launching
  class:current={runtimeState === 'current'}
  class:saved={isOffline}
  aria-busy={launching}
>
  {#if href}
    <a
      class="tile-launch"
      href={launchHref}
      onclick={launchAndRemember}
      onpointerenter={warmLaunch}
      onfocus={warmLaunch}
      ontouchstart={warmLaunch}
      data-sveltekit-preload-data="tap"
      data-sveltekit-preload-code="eager"
      aria-label={`Open ${safeName}`}
    >
      <span class="tile-icon">
        {#if density !== 'card' && app.glyph && !app.iconUrl}
          <span class="tile-glyph" style:--accent={app.themeColor} aria-hidden="true">
            {app.glyph}
          </span>
        {:else}
          <IconOrMonogram
            name={app.name}
            slug={app.slug}
            iconUrl={app.iconUrl ?? null}
            themeColor={app.themeColor}
            size={iconSize}
          />
        {/if}
        {#if app.firstPartySigned}
          <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
        {/if}
        {#if isOffline && density === 'dock'}
          <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
        {/if}
      </span>
      <span class="tile-body">
        {#if density === 'card'}
          <span class="tile-eyebrow">
            <span class="category">{categoryLabel}</span>
            {#each connectionBadges as badge (badge.label)}
              <span class="conn-pill conn-{badge.tone}" title={badge.title}>{badge.label}</span>
            {/each}
          </span>
        {/if}
        <span class="tile-name">{safeName}</span>
        {#if density === 'card'}
          <span class="tile-blurb">{blurb}</span>
        {/if}
        {#if recentLabel || stateChip || captionLabel}
          <span class="tile-meta">
            {#if stateChip}
              <span class="chip chip-{stateChip.tone}">{stateChip.label}</span>
            {/if}
            {#if recentLabel}
              <span class="chip chip-recent">{recentLabel}</span>
            {/if}
            {#if captionLabel}
              <span class="caption">{captionLabel}</span>
            {/if}
          </span>
        {/if}
        {#if density === 'card' && (app.badges ?? []).length > 0}
          <span class="tile-badges">
            <CapabilityBadges badges={app.badges ?? []} max={2} compact />
          </span>
        {/if}
        {#if launching}
          <span class="tile-launching" aria-live="polite">Opening…</span>
        {/if}
      </span>
    </a>
  {:else}
    <button
      type="button"
      class="tile-launch"
      onclick={launchAndRemember}
      aria-label={`Open ${safeName}`}
    >
      <span class="tile-icon">
        {#if density !== 'card' && app.glyph && !app.iconUrl}
          <span class="tile-glyph" style:--accent={app.themeColor} aria-hidden="true">
            {app.glyph}
          </span>
        {:else}
          <IconOrMonogram
            name={app.name}
            slug={app.slug}
            iconUrl={app.iconUrl ?? null}
            themeColor={app.themeColor}
            size={iconSize}
          />
        {/if}
        {#if app.firstPartySigned}
          <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
        {/if}
        {#if isOffline && density === 'dock'}
          <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
        {/if}
      </span>
      <span class="tile-body">
        <span class="tile-name">{safeName}</span>
        {#if stateChip}
          <span class="tile-meta">
            <span class="chip chip-{stateChip.tone}">{stateChip.label}</span>
          </span>
        {/if}
      </span>
    </button>
  {/if}

  {#if density !== 'dock' && !noActions}
    <div class="tile-actions" aria-label={`${safeName} actions`}>
      {#if density === 'card'}
        <button
          type="button"
          class="icon-btn"
          class:pressed={isOffline}
          aria-pressed={isOffline}
          aria-label={saveActionLabel}
          title={saveActionTitle}
          disabled={isSaving}
          onclick={handleSave}
        >
          {saveGlyph}
        </button>
        <button
          type="button"
          class="icon-btn"
          class:copied={copyState === 'copied'}
          class:errored={copyState === 'error'}
          title={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
          aria-label={`Copy link for ${safeName}`}
          onclick={handleCopyLink}
        >
          {copyState === 'copied' ? '✓' : copyState === 'error' ? '!' : '↗'}
        </button>
        {#if onInspect}
          <button
            type="button"
            class="icon-btn"
            aria-label={`About ${safeName}`}
            title="About this tool"
            onclick={handleInspect}
          >
            i
          </button>
        {/if}
      {:else if density === 'drawer'}
        <button
          type="button"
          class="icon-btn"
          class:pressed={pinned}
          aria-label={pinned ? `Unpin ${safeName}` : `Pin ${safeName}`}
          aria-pressed={pinned}
          title={pinned ? 'Unpin' : 'Pin'}
          onclick={handlePin}
        >
          {pinned ? '★' : '☆'}
        </button>
      {/if}
    </div>
  {/if}
</article>

<style>
  /* Tokens-only — the tile carries no palette of its own. Drop it
     inside the dark `--bg` shell (launcher) or the cream `--cream-bg`
     drawer (focused mode) and it skins itself. */
  .tile {
    position: relative;
    background: var(--surface, transparent);
    color: var(--text);
    border: 1px solid var(--border, transparent);
    transition:
      border-color 0.15s var(--ease-out, ease),
      background 0.15s var(--ease-out, ease),
      box-shadow 0.15s var(--ease-out, ease),
      transform 0.15s var(--ease-out, ease);
    isolation: isolate;
    box-sizing: border-box;
  }
  .tile:hover {
    border-color: var(--sunset);
    transform: translateY(-1px);
  }
  .tile.launching {
    border-color: var(--sunset);
  }
  .tile.launching::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 2px;
    background: var(--sunset);
    transform-origin: left center;
    animation: tile-launch-line 0.7s var(--ease-out, ease) infinite alternate;
  }
  @keyframes tile-launch-line {
    from { transform: scaleX(0.18); opacity: 0.65; }
    to { transform: scaleX(1); opacity: 1; }
  }

  /* ---- launch surface (anchor or button) ---- */
  .tile-launch {
    display: grid;
    gap: 12px;
    color: inherit;
    text-decoration: none;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    width: 100%;
  }
  .tile-launch:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }

  .tile-icon {
    position: relative;
    display: inline-grid;
    place-items: center;
  }
  .tile-icon :global(.shippie-icon) {
    display: inline-flex;
  }
  .tile-glyph {
    display: inline-grid;
    place-items: center;
    background: var(--accent, var(--surface-alt));
    color: #ede4d3;
    font-family: var(--font-heading);
    font-weight: 600;
    user-select: none;
  }
  .dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--surface);
    border-radius: 50%;
  }
  .dot-signed { top: -3px; right: -3px; background: var(--sage-leaf); }
  .dot-offline { bottom: -3px; right: -3px; background: var(--text-secondary); }

  .tile-body {
    min-width: 0;
    display: grid;
    gap: 4px;
    align-content: start;
  }
  .tile-name {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile-eyebrow {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }
  .tile-blurb {
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .tile-meta {
    margin-top: 4px;
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tile-launching {
    margin-top: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--sunset);
  }
  .tile-badges {
    margin-top: 6px;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* ---- chips ---- */
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0;
    color: var(--text-light);
    background: transparent;
  }
  .chip-current {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.48);
    background: rgba(232, 96, 60, 0.08);
  }
  .chip-live {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.48);
    background: rgba(122, 154, 110, 0.08);
  }
  .chip-saved {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.45);
    background: rgba(122, 154, 110, 0.08);
  }
  .chip-saving {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.48);
    background: rgba(232, 96, 60, 0.08);
  }
  .chip-warn {
    color: var(--marigold);
    border-color: rgba(226, 192, 104, 0.48);
    background: rgba(226, 192, 104, 0.08);
  }
  .chip-tier { color: var(--text-secondary); }
  .chip-recent { color: var(--sage-leaf); border-color: rgba(122, 154, 110, 0.35); }
  .caption {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
    letter-spacing: 0;
  }

  /* ---- connection pills (card density only) ---- */
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
  .conn-pill::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .conn-service, .conn-hosted {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.45);
    background: rgba(232, 96, 60, 0.08);
  }
  .conn-ai {
    color: #7c5cc4;
    border-color: rgba(124, 92, 196, 0.42);
    background: rgba(124, 92, 196, 0.08);
  }
  .conn-weather, .conn-location {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.4);
    background: rgba(122, 154, 110, 0.08);
  }
  .conn-payment {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.42);
    background: rgba(232, 197, 71, 0.08);
  }

  /* ---- actions column ---- */
  .tile-actions {
    display: flex;
    gap: 4px;
    align-self: start;
  }
  .icon-btn {
    width: var(--touch-min, 44px);
    height: var(--touch-min, 44px);
    display: inline-grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      color 0.15s var(--ease-out, ease),
      border-color 0.15s var(--ease-out, ease),
      background 0.15s var(--ease-out, ease);
  }
  .icon-btn:hover {
    color: var(--text);
    border-color: var(--border);
  }
  .icon-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
    color: var(--text);
  }
  .icon-btn.pressed {
    color: var(--marigold);
    background: rgba(232, 197, 71, 0.08);
    border-color: rgba(232, 197, 71, 0.35);
  }
  .icon-btn.copied {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.45);
    background: rgba(122, 154, 110, 0.08);
  }
  .icon-btn.errored {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.45);
    background: rgba(232, 96, 60, 0.08);
  }
  .icon-btn:disabled {
    cursor: progress;
    color: var(--text-light);
    opacity: 0.58;
  }

  /* =========================================================
     Density: CARD — the marketplace home / search / category
     grid. Full launcher card with eyebrow, blurb, full action
     column. Container queries adapt to the parent grid cell.
     ========================================================= */
  .tile-card {
    container-type: inline-size;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    grid-template-areas: 'icon body actions';
    gap: 16px;
    padding: 16px;
    min-height: 124px;
  }
  .tile-card:hover { background: var(--surface-alt); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14); }
  .tile-card .tile-launch {
    grid-area: 1 / 1 / 2 / 3;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    grid-template-areas: 'icon body';
    gap: 16px;
    align-items: start;
  }
  .tile-card .tile-icon {
    grid-area: icon;
    width: 64px;
    height: 64px;
  }
  .tile-card .tile-icon :global(.shippie-icon) { width: 64px !important; height: 64px !important; }
  .tile-card .tile-body { grid-area: body; }
  .tile-card .tile-actions {
    grid-area: actions;
    flex-direction: column;
  }
  .tile-card .tile-name { font-size: 1.125rem; line-height: 1.2; }
  @container (min-width: 22rem) {
    .tile-card .tile-blurb { -webkit-line-clamp: 3; line-clamp: 3; }
  }
  @container (max-width: 19rem) {
    .tile-card { grid-template-columns: 52px minmax(0, 1fr) auto; gap: 12px; padding: 14px; }
    .tile-card .tile-launch { grid-template-columns: 52px minmax(0, 1fr); gap: 12px; }
    .tile-card .tile-icon { width: 52px; height: 52px; }
    .tile-card .tile-icon :global(.shippie-icon) { width: 52px !important; height: 52px !important; }
    .tile-card .tile-name { font-size: 1rem; }
  }

  /* =========================================================
     Density: DRAWER — compressed row inside the focused-mode
     drawer (cream sheet). Icon left, name + state right, pin
     star far right. Glyph allowed when no iconUrl.
     ========================================================= */
  .tile-drawer {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 12px;
    padding: 10px 12px;
    background: transparent;
    border-color: transparent;
    border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
  }
  .tile-drawer:hover {
    background: rgba(0, 0, 0, 0.04);
    border-color: transparent;
    border-bottom-color: var(--border-light, rgba(0, 0, 0, 0.06));
    transform: none;
  }
  .tile-drawer.current {
    background: rgba(232, 96, 60, 0.06);
    box-shadow: inset 3px 0 0 var(--sunset, #e8603c);
    animation: tile-current-pulse 1200ms ease-out 100ms 1;
  }
  /* One-shot pulse the first time the current tile renders — i.e.
     when the drawer opens. Subtle enough to ignore, present enough
     to draw the eye on first use. Suppressed under reduced motion. */
  @keyframes tile-current-pulse {
    0%   { background: rgba(232, 96, 60, 0.16); }
    100% { background: rgba(232, 96, 60, 0.06); }
  }
  .tile-drawer .tile-launch {
    grid-template-columns: 52px minmax(0, 1fr);
    grid-template-areas: 'icon body';
    gap: 12px;
    align-items: center;
  }
  .tile-drawer .tile-icon {
    grid-area: icon;
    width: 52px;
    height: 52px;
  }
  .tile-drawer .tile-icon :global(.shippie-icon) { width: 52px !important; height: 52px !important; }
  .tile-drawer .tile-glyph {
    width: 52px;
    height: 52px;
    font-size: 22px;
  }
  .tile-drawer .tile-body { grid-area: body; }
  .tile-drawer .tile-name {
    font-size: 1rem;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile-drawer .tile-meta { margin-top: 2px; }

  /* =========================================================
     Density: DOCK — saved rail on the homepage. Just icon + name.
     ========================================================= */
  .tile-dock {
    display: grid;
    gap: 0;
    padding: 0;
    background: transparent;
    border: 0;
    min-width: 0;
  }
  .tile-dock:hover { background: transparent; border: 0; transform: none; }
  .tile-dock .tile-launch {
    grid-template-columns: 1fr;
    gap: 6px;
    justify-items: center;
  }
  .tile-dock .tile-icon {
    width: 66px;
    height: 66px;
    transition: transform 0.15s var(--spring, ease);
  }
  .tile-dock:hover .tile-icon { transform: scale(1.04); }
  .tile-dock .tile-icon :global(.shippie-icon) { width: 66px !important; height: 66px !important; }
  .tile-dock .tile-glyph {
    width: 66px;
    height: 66px;
    font-size: 28px;
  }
  .tile-dock .tile-body {
    justify-items: center;
    text-align: center;
  }
  .tile-dock .tile-name {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 12px;
    line-height: 1.2;
    color: var(--text-secondary);
    max-width: 66px;
    white-space: nowrap;
  }
  .tile-dock .tile-meta { display: none; }
  .tile-dock .tile-launch:focus-visible {
    outline: none;
  }
  .tile-dock .tile-launch:focus-visible .tile-icon {
    outline: 2px solid var(--sunset);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile, .tile:hover, .tile.launching { transform: none; box-shadow: none; }
    .tile.launching::after { animation: none; transform: none; }
    .tile-drawer.current { animation: none; }
  }
</style>
