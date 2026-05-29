<script lang="ts">
  import IconOrMonogram from './IconOrMonogram.svelte';
  import CapabilityBadges from './CapabilityBadges.svelte';
  import { toast } from '$lib/stores/toast';
  import { copyText } from '$lib/utils/copy-link';
  import { recordAppLaunch, togglePinnedApp } from '$lib/stores/launcher-memory';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
    removeAppAndTrack,
  } from '$lib/stores/cached-slugs';
  import type { PublicCapabilityBadge } from '$server/marketplace/capability-badges';
  import type { AppKind, PublicKindStatus } from '$lib/types/app-kind';
  import { connectionBadgesFromKind } from '$lib/marketplace/connection-badges';

  interface InspectorApp {
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
    app: InspectorApp | null;
    pinned?: boolean;
    onClose?: () => void;
  }

  let { app, pinned = false, onClose = undefined }: Props = $props();
  let copyState = $state<'idle' | 'copied' | 'error'>('idle');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const blurb = $derived(app ? app.tagline ?? app.description ?? `${app.name} on Shippie` : '');
  const typeLabel = $derived(app ? (app.type.toLowerCase() === 'app' ? 'tool' : app.type) : '');
  const proofBadges = $derived((app?.badges ?? []).filter((badge) => badge.proven));
  const launchHref = $derived(app ? `/run/${encodeURIComponent(app.slug)}` : '/apps');
  const offlineStatus = $derived(app ? $offlineStatuses[app.slug] : undefined);
  const isOffline = $derived(Boolean(app && ($cachedSlugs.has(app.slug) || offlineStatus?.state === 'saved')));
  const isSaving = $derived(
    offlineStatus?.state === 'requested' ||
      offlineStatus?.state === 'downloading' ||
      offlineStatus?.state === 'verifying',
  );
  const isSaved = $derived(Boolean(app && isOffline));
  const connectionBadges = $derived(connectionBadgesFromKind(app?.kind));
  const offlineLabel = $derived.by(() => {
    if (!app) return '';
    if (
      offlineStatus?.state === 'requested' ||
      offlineStatus?.state === 'downloading' ||
      offlineStatus?.state === 'verifying'
    ) {
      if (offlineStatus.state === 'verifying') return 'Verifying capsule';
      return offlineStatus.total > 0
        ? `Saving ${offlineStatus.done}/${offlineStatus.total}`
        : 'Saving';
    }
    if (isOffline) return 'Ready offline';
    if (offlineStatus?.state === 'partial' || offlineStatus?.state === 'evicted') return 'Needs refresh';
    if (offlineStatus?.state === 'error') return 'Save failed';
    return 'Not saved on this device';
  });
  const dataLabel = $derived.by(() => {
    if (!app?.kind) return 'Not scanned yet';
    if (app.kind === 'local') return 'No external connections detected';
    if (app.kind === 'connected') return 'Uses external services';
    return 'Uses a creator-hosted service';
  });

  async function copyAppLink() {
    if (!app) return;
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

  function launchAndRemember() {
    if (!app) return;
    const launchCount = recordAppLaunch(app.slug);
    if (launchCount >= 2) {
      void ensureAppOffline(app.slug).catch(() => {});
    }
  }

  async function toggleSaved() {
    if (!app || isSaving) return;
    const currentlySaved = isSaved;
    const hasOfflineCopy =
      isOffline || offlineStatus?.state === 'partial' || offlineStatus?.state === 'error';

    try {
      if (currentlySaved) {
        if (pinned) togglePinnedApp(app.slug);
        if (hasOfflineCopy) await removeAppAndTrack(app.slug);
        toast.push({ kind: 'success', message: 'Removed from saved tools.' });
        return;
      }

      const result = await ensureAppOffline(app.slug);
      if (result.state === 'saved' && !pinned) togglePinnedApp(app.slug);
      toast.push(
        result.state === 'saved'
          ? { kind: 'success', message: 'Saved to your tools.' }
          : { kind: 'error', message: 'Saved, but offline copy needs a refresh.' },
      );
    } catch {
      toast.push({
        kind: 'error',
        message: currentlySaved ? 'Could not remove saved copy.' : 'Could not save this tool yet.',
      });
    }
  }
</script>

{#if app}
  <div class="scrim" role="presentation" onclick={onClose}></div>
  <aside class="inspector" aria-label={`${app.name} details`}>
    <header>
      <button type="button" class="close" onclick={onClose} aria-label="Close details">×</button>
      <IconOrMonogram
        name={app.name}
        slug={app.slug}
        iconUrl={app.iconUrl}
        themeColor={app.themeColor}
        size={72}
      />
      <div>
        <p class="eyebrow">{typeLabel} · {app.category}</p>
        <h2>{app.name}</h2>
        <p class="blurb">{blurb}</p>
      </div>
    </header>

    <div class="actions">
      <a href={launchHref} onclick={launchAndRemember}>Open</a>
      <button
        type="button"
        class:saved={isSaved}
        class:busy={isSaving}
        aria-pressed={isSaved}
        onclick={toggleSaved}
      >
        {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Save'}
      </button>
      <button type="button" class:copied={copyState === 'copied'} class:error={copyState === 'error'} onclick={copyAppLink}>
        {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
      </button>
      <a href={`/apps/${encodeURIComponent(app.slug)}`}>Page</a>
    </div>

    <dl class="facts">
      <div>
        <dt>Data</dt>
        <dd>{dataLabel}</dd>
      </div>
      <div>
        <dt>Opens</dt>
        <dd>{(app.installCount ?? 0).toLocaleString()} opens</dd>
      </div>
      <div>
        <dt>Offline</dt>
        <dd>{offlineLabel}</dd>
      </div>
      <div>
        <dt>Love</dt>
        <dd>{(app.upvoteCount ?? 0).toLocaleString()} upvotes</dd>
      </div>
      <div>
        <dt>Proof</dt>
        <dd>{proofBadges.length} earned</dd>
      </div>
      <div>
        <dt>Signed</dt>
        <dd>{app.firstPartySigned ? 'Shippie first-party' : 'Not first-party signed'}</dd>
      </div>
    </dl>

    <section>
      <h3>Connections</h3>
      {#if connectionBadges.length > 0}
        <div class="connection-list">
          {#each connectionBadges as badge (badge.label)}
            <span class="connection-pill connection-{badge.tone}" title={badge.title}>{badge.label}</span>
          {/each}
        </div>
      {:else if app.kind === 'local'}
        <p class="muted">No external connections detected.</p>
      {:else}
        <p class="muted">No connection profile yet.</p>
      {/if}
    </section>

    {#if (app.badges ?? []).length > 0}
      <section>
        <h3>Why special</h3>
        <CapabilityBadges badges={app.badges ?? []} max={6} />
      </section>
    {/if}
  </aside>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 210;
    background: rgba(10, 9, 7, 0.58);
    animation: scrim-in 0.16s var(--ease-out);
  }
  .inspector {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 211;
    width: min(440px, 100vw);
    overflow: auto;
    border-left: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    padding: var(--space-xl) var(--space-xl) calc(var(--space-xl) + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    animation: inspect-in 0.18s var(--ease-out);
  }
  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-md);
    align-items: start;
    padding-right: 2.5rem;
  }
  .close {
    position: absolute;
    top: var(--space-md);
    right: var(--space-md);
    width: var(--touch-min);
    height: var(--touch-min);
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    color: var(--text-light);
    cursor: pointer;
    font-size: 1.35rem;
    line-height: 1;
  }
  .close:hover {
    color: var(--sunset);
    border-color: var(--sunset);
  }
  .eyebrow,
  dt,
  h3 {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .eyebrow {
    margin: 0 0 0.35rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.65rem;
    line-height: 1.1;
  }
  .blurb {
    margin: 0.65rem 0 0;
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .actions a,
  .actions button {
    min-width: 0;
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    cursor: pointer;
  }
  .actions a:first-child {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg-pure);
  }
  .actions a:hover,
  .actions button:hover {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
  }
  .actions button.copied {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
    background: rgba(122, 154, 110, 0.08);
  }
  .actions button.saved {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
    background: rgba(122, 154, 110, 0.08);
  }
  .actions button.busy {
    border-color: var(--sunset);
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
    cursor: wait;
  }
  .actions button.error {
    border-color: var(--sunset);
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--border);
    border-left: 1px solid var(--border);
  }
  .facts div {
    min-width: 0;
    padding: var(--space-md);
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  dt {
    margin-bottom: 0.35rem;
  }
  dd {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.45;
  }
  section {
    display: grid;
    gap: 0.75rem;
  }
  h3 {
    margin: 0;
  }
  .muted {
    color: var(--text-light);
    margin: 0;
  }
  .connection-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .connection-pill {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border: 1px solid rgba(232, 96, 60, 0.45);
    color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
    padding: 0 9px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .connection-pill.connection-ai {
    color: #7c5cc4;
    border-color: rgba(124, 92, 196, 0.42);
    background: rgba(124, 92, 196, 0.08);
  }
  .connection-pill.connection-weather,
  .connection-pill.connection-location {
    color: var(--sage-leaf);
    border-color: rgba(122, 154, 110, 0.4);
    background: rgba(122, 154, 110, 0.08);
  }
  .connection-pill.connection-payment {
    color: var(--marigold);
    border-color: rgba(232, 197, 71, 0.42);
    background: rgba(232, 197, 71, 0.08);
  }
  @keyframes inspect-in {
    from { transform: translateX(16px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes scrim-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @media (max-width: 640px) {
    .inspector {
      padding: var(--space-lg) var(--space-lg) calc(var(--space-lg) + var(--safe-bottom));
    }
    .actions,
    .facts {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .inspector,
    .scrim {
      animation: none;
    }
  }
</style>
