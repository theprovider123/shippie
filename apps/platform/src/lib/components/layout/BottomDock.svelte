<script lang="ts">
  import { page } from '$app/stores';
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  // Mobile Dock contract: Dock · Tools · You. Dock = local tools home;
  // Tools is the stable discovery/search page; transient switching stays
  // in the switcher drawer inside Dock/tool mode.
  function isDock(pathname: string): boolean {
    return pathname === '/' || pathname === '/dock' || pathname.startsWith('/run');
  }

  function isTools(pathname: string): boolean {
    return pathname === '/tools' || pathname.startsWith('/apps/');
  }

  function isYou(pathname: string): boolean {
    return pathname === '/you';
  }
</script>

<nav class="bottom-dock" aria-label="Primary">
  <a href="/dock" class:active={isDock($page.url.pathname)} aria-current={isDock($page.url.pathname) ? 'page' : undefined}>
    <span aria-hidden="true">◐</span>
    <strong>Dock</strong>
  </a>
  <a href="/tools" class:active={isTools($page.url.pathname)} aria-current={isTools($page.url.pathname) ? 'page' : undefined}>
    <span aria-hidden="true">▦</span>
    <strong>Tools</strong>
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
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
