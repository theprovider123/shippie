<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<header class="header">
  <div class="title-row">
    <div class="title">
      <span class="swatch" style:background={data.app.themeColor}></span>
      <div>
        <p class="eyebrow">
          <a href="/maker">Maker</a> · <a href="/maker/apps">apps</a>
        </p>
        <h1>{data.app.name}</h1>
      </div>
    </div>
    <a class="open-link" href={`https://${data.app.slug}.shippie.app/`} target="_blank" rel="noreferrer">Open</a>
  </div>
  <p class="lede">{data.app.tagline ?? data.app.slug + '.shippie.app'}</p>
  <nav class="tabs" aria-label="App sections">
    <a href={`/maker/apps/${data.app.slug}`} class:active={$page.url.pathname === `/dashboard/apps/${data.app.slug}` || $page.url.pathname === `/maker/apps/${data.app.slug}`}>Overview</a>
    <a href={`/maker/apps/${data.app.slug}/feedback`} class:active={$page.url.pathname.endsWith('/feedback')}>Feedback</a>
    <a href={`/maker/apps/${data.app.slug}/analytics`} class:active={$page.url.pathname.endsWith('/analytics')}>Analytics</a>
    <a href={`/maker/apps/${data.app.slug}/access`} class:active={$page.url.pathname.endsWith('/access')}>Access</a>
    <a href={`/maker/apps/${data.app.slug}/profile`} class:active={$page.url.pathname.endsWith('/profile')}>Profile</a>
    <a href={`/maker/apps/${data.app.slug}/proof`} class:active={$page.url.pathname.endsWith('/proof')}>Proof</a>
  </nav>
</header>

{@render children()}

<style>
  .header { margin-bottom: 1rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  .eyebrow a:hover { text-decoration: underline; }
  .title-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
  }
  .title { min-width: 0; display: flex; align-items: center; gap: 0.75rem; }
  .swatch { width: 30px; height: 30px; flex-shrink: 0; border-radius: 0; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(1.8rem, 5vw, 2.4rem); line-height: 1; margin: 0; letter-spacing: 0; }
  .lede { color: var(--text-muted-warm); margin: 0.25rem 0 0 0; }
  .open-link {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.9rem;
    border: 1px solid var(--paper-cream);
    color: var(--sunset);
    text-decoration: none;
    font-weight: 700;
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
    .open-link {
      width: 100%;
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
    .open-link { border-color: var(--ink-warm); }
    .tabs a:hover { color: var(--text); }
  }
  @media (prefers-color-scheme: dark) and (max-width: 760px) {
    .tabs a {
      border-color: var(--ink-warm);
    }
  }
</style>
