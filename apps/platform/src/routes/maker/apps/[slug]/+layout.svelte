<script lang="ts" module>
  function statusPill(status: string | null): { label: string; cls: string } {
    switch (status) {
      case 'success':
        return { label: 'Live', cls: 'ok' };
      case 'building':
        return { label: 'Building', cls: 'warn' };
      case 'failed':
        return { label: 'Failed', cls: 'bad' };
      case 'needs_secrets':
        return { label: 'Needs secrets', cls: 'warn' };
      default:
        return { label: 'Draft', cls: 'muted' };
    }
  }
</script>

<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  import MakerShareSheet from '$components/maker/MakerShareSheet.svelte';
  import { isAppLive, publicUrlFor, shareStateFor } from '$lib/maker/share';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const live = $derived(isAppLive(data.app));
  const share = $derived(shareStateFor(data.app));
  const pill = $derived(statusPill(data.app.latestDeployStatus));
  let shareOpen = $state(false);
</script>

<header class="header">
  <div class="title-row">
    <div class="title">
      <span class="swatch" style:background={data.app.themeColor}></span>
      <div class="title-text">
        <h1>{data.app.name}</h1>
        <span class="pill pill-{pill.cls}">{pill.label}</span>
      </div>
    </div>
    <div class="title-actions">
      {#if live}
        <a class="action open" href={publicUrlFor(data.app.slug)} target="_blank" rel="noreferrer">Open</a>
      {/if}
      {#if share.kind === 'public'}
        <button class="action share" type="button" onclick={() => (shareOpen = true)}>Share</button>
      {:else if share.kind === 'invite'}
        <a class="action share" href={share.href}>Share</a>
      {:else}
        <button class="action share" type="button" disabled title={share.reason}>{share.reason}</button>
      {/if}
    </div>
  </div>
  <p class="lede">{data.app.tagline ?? data.app.slug + '.shippie.app'}</p>
  <nav class="tabs" aria-label="App sections">
    <a href={`/maker/apps/${data.app.slug}`} class:active={$page.url.pathname === `/maker/apps/${data.app.slug}`}>Overview</a>
    <a href={`/maker/apps/${data.app.slug}/feedback`} class:active={$page.url.pathname.endsWith('/feedback')}>Feedback</a>
    <a href={`/maker/apps/${data.app.slug}/access`} class:active={$page.url.pathname.endsWith('/access')}>Access</a>
    <a href={`/maker/apps/${data.app.slug}/profile`} class:active={$page.url.pathname.endsWith('/profile')}>Profile</a>
    <a href={`/maker/apps/${data.app.slug}/proof`} class:active={$page.url.pathname.endsWith('/proof')}>Proof</a>
  </nav>
</header>

{#if share.kind === 'public'}
  <MakerShareSheet
    open={shareOpen}
    url={share.url}
    title={`Share ${data.app.name}`}
    onClose={() => (shareOpen = false)}
  />
{/if}

{@render children()}

<style>
  .header { margin-bottom: 1rem; }
  .title-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
  }
  .title { min-width: 0; display: flex; align-items: center; gap: 0.75rem; }
  .swatch { width: 30px; height: 30px; flex-shrink: 0; border-radius: 0; }
  .title-text { min-width: 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(1.8rem, 5vw, 2.4rem); line-height: 1; margin: 0; letter-spacing: 0; }
  .pill {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    padding: 3px 8px;
    white-space: nowrap;
  }
  .pill-ok { background: rgba(46, 125, 91, 0.15); color: var(--success); }
  .pill-bad { background: rgba(180, 63, 42, 0.15); color: var(--danger); }
  .pill-warn { background: rgba(232, 96, 60, 0.15); color: var(--danger-hover); }
  .pill-muted { background: rgba(0, 0, 0, 0.06); color: var(--text-muted-warm); }
  .lede { color: var(--text-muted-warm); margin: 0.25rem 0 0 0; }
  .title-actions { display: inline-flex; gap: 0.5rem; }
  .action {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.9rem;
    border: 1px solid var(--paper-cream);
    color: var(--sunset);
    text-decoration: none;
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    background: transparent;
    cursor: pointer;
    border-radius: 0;
  }
  .action.share {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  .action:disabled {
    border-color: var(--paper-cream);
    background: transparent;
    color: var(--text-muted-warm);
    cursor: not-allowed;
  }
  .tabs { display: flex; gap: 0.35rem; border-bottom: 1px solid var(--paper-cream); margin-top: 1rem; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tabs::-webkit-scrollbar { height: 0; }
  .tabs a {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    padding: 0 0.55rem;
    color: var(--text-muted-warm);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-size: 14px;
    font-weight: 500;
  }
  .tabs a.active { color: var(--sunset); border-bottom-color: var(--sunset); }
  .tabs a:hover { color: var(--bg); }
  @media (max-width: 760px) {
    .header {
      margin-bottom: 1rem;
    }
    .title {
      align-items: flex-start;
      gap: 0.6rem;
    }
    .title-row {
      grid-template-columns: 1fr;
      gap: 0.65rem;
    }
    .title-actions {
      width: 100%;
    }
    .title-actions .action {
      flex: 1;
    }
    .swatch {
      width: 20px;
      height: 20px;
      margin-top: 0.15rem;
    }
    h1 {
      font-size: 1.85rem;
      line-height: 1.08;
    }
    .tabs {
      gap: 0.35rem;
      margin: 1rem -1rem 0;
      padding: 0 1rem;
      border-bottom: 0;
      scrollbar-width: none;
    }
    .tabs a {
      min-height: var(--touch-min, 44px);
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      padding: 0 0.8rem;
      border: 1px solid var(--paper-cream);
      color: var(--text-muted-warm);
      margin-bottom: 0;
      white-space: nowrap;
    }
    .tabs a.active {
      background: var(--sunset);
      border-color: var(--sunset);
      color: var(--paper-warm-deep);
    }
  }
  @media (prefers-color-scheme: dark) {
    .tabs { border-color: var(--ink-warm); }
    .action { border-color: var(--ink-warm); }
    .pill-muted { background: rgba(255, 255, 255, 0.06); }
    .tabs a:hover { color: var(--text); }
  }
  @media (prefers-color-scheme: dark) and (max-width: 760px) {
    .tabs a {
      border-color: var(--ink-warm);
    }
  }
</style>
