<script lang="ts">
  import { page } from '$app/stores';

  let { children }: { children: import('svelte').Snippet } = $props();

  const path = $derived($page.url.pathname);
  const onApps = $derived(path.startsWith('/maker/apps'));
  const onFeedback = $derived(path.startsWith('/maker/feedback'));
</script>

<div class="maker-shell">
  <nav class="maker-subnav" aria-label="Maker sections">
    <div class="subnav-inner">
      <a href="/maker/apps" class:active={onApps} aria-current={onApps ? 'page' : undefined}>Apps</a>
      <a href="/maker/feedback" class:active={onFeedback} aria-current={onFeedback ? 'page' : undefined}>Feedback</a>
      <a class="ship" href="/new">Ship app</a>
    </div>
  </nav>
  <main class="maker-main">
    {@render children()}
  </main>
</div>

<style>
  .maker-shell {
    min-height: calc(100dvh - var(--nav-height) - var(--safe-top));
    background: var(--paper-warm);
    color: var(--bg);
  }
  .maker-subnav {
    border-bottom: 1px solid var(--border-light, #e5ddc8);
    background: var(--paper-warm);
  }
  .subnav-inner {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 clamp(1rem, 3vw, 2rem);
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .subnav-inner::-webkit-scrollbar {
    display: none;
  }
  .subnav-inner a {
    flex: 0 0 auto;
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    padding: 0 0.7rem;
    color: var(--text-muted-warm);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .subnav-inner a:hover {
    color: var(--bg);
  }
  .subnav-inner a.active {
    color: var(--sunset);
    border-bottom-color: var(--sunset);
  }
  .subnav-inner .ship {
    margin-left: auto;
    color: var(--sunset);
    font-weight: 700;
  }
  .subnav-inner .ship:hover {
    color: var(--sunset-hover, #d95634);
  }
  .maker-main {
    min-width: 0;
    padding: clamp(1rem, 3vw, 2rem);
    overflow-x: auto;
  }
  @media (max-width: 760px) {
    .maker-main {
      padding: 1rem;
      overflow-x: visible;
    }
  }
  @media (prefers-color-scheme: dark) {
    .maker-shell {
      background: var(--bg);
      color: var(--text);
    }
    .maker-subnav {
      border-color: var(--ink-warm);
      background: var(--bg);
    }
    .subnav-inner a:hover {
      color: var(--text);
    }
  }
</style>
