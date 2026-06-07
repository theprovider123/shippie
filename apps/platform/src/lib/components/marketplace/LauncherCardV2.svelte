<script lang="ts">
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from './IconOrMonogram.svelte';
  import { toast } from '$lib/stores/toast';
  import {
    recordAppLaunch,
    togglePinnedApp,
  } from '$lib/stores/launcher-memory';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
  import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';
  import { connectionBadgesFromKind } from '$lib/marketplace/connection-badges';
  import {
    displayCategory,
    normaliseBlurb,
    titleCap,
  } from '$lib/marketplace/display-text';

  interface LauncherApp {
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    type: string;
    category: string;
    iconUrl: string | null;
    themeColor: string;
    upvoteCount?: number;
    installCount?: number;
    badges?: PublicCapabilityBadge[];
    kind?: AppKind | null;
    kindStatus?: PublicKindStatus | null;
    firstPartySigned?: boolean;
  }

  interface Props {
    app: LauncherApp;
    pinned?: boolean;
    recentLabel?: string;
    /** Dense card treatment for launcher grids. */
    compact?: boolean;
    onInspect?: (app: LauncherApp) => void;
    onTogglePin?: (slug: string) => void;
  }

  let {
    app,
    pinned = false,
    recentLabel = '',
    compact = false,
    onInspect,
    onTogglePin,
  }: Props = $props();

  let launching = $state(false);
  let prewarmed = false;

  const safeName = $derived(titleCap(app.name));
  const safeBlurb = $derived(
    normaliseBlurb(app.tagline ?? app.description ?? `${safeName} on Shippie`),
  );
  const categoryLabel = $derived(displayCategory(app.category));
  const launchHref = $derived(`/run/${encodeURIComponent(app.slug)}`);
  const offlineStatus = $derived($offlineStatuses[app.slug]);
  const isOffline = $derived($cachedSlugs.has(app.slug) || offlineStatus?.state === 'saved');
  const isSaving = $derived(
    offlineStatus?.state === 'requested' ||
      offlineStatus?.state === 'downloading' ||
      offlineStatus?.state === 'verifying',
  );
  const connectionBadges = $derived(connectionBadgesFromKind(app.kind));
  const saveActionLabel = $derived.by(() => {
    if (isSaving) return `Saving ${safeName}`;
    if (isOffline) return `Remove ${safeName} from saved tools`;
    return `Save ${safeName}`;
  });
  const saveActionTitle = $derived.by(() => {
    if (isSaving) return 'Saving to Dock';
    if (isOffline) return 'Saved offline';
    return 'Save';
  });
  const saveActionGlyph = $derived(isSaving ? '...' : isOffline ? '★' : '☆');

  const cornerSummary = $derived.by(() => {
    const parts: string[] = [];
    if (app.firstPartySigned) parts.push('Shippie-signed');
    if (isOffline) parts.push('saved offline');
    return parts.length ? parts.join(', ') + '.' : '';
  });

  async function save(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isSaving) return;

    if (isOffline) {
      try {
        if (pinned) {
          if (onTogglePin) onTogglePin(app.slug);
          else togglePinnedApp(app.slug);
        }
        if (isOffline || offlineStatus?.state === 'partial' || offlineStatus?.state === 'evicted') {
          await removeAppAndTrack(app.slug);
        }
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

  function inspect(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onInspect?.(app);
  }

  function addPrefetchLink(href: string) {
    if (typeof document === 'undefined') return;
    if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    document.head.appendChild(link);
  }

  function warmLaunch() {
    if (prewarmed) return;
    prewarmed = true;
    void preloadData(launchHref).catch(() => {});
    addPrefetchLink(launchHref);
    addPrefetchLink(`/__shippie-run/${encodeURIComponent(app.slug)}/?shippie_embed=1`);
  }

  function launchAndRemember() {
    launching = true;
    warmLaunch();
    recordAppLaunch(app.slug);
  }
</script>

<article
  class="card"
  class:compact
  class:launching
  aria-busy={launching}
>
  <a
    class="launch"
    href={launchHref}
    onclick={launchAndRemember}
    onpointerenter={warmLaunch}
    onfocus={warmLaunch}
    data-sveltekit-preload-data="tap"
    data-sveltekit-preload-code="hover"
    aria-label={`Open ${safeName} — ${categoryLabel}`}
  >
    <div class="icon">
      <IconOrMonogram
        name={app.name}
        slug={app.slug}
        iconUrl={app.iconUrl}
        themeColor={app.themeColor}
        size={64}
      />
      {#if app.firstPartySigned}
        <span class="dot dot-signed" aria-hidden="true" title="Shippie-signed"></span>
      {/if}
      {#if isOffline}
        <span class="dot dot-offline" aria-hidden="true" title="Saved offline"></span>
      {/if}
    </div>
    <div class="copy">
      <p class="eyebrow">
        <span class="category">{categoryLabel}</span>
        {#each connectionBadges as badge (badge.label)}
          <span class="connection-pill connection-{badge.tone}" title={badge.title}>{badge.label}</span>
        {/each}
        {#if cornerSummary}
          <span class="sr-only">{cornerSummary}</span>
        {/if}
      </p>
      <h3>{safeName}</h3>
      <p class="blurb">{safeBlurb}</p>
      {#if recentLabel}
        <p class="recency">{recentLabel}</p>
      {/if}
      {#if launching}
        <p class="launching-label" aria-live="polite">Opening…</p>
      {/if}
    </div>
  </a>
  <div class="actions" aria-label={`${safeName} actions`}>
    <button
      type="button"
      class="icon-btn"
      class:pressed={isOffline}
      aria-pressed={isOffline}
      aria-label={saveActionLabel}
      title={saveActionTitle}
      disabled={isSaving}
      onclick={save}
    >
      {saveActionGlyph}
    </button>
    <button
      type="button"
      class="icon-btn"
      aria-label={`About ${safeName}`}
      title="About this tool"
      onclick={inspect}
    >
      i
    </button>
  </div>
</article>

<style>
  /* Container query density: every card adapts to its grid cell.
     No new shell breakpoints introduced. */
  .card {
    container-type: inline-size;
    position: relative;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    grid-template-areas: 'icon copy actions';
    gap: 16px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border-light);
    color: var(--text);
    transition:
      border-color 0.15s var(--ease-out),
      background 0.15s var(--ease-out),
      box-shadow 0.15s var(--ease-out),
      transform 0.15s var(--ease-out);
    isolation: isolate;
  }
  .card:hover {
    border-color: var(--sunset);
    background: var(--surface-alt);
    transform: translateY(-1px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  }
  .card:focus-within {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }
  .card.launching {
    border-color: var(--sunset);
    background: var(--surface-alt);
  }
  .card.launching::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 2px;
    background: var(--sunset);
    transform-origin: left center;
    animation: launch-line 0.7s var(--ease-out) infinite alternate;
  }
  @keyframes launch-line {
    from { transform: scaleX(0.18); opacity: 0.65; }
    to { transform: scaleX(1); opacity: 1; }
  }

  /* The launch link spans icon + copy only. Sibling buttons live
     outside its layout — no nested interactive elements. */
  .launch {
    grid-area: 1 / 1 / 2 / 3;
    display: contents;
    color: inherit;
    text-decoration: none;
  }

  /* Icon tile with corner dots. Dots are visual; meaning lives in
     the eyebrow's sr-only summary plus the title attribute. */
  .icon {
    grid-area: icon;
    position: relative;
    width: 64px;
    height: 64px;
  }
  .icon :global(.shippie-icon) {
    width: 64px !important;
    height: 64px !important;
  }
  .dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--surface);
    border-radius: 50%;
  }
  .card:hover .dot {
    border-color: var(--surface-alt);
  }
  .dot-signed {
    top: -3px;
    right: -3px;
    background: var(--sage-leaf);
  }
  .dot-offline {
    bottom: -3px;
    right: -3px;
    background: var(--text-secondary);
  }

  .copy {
    grid-area: copy;
    min-width: 0;
    display: grid;
    gap: 4px;
    align-content: start;
  }

  .card.compact {
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 12px;
    min-height: 116px;
    padding: 12px;
  }
  .card.compact .icon {
    width: 52px;
    height: 52px;
  }
  .card.compact .icon :global(.shippie-icon) {
    width: 52px !important;
    height: 52px !important;
  }
  .card.compact .copy {
    gap: 3px;
  }
  .card.compact h3 {
    font-size: var(--text-body);
    line-height: 1.12;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .card.compact .blurb {
    margin-top: 2px;
    font-size: var(--text-small);
    line-height: 1.35;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .card.compact .recency,
  .card.compact .launching-label {
    margin-top: 2px;
  }
  .card.compact .connection-pill {
    padding: 1px 5px;
  }
  .eyebrow {
    margin: 0;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0;
    color: var(--text-light);
  }
  .category { line-height: 1.2; }
  .connection-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    font-size: var(--text-caption);
    letter-spacing: 0;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    background: transparent;
  }
  .connection-pill::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .connection-service,
  .connection-hosted {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.45);
    background: rgba(232, 96, 60, 0.08);
  }
  .connection-ai {
    color: var(--accent-violet);
    border-color: rgba(124, 92, 196, 0.42);
    background: rgba(124, 92, 196, 0.08);
  }
  .connection-weather,
  .connection-location {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.4);
    background: rgba(122, 154, 110, 0.08);
  }
  .connection-payment {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.42);
    background: rgba(232, 197, 71, 0.08);
  }

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-lede);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.2;
    color: var(--text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .blurb {
    margin: 4px 0 0;
    font-size: var(--text-small);
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  /* Wider cards get the extra description line */
  @container (min-width: 22rem) {
    .blurb { -webkit-line-clamp: 3; line-clamp: 3; }
  }

  .recency {
    margin: 6px 0 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-light);
  }
  .launching-label {
    margin: 6px 0 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--sunset);
    letter-spacing: 0;
  }

  /* Action column — always visible, both controls hit the tap floor. */
  .actions {
    grid-area: actions;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: start;
  }
  .icon-btn {
    width: var(--touch-min);
    height: var(--touch-min);
    display: inline-grid;
    place-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-body);
    cursor: pointer;
    transition:
      color 0.15s var(--ease-out),
      border-color 0.15s var(--ease-out),
      background 0.15s var(--ease-out);
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
  .icon-btn:disabled {
    cursor: progress;
    color: var(--text-light);
    opacity: 0.58;
  }

  /* Narrow container: drop the icon size, condense padding */
  @container (max-width: 19rem) {
    .card {
      grid-template-columns: 52px minmax(0, 1fr) auto;
      gap: 12px;
      padding: 14px;
    }
    .icon { width: 52px; height: 52px; }
    .icon :global(.shippie-icon) {
      width: 52px !important;
      height: 52px !important;
    }
    h3 { font-size: var(--text-body); }
  }

  @container (max-width: 18rem) {
    .card.compact {
      grid-template-columns: 48px minmax(0, 1fr) auto;
      gap: 10px;
      min-height: 108px;
      padding: 10px;
    }
    .card.compact .icon,
    .card.compact .icon :global(.shippie-icon) {
      width: 48px !important;
      height: 48px !important;
    }
  }

  @media (max-width: 640px) {
    .card.compact {
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 10px;
      min-height: 104px;
      padding: 10px;
    }
    .card.compact .icon,
    .card.compact .icon :global(.shippie-icon) {
      width: 44px !important;
      height: 44px !important;
    }
    .card.compact h3 {
      font-size: var(--text-body);
    }
    .card.compact .blurb {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }

  /* Accessibility helper */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .card, .card:hover, .card.launching { transform: none; box-shadow: none; }
    .card.launching::after { animation: none; transform: none; }
  }
</style>
