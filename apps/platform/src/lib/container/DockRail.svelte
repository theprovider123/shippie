<script lang="ts">
  interface Props {
    section: string;
    user: { isAdmin?: boolean } | null | undefined;
    railToolCount: number;
    onShowSection: (s: 'access' | 'create') => void;
    onOpenSwitcher: () => void;
  }

  const { section, user, railToolCount, onShowSection, onOpenSwitcher }: Props = $props();
</script>

<aside class="dock-rail">
  <div class="rail-inner">
    <div class="rail-head">
      <span class="rail-mark" aria-hidden="true">⌘</span>
      <span class="wordmark label">Dock</span>
      <nav class="rail-quick" aria-label="Quick actions">
        <a class="rail-quick-btn" href="/tools" title="Add tools" aria-label="Add tools">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </a>
        <a class="rail-quick-btn" href="/tools" title="Browse tools" aria-label="Browse tools">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </a>
        <a class="rail-quick-btn" href="/you" title="You" aria-label="You">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </a>
        <button
          class="rail-quick-btn"
          class:active={section === 'access'}
          title="Access"
          aria-label="Access"
          onclick={() => onShowSection('access')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/></svg>
        </button>
        <a
          class="rail-quick-btn"
          href={user ? '/maker' : '/auth/login?return_to=%2Fmaker'}
          title="Maker"
          aria-label="Maker"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
        </a>
        {#if user?.isAdmin}
          <a class="rail-quick-btn" href="/admin" title="Admin" aria-label="Admin">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg>
          </a>
        {/if}
      </nav>
    </div>

    <button
      type="button"
      class="rail-switcher"
      onclick={onOpenSwitcher}
      aria-label={railToolCount > 0 ? `Open Dock switcher with ${railToolCount} tools` : 'Open Dock switcher'}
    >
      <span class="switcher-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="11" height="11" rx="1.5"/><path d="M9 20h11V9"/></svg>
      </span>
      <span class="switcher-text">
        <strong class="label">Switcher</strong>
        <small class="label">{railToolCount > 0 ? `${railToolCount} tools ready` : 'No tools yet'}</small>
      </span>
      <span aria-hidden="true" class="label">⌘K</span>
    </button>

    <nav class="rail-foot" aria-label="Dock sections">
      <a class="foot-item" href="/tools"><span class="label">＋ Browse tools</span></a>
      <a class="foot-item" href="/you"><span class="label">You</span></a>
      <button class="foot-item" class:active={section === 'access'} onclick={() => onShowSection('access')}>
        <span class="label">Access</span>
      </button>
      <button class="foot-item" class:active={section === 'create'} onclick={() => onShowSection('create')}>
        <span class="label">Create</span>
      </button>
      <a class="foot-item" href={user ? '/maker' : '/auth/login?return_to=%2Fmaker'}>
        <span class="label">{user ? 'Maker' : 'Sign in to ship'}</span>
      </a>
      {#if user?.isAdmin}
        <a class="foot-item" href="/admin"><span class="label">Admin</span></a>
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
    gap: 0;
    padding:
      calc(18px + var(--safe-top))
      12px
      calc(18px + var(--safe-bottom));
    transition: width 0.18s ease;
  }

  /* Expand on hover/focus-within — overlay approach, no reflow */
  .dock-rail:hover .rail-inner,
  .dock-rail:focus-within .rail-inner {
    width: 216px;
  }

  /* Show labels only when expanded */
  .label {
    display: none;
    white-space: nowrap;
  }

  .dock-rail:hover .label,
  .dock-rail:focus-within .label {
    display: inline;
  }

  .dock-rail:hover .switcher-text,
  .dock-rail:focus-within .switcher-text {
    display: grid;
  }

  .dock-rail:hover .switcher-icon,
  .dock-rail:focus-within .switcher-icon {
    display: none;
  }

  /* Rail head */
  /* Collapsed: centered vertical stack. Expanded: horizontal head row. */
  .rail-head {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .dock-rail:hover .rail-head,
  .dock-rail:focus-within .rail-head {
    flex-direction: row;
  }

  .rail-mark {
    color: var(--sunset);
    flex: none;
  }

  /* Quick actions — centered column when collapsed */
  .rail-quick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  /* When expanded, lay quick actions horizontally and push them right */
  .dock-rail:hover .rail-quick,
  .dock-rail:focus-within .rail-quick {
    flex-direction: row;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .rail-quick-btn {
    display: inline-grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    background: none;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.92rem;
    text-decoration: none;
    cursor: pointer;
  }

  .rail-quick-btn:hover {
    color: var(--text);
    border-color: var(--border-light);
    background: var(--surface);
  }

  .rail-quick-btn.active {
    color: var(--sunset);
    border-color: var(--border-light);
    background: var(--surface);
  }

  .rail-quick-btn:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }

  /* Switcher button */
  .rail-switcher {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 58px;
    margin: 0.35rem 0 1rem;
    padding: 0.62rem 0.7rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
  }

  .rail-switcher:hover {
    border-color: var(--border);
    background: var(--surface-alt);
  }

  .rail-switcher:focus-visible {
    outline: 2px solid var(--sunset);
    outline-offset: -2px;
  }

  .switcher-text {
    min-width: 0;
    display: none;
    gap: 2px;
  }

  .switcher-icon {
    display: grid;
    place-items: center;
    margin: 0 auto;
  }

  .rail-switcher strong {
    font-family: var(--font-heading);
    font-size: 0.88rem;
    line-height: 1.1;
  }

  .rail-switcher small,
  .rail-switcher span:last-child {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.04em;
  }

  .rail-switcher span:last-child {
    flex: none;
    padding: 0.12rem 0.28rem;
    border: 1px solid var(--border-light);
    background: var(--bg);
  }

  /* Foot nav */
  .rail-foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-sm);
    overflow: hidden;
  }

  .foot-item {
    min-height: var(--touch-min);
    display: flex;
    align-items: center;
    font-size: 0.74rem;
    color: var(--text-secondary);
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
    padding: 0.18rem 0;
  }

  .foot-item.active,
  .foot-item:hover {
    color: var(--text);
  }

  /* Coarse pointer (touch/tablet): always show labels — never mystery-meat icon-only */
  @media (pointer: coarse) {
    .rail-inner {
      width: 216px;
    }

    .dock-rail .label,
    .dock-rail .wordmark {
      display: inline;
    }

    .switcher-text {
      display: grid;
    }

    .switcher-icon {
      display: none;
    }

    .rail-head {
      flex-direction: row;
    }

    .rail-quick {
      flex-direction: row;
      flex-wrap: wrap;
      margin-left: auto;
    }
  }

  /* Mobile: hide the rail entirely */
  @media (max-width: 640px) {
    .dock-rail {
      display: none;
    }
  }
</style>
