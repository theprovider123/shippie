<script lang="ts">
  import { preloadData } from '$app/navigation';
  import IconOrMonogram from './IconOrMonogram.svelte';
  import KindBadge from './KindBadge.svelte';
  import CapabilityBadges from './CapabilityBadges.svelte';
  import { toast } from '$lib/stores/toast';
  import { copyText } from '$lib/utils/copy-link';
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
  }

  interface Props {
    app: LauncherApp;
    pinned?: boolean;
    recentLabel?: string;
    compact?: boolean;
    onInspect?: (app: LauncherApp) => void;
    onTogglePin?: (slug: string) => void;
  }

  let {
    app,
    pinned = false,
    recentLabel = '',
    compact = false,
    onInspect = undefined,
    onTogglePin = undefined,
  }: Props = $props();
  let copyState = $state<'idle' | 'copied' | 'error'>('idle');
  let launching = $state(false);
  let prewarmed = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const blurb = $derived(app.tagline ?? app.description ?? `${app.name} on Shippie`);
  const typeLabel = $derived(app.type.toLowerCase() === 'app' ? 'tool' : app.type);
  const launchHref = $derived(`/run/${encodeURIComponent(app.slug)}`);
  const proofCount = $derived((app.badges ?? []).filter((badge) => badge.proven).length);
  const offlineStatus = $derived($offlineStatuses[app.slug]);
  const isOffline = $derived($cachedSlugs.has(app.slug) || offlineStatus?.state === 'saved');
  const offlineLabel = $derived.by(() => {
    if (offlineStatus?.state === 'downloading') {
      return offlineStatus.total > 0 ? `${offlineStatus.done}/${offlineStatus.total}` : 'Saving';
    }
    if (isOffline) return 'Offline';
    if (pinned && (offlineStatus?.state === 'partial' || offlineStatus?.state === 'error')) return 'Refresh';
    if (pinned) return 'Keep ready';
    return '';
  });
  const offlineTone = $derived.by(() => {
    if (offlineStatus?.state === 'downloading') return 'saving';
    if (isOffline) return 'saved';
    if (offlineStatus?.state === 'partial' || offlineStatus?.state === 'error') return 'warn';
    return 'idle';
  });
  const localSignal = $derived.by(() => {
    if (app.kind === 'local') return 'Local data';
    if (app.kind === 'connected') return 'Local + live';
    if (app.kind === 'cloud') return 'Cloud';
    return 'Unchecked';
  });

  async function copyAppLink(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
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

  function inspect(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onInspect?.(app);
  }

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

<article class="launcher-card" class:compact class:launching aria-busy={launching}>
  <a
    class="launch-link"
    href={launchHref}
    onclick={launchAndRemember}
    onpointerenter={warmLaunch}
    onfocus={warmLaunch}
    ontouchstart={warmLaunch}
    data-sveltekit-preload-data="tap"
    data-sveltekit-preload-code="eager"
    aria-label={`Open ${app.name}`}
  >
    <div class="icon-wrap">
      <IconOrMonogram
        name={app.name}
        slug={app.slug}
        iconUrl={app.iconUrl}
        themeColor={app.themeColor}
        size={compact ? 52 : 64}
      />
    </div>
    <div class="copy">
      <div class="title-row">
        <h3>{app.name}</h3>
        {#if recentLabel}
          <span>{recentLabel}</span>
        {/if}
      </div>
      <p class="kind">{typeLabel} · {app.category}</p>
      <p class="blurb">{blurb}</p>
      <div class="signals">
        {#if app.kind}
          <KindBadge kind={app.kind} status={app.kindStatus} compact />
        {:else}
          <span class="signal">{localSignal}</span>
        {/if}
        {#if proofCount > 0}
          <span class="signal">{proofCount} proof{proofCount === 1 ? '' : 's'}</span>
        {/if}
        {#if offlineLabel}
          <span
            class="signal offline"
            class:offline-saved={offlineTone === 'saved'}
            class:offline-saving={offlineTone === 'saving'}
            class:offline-warn={offlineTone === 'warn'}
          >
            {offlineLabel}
          </span>
        {/if}
      </div>
      {#if !compact && (app.badges ?? []).length > 0}
        <div class="badges">
          <CapabilityBadges badges={app.badges ?? []} max={2} compact />
        </div>
      {/if}
      {#if launching}
        <p class="launching-label" aria-live="polite">Opening…</p>
      {/if}
    </div>
  </a>

  <div
    class="quick-actions"
    aria-label={`${app.name} actions`}
  >
    <button
      type="button"
      class:active={pinned}
      onclick={save}
      title={pinned ? 'Saved' : 'Save'}
      aria-label={pinned ? `Remove ${app.name} from saved tools` : `Save ${app.name}`}
      aria-pressed={pinned}
    >
      {pinned ? '★' : '☆'}
    </button>
    <button
      type="button"
      onclick={copyAppLink}
      class:copied={copyState === 'copied'}
      class:error={copyState === 'error'}
      title={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
      aria-label={`Copy link for ${app.name}`}
    >
      {copyState === 'copied' ? '✓' : copyState === 'error' ? '!' : '↗'}
    </button>
    <button
      type="button"
      onclick={inspect}
      title="Details"
      aria-label={`View details for ${app.name}`}
    >
      i
    </button>
  </div>
</article>

<style>
  .launcher-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    height: 100%;
    min-height: 176px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    box-sizing: border-box;
    transition:
      border-color 0.16s var(--ease-out),
      background 0.16s var(--ease-out),
      transform 0.18s var(--ease-out);
  }
  .launcher-card:hover {
    border-color: var(--sunset);
    background: var(--surface-alt);
    transform: translateY(-2px);
  }
  .launcher-card.launching {
    border-color: var(--sunset);
    background:
      linear-gradient(90deg, rgba(232, 96, 60, 0.1), transparent 42%),
      var(--surface-alt);
    transform: translateY(-1px);
  }
  .launcher-card.launching::after {
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
  .launcher-card.compact {
    min-height: 144px;
  }
  .launch-link {
    grid-column: 1;
    grid-row: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-md);
    min-height: inherit;
    padding: var(--space-lg);
    color: inherit;
    text-decoration: none;
  }
  .compact .launch-link {
    padding: var(--space-md);
  }
  .icon-wrap {
    padding-top: 0.1rem;
  }
  .copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    min-width: 0;
  }
  h3 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-heading);
    font-size: 1.14rem;
    line-height: 1.2;
  }
  .title-row span,
  .kind,
  .signal {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .title-row span {
    flex-shrink: 0;
    color: var(--sage-leaf);
  }
  .kind {
    margin: 0.4rem 0 0;
  }
  .blurb {
    margin: 0.55rem 0 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .signals {
    margin-top: auto;
    padding-top: 0.7rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .badges {
    margin-top: 0.45rem;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .launching-label {
    margin: 0.6rem 0 0;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sunset);
  }
  .signal {
    display: inline-flex;
    border: 1px solid var(--border-light);
    padding: 2px 7px;
  }
  .signal.offline {
    color: var(--text-light);
  }
  .signal.offline-saved {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.45);
    background: rgba(122, 154, 110, 0.08);
  }
  .signal.offline-saving {
    color: var(--sunset);
    border-color: rgba(232, 96, 60, 0.48);
    background: rgba(232, 96, 60, 0.08);
  }
  .signal.offline-warn {
    color: var(--marigold);
    border-color: rgba(226, 192, 104, 0.48);
    background: rgba(226, 192, 104, 0.08);
  }
  .quick-actions {
    grid-column: 2;
    grid-row: 1;
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
    padding: var(--space-sm);
    border-left: 1px solid var(--border);
    background: rgba(12, 11, 9, 0.18);
    touch-action: manipulation;
  }
  .quick-actions button {
    width: 34px;
    height: 34px;
    display: inline-grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--surface);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color 0.15s var(--ease-out),
      color 0.15s var(--ease-out),
      background 0.15s var(--ease-out);
  }
  .quick-actions button:hover,
  .quick-actions button.active,
  .quick-actions button.copied {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
    background: rgba(122, 154, 110, 0.08);
  }
  .quick-actions button.error {
    border-color: var(--sunset);
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  @media (max-width: 640px) {
    .launcher-card {
      grid-template-columns: 1fr;
    }
    .launch-link,
    .compact .launch-link {
      grid-template-columns: 1fr;
      padding-right: var(--space-md);
      padding-top: 4.25rem;
    }
    .quick-actions {
      position: absolute;
      top: var(--space-md);
      right: var(--space-md);
      flex-direction: row;
      gap: 6px;
      align-self: auto;
      padding: 0;
      border-left: 0;
      background: transparent;
    }
    .quick-actions button {
      width: 40px;
      height: 40px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .launcher-card,
    .launcher-card:hover,
    .launcher-card.launching {
      transform: none;
    }
    .launcher-card.launching::after {
      animation: none;
      transform: none;
    }
  }
</style>
