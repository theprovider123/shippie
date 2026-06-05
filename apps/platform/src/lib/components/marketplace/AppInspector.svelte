<script lang="ts">
  /**
   * AppInspector — tool details. Renders inside the canonical Sheet
   * primitive (bottom sheet on mobile, centered modal on tablet+), so it
   * inherits focus-trap, aria-modal, Escape, swipe-down, browser-back
   * dismiss, and reference-counted scroll-lock instead of rolling its own
   * (it used to duplicate ~140 lines of scrim/drag/lock with no a11y).
   */
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import IconOrMonogram from './IconOrMonogram.svelte';
  import CapabilityBadges from './CapabilityBadges.svelte';
  import { toast } from '$lib/stores/toast';
  import { copyText } from '$lib/utils/copy-link';
  import { recordAppLaunch, saveAppToDock } from '$lib/stores/launcher-memory';
  import {
    cachedSlugs,
    ensureAppOffline,
    offlineStatuses,
  } from '$lib/stores/cached-slugs';
  import { describeOfflineHealth } from '$lib/offline/download-app';
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
  const offlineHealth = $derived(app ? describeOfflineHealth(offlineStatus, { cached: $cachedSlugs.has(app.slug), online: typeof navigator === 'undefined' ? true : navigator.onLine }) : null);
  const isSaving = $derived(
    offlineStatus?.state === 'requested' ||
      offlineStatus?.state === 'downloading' ||
      offlineStatus?.state === 'verifying',
  );
  const isSaved = $derived(Boolean(app && (pinned || isOffline)));
  const connectionBadges = $derived(connectionBadgesFromKind(app?.kind));
  const offlineLabel = $derived.by(() => {
    if (!app || !offlineHealth) return '';
    return offlineHealth.label;
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
    if (isSaved && isOffline) {
      toast.push({ kind: 'info', message: `${app.name} is already saved to Dock and available offline.` });
      return;
    }
    try {
      if (!pinned) {
        saveAppToDock(app.slug);
        toast.push({ kind: 'info', message: `Saving ${app.name} to Dock...` });
      }
      const result = await ensureAppOffline(app.slug);
      toast.push(
        result.state === 'saved'
          ? { kind: 'success', message: `${app.name} saved to Dock - available offline.` }
          : { kind: 'error', message: `${app.name} is in Dock, but the offline copy needs a refresh.` },
      );
    } catch {
      toast.push({
        kind: 'error',
        message: `${app.name} is in Dock, but could not finish the offline copy yet.`,
      });
    }
  }

  function closeInspector() {
    onClose?.();
  }
</script>

<Sheet open={!!app} onClose={closeInspector} label={app ? `${app.name} details` : 'Tool details'}>
  {#if app}
    <header class="inspector-header">
      <button type="button" class="close" onclick={closeInspector} aria-label="Close details">×</button>
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
  {/if}
</Sheet>

<style>
  .inspector-header {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-md);
    align-items: start;
    padding-right: 2.5rem;
  }
  .close {
    position: absolute;
    top: 0;
    right: 0;
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
    color: var(--accent-violet);
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
  @media (max-width: 640px) {
    .actions,
    .facts {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
