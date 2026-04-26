<script lang="ts">
  import type { AppUser } from '$server/auth/lucia';

  interface Props {
    user: AppUser | null;
  }

  let { user }: Props = $props();

  let mobileOpen = $state(false);
</script>

<nav class="navbar" aria-label="Primary">
  <div class="nav-inner">
    <div class="nav-left">
      <a href="/" class="nav-logo">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 2 L20 12 L16 12 L16 22 L8 22 L8 12 L4 12 Z"
            fill="var(--sunset)"
          />
        </svg>
        <span class="nav-wordmark">shippie</span>
      </a>
    </div>

    <div class="nav-center">
      <a href="/apps" class="nav-link">Explore</a>
      <a href="/leaderboards" class="nav-link">Leaderboards</a>
      <a href="/why" class="nav-link">Why</a>
      <a href="/docs" class="nav-link">Docs</a>
    </div>

    <div class="nav-right">
      {#if user}
        <a href="/dashboard" class="nav-user">
          {#if user.avatarUrl}
            <img src={user.avatarUrl} alt="" width="28" height="28" />
          {:else}
            <span class="nav-user-monogram">
              {(user.displayName ?? user.username ?? user.email)[0]?.toUpperCase()}
            </span>
          {/if}
        </a>
      {:else}
        <a href="/auth/login" class="nav-signin">Sign in</a>
      {/if}
      <a href="/new" class="nav-cta">Deploy an app</a>
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
      <a href="/apps" onclick={() => (mobileOpen = false)}>Explore</a>
      <a href="/leaderboards" onclick={() => (mobileOpen = false)}>Leaderboards</a>
      <a href="/why" onclick={() => (mobileOpen = false)}>Why</a>
      <a href="/docs" onclick={() => (mobileOpen = false)}>Docs</a>
      {#if !user}
        <a href="/auth/login" onclick={() => (mobileOpen = false)}>Sign in</a>
      {/if}
      <a href="/new" class="mobile-cta" onclick={() => (mobileOpen = false)}>Deploy an app</a>
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
  .nav-link:hover { color: var(--text); }
  .nav-signin {
    font-size: var(--small-size);
    color: var(--text-light);
  }
  .nav-signin:hover { color: var(--text-secondary); }
  .nav-cta {
    display: none;
    padding: 0.5rem 1.125rem;
    background: var(--sunset);
    color: var(--bg-pure);
    font-size: var(--small-size);
    font-weight: 600;
    border-radius: 4px;
    transition: background 0.2s;
  }
  .nav-cta:hover { background: var(--sunset-hover); }
  .nav-user {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-alt);
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
    width: 36px;
    height: 36px;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
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
    border-radius: 8px;
    text-align: center;
    border-bottom: none !important;
    font-family: var(--font-body) !important;
    font-size: 15px !important;
    font-weight: 600;
  }

  @media (min-width: 768px) {
    .nav-center { display: flex; }
    .nav-cta { display: inline-flex; }
    .nav-toggle { display: none; }
    .mobile-menu { display: none; }
  }
</style>
