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
  import {
    displayCategory,
    kindAriaLabel,
    kindPillLabel,
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
    /** Accepted for backward-compatibility with the v1 grid. v2 sizes
        itself via container queries, so this is a no-op. */
    compact?: boolean;
    /** Adds a thin sunset ribbon along the left edge. Used by the
        first-visit spotlight in PR-D. */
    spotlight?: boolean;
    onInspect?: (app: LauncherApp) => void;
    onTogglePin?: (slug: string) => void;
  }

  let {
    app,
    pinned = false,
    recentLabel = '',
    spotlight = false,
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
  const kindLabel = $derived(kindPillLabel(app.kind));
  const kindLabelAria = $derived(kindAriaLabel(app.kind));

  const cornerSummary = $derived.by(() => {
    const parts: string[] = [];
    if (app.firstPartySigned) parts.push('Shippie-signed');
    if (isOffline) parts.push('saved offline');
    return parts.length ? parts.join(', ') + '.' : '';
  });

  function save(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const shouldSave = !pinned;
    if (onTogglePin) {
      onTogglePin(app.slug);
    } else {
      togglePinnedApp(app.slug);
    }
    if (shouldSave) {
      void ensureAppOffline(app.slug).catch(() => {
        toast.push({ kind: 'error', message: 'Could not save this tool yet.' });
      });
    } else {
      void removeAppAndTrack(app.slug).catch(() => {
        toast.push({ kind: 'error', message: 'Could not remove saved copy yet.' });
      });
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
  class:launching
  class:spotlight
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
        {#if kindLabel}
          <span class="kind-pill kind-{app.kind}" title={kindLabelAria}>{kindLabel}</span>
        {/if}
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
      class:pressed={pinned}
      aria-pressed={pinned}
      aria-label={pinned ? `Remove ${safeName} from saved tools` : `Save ${safeName}`}
      title={pinned ? 'Saved' : 'Save'}
      onclick={save}
    >
      {pinned ? '★' : '☆'}
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
      transform 0.15s var(--ease-out);
    isolation: isolate;
  }
  .card:hover {
    border-color: var(--sunset);
    background: var(--surface-alt);
    transform: translateY(-1px);
  }
  .card:focus-within {
    outline: 2px solid var(--sunset);
    outline-offset: 2px;
  }
  .card.spotlight::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--sunset);
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
  .eyebrow {
    margin: 0;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0;
    color: var(--text-light);
  }
  .category { line-height: 1.2; }
  .kind-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    font-size: 10px;
    letter-spacing: 0;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    background: transparent;
  }
  .kind-pill::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .kind-pill.kind-local {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.4);
    background: rgba(122, 154, 110, 0.08);
  }
  .kind-pill.kind-connected {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.45);
    background: rgba(232, 96, 60, 0.08);
  }
  .kind-pill.kind-cloud {
    color: var(--text-light);
    border-color: var(--border);
  }

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.125rem;
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
    font-size: 14px;
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
    font-size: 10px;
    color: var(--text-light);
  }
  .launching-label {
    margin: 6px 0 0;
    font-family: var(--font-mono);
    font-size: 11px;
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
    font-size: 0.95rem;
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
    h3 { font-size: 1rem; }
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
    .card, .card:hover, .card.launching { transform: none; }
    .card.launching::after { animation: none; transform: none; }
  }
</style>
