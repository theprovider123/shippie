<script lang="ts">
  /**
   * RailShell — the Dock's left-rail chrome, reused on /tools and /you so the
   * whole product shares ONE navigation model. The rail's Dock-only actions
   * (Access / Create / switcher) navigate to /dock from these surfaces.
   * Mobile keeps the global BottomDock (the rail hides under 640px).
   */
  import DockRail from '$lib/container/DockRail.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    user: { isAdmin?: boolean } | null | undefined;
    current?: 'browse' | 'you' | 'maker' | 'docs' | null;
    children?: Snippet;
  }
  let { user, current = null, children }: Props = $props();
</script>

<div class="rail-shell">
  <DockRail {user} {current} />
  <div class="rail-canvas">
    {@render children?.()}
  </div>
</div>

<style>
  .rail-shell {
    min-height: 100svh;
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    background: var(--bg);
    transition: grid-template-columns 0.2s ease;
    will-change: grid-template-columns;
  }
  @media (prefers-reduced-motion: reduce) {
    .rail-shell {
      transition: none;
    }
  }
  /* Rail expands by pushing content right — never covering it. */
  .rail-shell:has(:global(.dock-rail:hover)),
  .rail-shell:has(:global(.dock-rail:focus-within)) {
    grid-template-columns: 232px minmax(0, 1fr);
    transition-delay: 0.12s;
  }
  .rail-canvas {
    min-width: 0;
    /* Pages keep their own .wrap width/padding; the shell only reserves the
       rail column. Bottom space leaves room for the mobile BottomDock. */
    padding: 0 0 clamp(40px, 6vw, 72px);
  }
  @media (max-width: 640px) {
    .rail-shell {
      display: block;
      min-height: auto;
    }
    .rail-canvas {
      padding: 0 0 calc(80px + var(--safe-bottom));
    }
  }
</style>
