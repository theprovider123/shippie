<script lang="ts">
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<header class="header">
  <p class="eyebrow">
    <a href="/dashboard">Dashboard</a> · <a href="/dashboard/apps">apps</a> · {data.app.slug}
  </p>
  <div class="title">
    <span class="swatch" style:background={data.app.themeColor}></span>
    <h1>{data.app.name}</h1>
  </div>
  <p class="lede">{data.app.tagline ?? data.app.slug + '.shippie.app'}</p>
  <nav class="tabs">
    <a href={`/dashboard/apps/${data.app.slug}`} class:active={$page.url.pathname === `/dashboard/apps/${data.app.slug}`}>Overview</a>
    <a href={`/dashboard/apps/${data.app.slug}/access`} class:active={$page.url.pathname.endsWith('/access')}>Access</a>
    <a href={`/dashboard/apps/${data.app.slug}/analytics`} class:active={$page.url.pathname.endsWith('/analytics')}>Analytics</a>
  </nav>
</header>

{@render children()}

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8603C; margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  .eyebrow a:hover { text-decoration: underline; }
  .title { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
  .swatch { width: 24px; height: 24px; border-radius: 6px; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; margin: 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; margin: 0.25rem 0 0 0; }
  .tabs { display: flex; gap: 1rem; border-bottom: 1px solid #E5DDC8; margin-top: 1.5rem; }
  .tabs a {
    padding: 0.625rem 0.25rem;
    color: #8B847A;
    text-decoration: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-size: 14px;
    font-weight: 500;
  }
  .tabs a.active { color: #E8603C; border-bottom-color: #E8603C; }
  .tabs a:hover { color: #14120F; }
  @media (prefers-color-scheme: dark) {
    .tabs { border-color: #2A251E; }
    .tabs a:hover { color: #EDE4D3; }
  }
</style>
