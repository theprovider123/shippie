<script lang="ts">
  import { page } from '$app/stores';
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  let mobileOpen = $state(false);

  const docsPaths = new Set(['/docs', '/build', '/why', '/professionals', '/labs']);

  function isHomePath(pathname: string): boolean {
    return pathname === '/'
      || pathname.startsWith('/apps')
      || pathname === '/arcade'
      || pathname === '/leaderboards'
      || pathname === '/glance'
      || pathname === '/today'
      || pathname === '/whitepaper';
  }

  function isDocsPath(pathname: string): boolean {
    return docsPaths.has(pathname) || pathname.startsWith('/docs/');
  }
</script>

<nav class="navbar" aria-label="Primary">
  <div class="nav-inner">
    <div class="nav-left">
      <a href="/" class="nav-logo">
        <img
          src="/__shippie-pwa/icon.svg"
          alt=""
          width="26"
          height="26"
          class="nav-mark"
          aria-hidden="true"
        />
        <span class="nav-wordmark">shippie</span>
      </a>
    </div>

    <div class="nav-center">
      <a href="/" class="nav-link" class:active={isHomePath($page.url.pathname)} aria-current={isHomePath($page.url.pathname) ? 'page' : undefined}>Home</a>
      <a href="/docs" class="nav-link" class:active={isDocsPath($page.url.pathname)} aria-current={isDocsPath($page.url.pathname) ? 'page' : undefined}>Docs</a>
    </div>

    <div class="nav-right">
      {#if user}
        <a href="/you" class="nav-user" class:active={$page.url.pathname === '/you'} aria-label="Open your Shippie profile">
          {#if user.avatarUrl}
            <img src={user.avatarUrl} alt="" width="28" height="28" />
          {:else}
            <span class="nav-user-monogram">
              {(user.displayName ?? user.username ?? user.email)[0]?.toUpperCase()}
            </span>
          {/if}
        </a>
      {:else}
        <a href="/you" class="nav-signin" class:active={$page.url.pathname === '/you'}>You</a>
      {/if}
      <a href="/new" class="nav-cta">Ship</a>
      <button
        type="button"
        class="nav-toggle"
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        aria-label="Open menu"
        onclick={() => (mobileOpen = !mobileOpen)}
      >
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>

  {#if mobileOpen}
    <div id="mobile-menu" class="mobile-menu">
      <a href="/" onclick={() => (mobileOpen = false)}>Home</a>
      <a href="/docs" onclick={() => (mobileOpen = false)}>Docs</a>
      {#if user}
        <a href="/you" onclick={() => (mobileOpen = false)}>You</a>
        <a href="/dashboard" onclick={() => (mobileOpen = false)}>Dashboard</a>
        {#if user.isAdmin}
          <a href="/admin" onclick={() => (mobileOpen = false)}>Admin</a>
        {/if}
      {:else}
        <a href="/you" onclick={() => (mobileOpen = false)}>You</a>
      {/if}
      <a href="/new" class="mobile-cta" onclick={() => (mobileOpen = false)}>Ship an app</a>
    </div>
  {/if}
</nav>

<style>
  .navbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    height: calc(var(--nav-height) + var(--safe-top));
    padding-top: var(--safe-top);
    background: rgba(20, 18, 15, 0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(61, 53, 48, 0.3);
  }
  :global([data-theme='light']) .navbar {
    background: rgba(245, 239, 228, 0.85);
    border-bottom: 1px solid rgba(201, 185, 154, 0.3);
  }
  .nav-inner {
    height: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 clamp(1.5rem, 4vw, 3rem);
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 2rem;
    align-items: center;
  }
  .nav-left { justify-self: start; }
  .nav-center {
    display: none;
    gap: 1.75rem;
    justify-self: center;
  }
  .nav-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-self: end;
  }
  .nav-logo {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
  }
  .nav-mark { display: block; flex-shrink: 0; }
  .nav-wordmark {
    font-family: var(--font-heading);
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .nav-link {
    font-size: var(--small-size);
    color: var(--text-secondary);
    transition: color 0.2s;
    white-space: nowrap;
  }
  .nav-link:hover,
  .nav-link.active {
    color: var(--text);
  }
  .nav-link.active {
    text-decoration: underline;
    text-decoration-color: var(--sunset);
    text-decoration-thickness: 2px;
    text-underline-offset: 6px;
  }
  .nav-signin {
    font-size: var(--small-size);
    color: var(--text-light);
  }
  .nav-signin:hover { color: var(--text-secondary); }
  .nav-signin.active {
    color: var(--text);
    text-decoration: underline;
    text-decoration-color: var(--sunset);
    text-decoration-thickness: 2px;
    text-underline-offset: 6px;
  }
  .nav-cta {
    display: none;
    padding: 0.5rem 1.125rem;
    background: var(--sunset);
    color: var(--bg-pure);
    font-size: var(--small-size);
    font-weight: 600;
    border-radius: 0;
    transition: background 0.2s;
  }
  .nav-cta:hover { background: var(--sunset-hover); }
  .nav-user {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-min);
    height: var(--touch-min);
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-alt);
  }
  .nav-user.active {
    box-shadow: 0 0 0 2px var(--sunset);
  }
  .nav-user img { width: 100%; height: 100%; object-fit: cover; }
  .nav-user-monogram {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--text);
  }
  .nav-toggle {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: var(--touch-min);
    height: var(--touch-min);
    background: none;
    border: 1px solid transparent;
    border-radius: 0;
    cursor: pointer;
    padding: 0 8px;
  }
  .nav-toggle span {
    display: block;
    width: 100%;
    height: 1.5px;
    background: var(--text);
  }
  .mobile-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg);
    border-bottom: 1px solid var(--border-light);
    padding: var(--space-md) clamp(1.5rem, 4vw, 3rem);
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .mobile-menu a {
    padding: 14px 0;
    font-family: var(--font-heading);
    font-size: 18px;
    color: var(--text);
    border-bottom: 1px solid var(--border-light);
  }
  .mobile-menu a:last-child { border-bottom: none; }
  .mobile-cta {
    margin-top: 12px !important;
    padding: 14px !important;
    background: var(--sunset);
    color: var(--bg-pure) !important;
    border-radius: 0;
    text-align: center;
    border-bottom: none !important;
    font-family: var(--font-body) !important;
    font-size: 15px !important;
    font-weight: 600;
  }

  @media (min-width: 1025px) {
    .nav-center { display: flex; }
    .nav-cta { display: inline-flex; }
    .nav-toggle { display: none; }
    .mobile-menu { display: none; }
  }

  @media (max-width: 640px), (display-mode: standalone) {
    .nav-inner {
      grid-template-columns: auto 1fr;
      gap: 1rem;
      padding-left: calc(1rem + var(--safe-left));
      padding-right: calc(1rem + var(--safe-right));
    }
    .nav-center,
    .nav-cta,
    .nav-toggle,
    .nav-signin {
      display: none;
    }
    .nav-right {
      gap: 0;
    }
    .mobile-menu {
      display: none;
    }
  }
</style>
