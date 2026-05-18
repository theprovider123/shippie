<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import '$lib/styles/tokens.css';
  import Nav from '$lib/components/layout/Nav.svelte';
  import BottomDock from '$lib/components/layout/BottomDock.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import { matchesStandalone } from '$lib/util/standalone';
  import { track } from '$lib/util/track';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();

  function showBottomDock(pathname: string): boolean {
    return ![
      '/admin',
      '/api',
      '/auth',
      '/c/',
      '/container',
      '/dashboard',
      '/dev',
      '/invite',
      '/manifest.webmanifest',
      '/run',
      '/trust-preview',
    ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  }

  $effect(() => {
    const mobileDockChrome = showBottomDock($page.url.pathname);
    document.body.dataset.mobileDockChrome = mobileDockChrome ? 'true' : 'false';
  });

  onMount(() => {
    document.body.dataset.appReady = 'true';

    // Per-session telemetry. Gated by sessionStorage so each event
    // fires once per tab/PWA session.
    try {
      if (!sessionStorage.getItem('shippie:track:viewport_mode')) {
        const w = window.innerWidth;
        const mode = w < 768 ? 'mobile' : w < 1280 ? 'tablet' : 'desktop';
        track('viewport_mode', { mode, width: w });
        sessionStorage.setItem('shippie:track:viewport_mode', '1');
      }
      if (matchesStandalone() && !sessionStorage.getItem('shippie:track:standalone')) {
        track('pwa_standalone_launch');
        sessionStorage.setItem('shippie:track:standalone', '1');
      }
    } catch {
      // sessionStorage blocked (private browsing) — fire on every load,
      // accept the slight over-count rather than lose the signal.
    }
  });
</script>

<svelte:head>
  <title>Shippie — No app store. Just the web, installed.</title>
  <meta name="theme-color" content="#14120F" />
  <link
    rel="preconnect"
    href="https://fonts.googleapis.com"
  />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
  />
</svelte:head>

<a href="#main" class="skip-link">Skip to main content</a>
<div class="nav-shell" class:with-mobile-dock={showBottomDock($page.url.pathname)}>
  <Nav user={data.user} />
</div>
<main id="main" class:with-bottom-dock={showBottomDock($page.url.pathname)}>
  {@render children()}
</main>
{#if showBottomDock($page.url.pathname)}
  <BottomDock user={data.user} />
{/if}
<Footer />
<Toast />

<style>
  main {
    /* Cascade — 100svh on browsers without dvh (the smaller of static
       short/long viewport units), then 100dvh on browsers that support
       it (the dynamic viewport that grows/shrinks with the URL bar so
       the layout doesn't jump on scroll). */
    min-height: calc(100svh - var(--nav-height) - var(--safe-top));
    min-height: calc(100dvh - var(--nav-height) - var(--safe-top));
  }

  @media (max-width: 640px), (display-mode: standalone) {
    .nav-shell.with-mobile-dock {
      display: none;
    }

    :global(body[data-mobile-dock-chrome='true']) {
      padding-top: var(--safe-top);
    }

    main.with-bottom-dock {
      min-height: 100svh;
      min-height: 100dvh;
      padding-bottom: calc(108px + var(--safe-bottom));
      scroll-padding-bottom: calc(108px + var(--safe-bottom));
    }
  }
</style>
