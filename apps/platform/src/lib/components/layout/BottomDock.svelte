<script lang="ts">
  import { page } from '$app/stores';
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  function isHome(pathname: string): boolean {
    return pathname === '/'
      || pathname === '/container'
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
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 120;
    display: none;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    min-height: calc(56px + var(--safe-bottom));
    padding:
      3px
      max(8px, calc(8px + var(--safe-right)))
      calc(4px + var(--safe-bottom))
      max(8px, calc(8px + var(--safe-left)));
    border-top: 1px solid rgba(237, 228, 211, 0.12);
    background: rgba(20, 18, 15, 0.9);
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  :global([data-theme='light']) .bottom-dock {
    border-color: rgba(44, 31, 20, 0.12);
    background: rgba(245, 239, 228, 0.9);
    box-shadow: 0 -8px 28px rgba(44, 31, 20, 0.1);
  }

  .bottom-dock a {
    position: relative;
    display: grid;
    place-items: center;
    gap: 2px;
    min-width: 0;
    min-height: var(--touch-min);
    padding-top: 2px;
    color: var(--text-secondary);
    text-decoration: none;
    box-shadow: inset 0 2px 0 transparent;
    transition:
      color 0.15s var(--ease-out, ease),
      background 0.15s var(--ease-out, ease),
      box-shadow 0.15s var(--ease-out, ease);
  }

  .bottom-dock a span {
    display: grid;
    place-items: center;
    min-inline-size: var(--touch-min);
    font-family: var(--font-mono);
    font-size: 17px;
    line-height: 1;
  }

  .bottom-dock a strong {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .bottom-dock a.active {
    color: var(--text);
    background: transparent;
    box-shadow: inset 0 2px 0 var(--sunset);
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
