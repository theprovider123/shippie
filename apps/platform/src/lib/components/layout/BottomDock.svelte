<script lang="ts">
  import { page } from '$app/stores';
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  function isHome(pathname: string): boolean {
    return pathname === '/'
      || pathname.startsWith('/apps')
      || pathname === '/arcade'
      || pathname === '/leaderboards'
      || pathname === '/glance'
      || pathname === '/today'
      || pathname === '/whitepaper';
  }

  function isDocs(pathname: string): boolean {
    return pathname === '/docs'
      || pathname.startsWith('/docs/')
      || pathname === '/build'
      || pathname === '/why'
      || pathname === '/professionals'
      || pathname === '/labs';
  }

  function isYou(pathname: string): boolean {
    return pathname === '/you';
  }
</script>

<nav class="bottom-dock" aria-label="Primary">
  <a href="/" class:active={isHome($page.url.pathname)} aria-current={isHome($page.url.pathname) ? 'page' : undefined}>
    <span aria-hidden="true">◐</span>
    <strong>Home</strong>
  </a>
  <a href="/docs" class:active={isDocs($page.url.pathname)} aria-current={isDocs($page.url.pathname) ? 'page' : undefined}>
    <span aria-hidden="true">▤</span>
    <strong>Docs</strong>
  </a>
  <a href="/new" class:active={$page.url.pathname === '/new'} aria-current={$page.url.pathname === '/new' ? 'page' : undefined}>
    <span aria-hidden="true">+</span>
    <strong>Ship</strong>
  </a>
  <a
    href="/you"
    class:active={isYou($page.url.pathname)}
    aria-current={isYou($page.url.pathname) ? 'page' : undefined}
    aria-label={user ? 'Open your Shippie profile' : 'Open your local Shippie data'}
  >
    <span aria-hidden="true">◌</span>
    <strong>You</strong>
  </a>
</nav>

<style>
  .bottom-dock {
    position: fixed;
    left: calc(12px + var(--safe-left));
    right: calc(12px + var(--safe-right));
    bottom: calc(10px + var(--safe-bottom));
    z-index: 120;
    display: none;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    min-height: 64px;
    padding: 6px;
    border: 1px solid rgba(237, 228, 211, 0.14);
    background: rgba(20, 18, 15, 0.9);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.36);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  :global([data-theme='light']) .bottom-dock {
    border-color: rgba(44, 31, 20, 0.14);
    background: rgba(245, 239, 228, 0.92);
    box-shadow: 0 18px 60px rgba(44, 31, 20, 0.18);
  }

  .bottom-dock a {
    display: grid;
    place-items: center;
    gap: 3px;
    min-width: 0;
    min-height: var(--touch-min);
    color: var(--text-secondary);
    text-decoration: none;
  }

  .bottom-dock a span {
    display: grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    font-family: var(--font-mono);
    font-size: 18px;
    line-height: 1;
  }

  .bottom-dock a strong {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .bottom-dock a.active {
    color: var(--text);
    background: rgba(232, 96, 60, 0.14);
  }

  .bottom-dock a.active span {
    color: var(--sunset);
  }

  .bottom-dock a:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }

  @media (max-width: 640px), (display-mode: standalone) {
    .bottom-dock {
      display: grid;
    }
  }
</style>
