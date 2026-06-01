<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { switcherOpen } from '$lib/stores/switcher';
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  // Phase 4 mobile dock: Today · Tools · You. Today = the workspace home;
  // Tools opens the switcher sheet (on /workspace or /run; elsewhere it
  // navigates there first and the sheet opens on arrival via the store);
  // You holds account / settings / docs / ship.
  function isToday(pathname: string): boolean {
    return pathname === '/' || pathname === '/workspace' || pathname.startsWith('/run');
  }

  function isYou(pathname: string): boolean {
    return pathname === '/you';
  }

  function openTools() {
    switcherOpen.set(true);
    const p = $page.url.pathname;
    if (!p.startsWith('/workspace') && !p.startsWith('/run')) void goto('/workspace');
  }
</script>

<nav class="bottom-dock" aria-label="Primary">
  <a href="/workspace" class:active={isToday($page.url.pathname)} aria-current={isToday($page.url.pathname) ? 'page' : undefined}>
    <span aria-hidden="true">◐</span>
    <strong>Today</strong>
  </a>
  <button type="button" class="dock-btn" onclick={openTools}>
    <span aria-hidden="true">▦</span>
    <strong>Tools</strong>
  </button>
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

  .bottom-dock a,
  .bottom-dock .dock-btn {
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

  .bottom-dock a span,
  .bottom-dock .dock-btn span {
    display: grid;
    place-items: center;
    min-inline-size: var(--touch-min);
    font-family: var(--font-mono);
    font-size: 17px;
    line-height: 1;
  }

  .bottom-dock a strong,
  .bottom-dock .dock-btn strong {
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

  .bottom-dock a:focus-visible,
  .bottom-dock .dock-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }

  @media (max-width: 640px), (display-mode: standalone) {
    .bottom-dock {
      display: grid;
    }
  }
</style>
