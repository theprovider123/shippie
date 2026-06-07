<script lang="ts">
  import { goto } from '$app/navigation';

  interface Props {
    user: { isAdmin?: boolean } | null | undefined;
    section?: string;
    /** Accepted for API compatibility (the dock passes it); the rail no longer
     *  renders a dedicated switcher row — the launchpad grid + ⌘K cover it. */
    railToolCount?: number;
    onOpenSwitcher?: () => void;
    /** Dock-only callbacks. Omitted on /tools and /you, where Access/Create
     *  don't apply, so those rows simply don't render off-dock. */
    onShowSection?: (s: 'access' | 'create') => void;
    /** Highlights the current top-level surface. null = Dock. */
    current?: 'browse' | 'you' | 'maker' | null;
  }

  const {
    user,
    section = '',
    onShowSection,
    current = null,
  }: Props = $props();

  // Dock is the home surface — active whenever we're not on Tools, You, or Maker.
  const dockActive = $derived(current !== 'browse' && current !== 'you' && current !== 'maker');

  function showSection(sectionId: 'access' | 'create') {
    if (onShowSection) {
      onShowSection(sectionId);
      return;
    }
    void goto('/dock');
  }
</script>

<!--
  One rail, one rhythm. A fixed icon column on the left; labels fade in on
  hover/focus with zero reflow (icons never move). Three primary destinations —
  Dock · Tools · You — then a quiet utility group pinned to the bottom.
-->
<aside class="dock-rail">
  <div class="rail-inner">
    <nav class="rail-nav" aria-label="Primary">
      <a class="rail-item" class:current={dockActive} href="/dock" title="Dock" aria-label="Dock">
        <span class="rail-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="11" height="11" rx="1.5"/><path d="M9 20h11V9"/></svg>
        </span>
        <span class="label">Dock</span>
      </a>

      <a class="rail-item" class:current={current === 'browse'} href="/tools" title="Tools" aria-label="Tools">
        <span class="rail-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </span>
        <span class="label">Tools</span>
      </a>

      <a class="rail-item" class:current={current === 'you'} href="/you" title="You" aria-label="You">
        <span class="rail-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        </span>
        <span class="label">You</span>
      </a>
    </nav>

    <div class="rail-divider" aria-hidden="true"></div>

    <nav class="rail-nav rail-secondary" aria-label="More">
      {#if onShowSection}
        <button class="rail-item" class:active={section === 'create'} title="Create" aria-label="Create" onclick={() => showSection('create')}>
          <span class="rail-ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 9v6M9 12h6"/></svg>
          </span>
          <span class="label">Create</span>
        </button>

        <button class="rail-item" class:active={section === 'access'} title="Access" aria-label="Access" onclick={() => showSection('access')}>
          <span class="rail-ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/></svg>
          </span>
          <span class="label">Access</span>
        </button>
      {/if}

      <a
        class="rail-item"
        class:current={current === 'maker'}
        href={user ? '/maker' : '/auth/login?return_to=%2Fmaker'}
        title={user ? 'Maker' : 'Sign in to ship'}
        aria-label={user ? 'Maker' : 'Sign in to ship'}
      >
        <span class="rail-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
        </span>
        <span class="label">{user ? 'Maker' : 'Sign in to ship'}</span>
      </a>

      {#if user?.isAdmin}
        <a class="rail-item" href="/admin" title="Admin" aria-label="Admin">
          <span class="rail-ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg>
          </span>
          <span class="label">Admin</span>
        </a>
      {/if}
    </nav>
  </div>
</aside>

<style>
  .dock-rail {
    position: relative;
    width: 64px;
    flex: none;
  }

  /* Expands by overlay — never reflows the page or its own contents. */
  .rail-inner {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: 64px;
    overflow: hidden;
    background: var(--bg);
    border-right: 1px solid var(--border-light);
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding:
      calc(16px + var(--safe-top))
      11px
      calc(16px + var(--safe-bottom));
    transition: width 0.2s ease;
  }

  .dock-rail:hover .rail-inner,
  .dock-rail:focus-within .rail-inner {
    width: 232px;
    /* match the shell's push delay so rail + content move together */
    transition-delay: 0.12s;
  }

  /* Every row shares one shape: fixed icon box on the left, label after it.
     The icon column never moves between states — only the label reveals. */
  .rail-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    background: none;
    color: var(--text-secondary);
    text-decoration: none;
    cursor: pointer;
    font: inherit;
  }

  .rail-ico {
    flex: none;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
  }

  /* Labels live in layout but stay clipped + transparent until expanded —
     so they reveal in place with zero movement of the icons. */
  .label {
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.14s ease;
    pointer-events: none;
  }

  .dock-rail:hover .label,
  .dock-rail:focus-within .label {
    opacity: 1;
    pointer-events: auto;
  }

  /* One hover/active treatment for every row. */
  .rail-item:hover {
    color: var(--text);
    border-color: var(--border-light);
    background: var(--surface);
  }

  .rail-item.active,
  .rail-item.current {
    color: var(--sunset);
    border-color: var(--border-light);
    background: var(--surface);
  }

  .rail-item:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }

  .rail-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Quiet utility group, pinned to the bottom. */
  .rail-divider {
    height: 1px;
    background: var(--border-light);
    margin: 10px 8px;
    margin-top: auto;
  }

  .rail-secondary .rail-item {
    height: 40px;
    color: var(--text-light);
  }

  .rail-secondary .rail-item :global(svg) {
    width: 16px;
    height: 16px;
  }

  .rail-secondary .rail-item:hover {
    color: var(--text);
  }

  /* Coarse pointer (touch/tablet): always expanded, labels always shown —
     never mystery-meat icon-only. */
  @media (pointer: coarse) {
    .rail-inner {
      width: 232px;
    }

    .label {
      opacity: 1;
      pointer-events: auto;
    }
  }

  /* Mobile: hide the rail entirely (BottomDock takes over). */
  @media (max-width: 640px) {
    .dock-rail {
      display: none;
    }
  }
</style>
