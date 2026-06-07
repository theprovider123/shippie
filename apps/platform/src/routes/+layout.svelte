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

  function showBottomDock(url: URL): boolean {
    const pathname = url.pathname;
    if (pathname === '/container' && url.searchParams.get('focused') !== '1') return true;

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
      '/uniti',
    ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  }

  // Immersive full-bleed apps that own their entire viewport (their own shell,
  // header and nav) — Shippie marketplace chrome (top Nav + Footer) is hidden.
  function isImmersiveApp(url: URL): boolean {
    return url.pathname === '/uniti' || url.pathname.startsWith('/uniti/');
  }

  function hideNavOnMobile(url: URL): boolean {
    return showBottomDock(url)
      || url.pathname.startsWith('/auth')
      || url.pathname.startsWith('/invite')
      || url.pathname.startsWith('/c/')
      || url.pathname === '/new'
      || url.pathname.startsWith('/run')
      || (url.pathname === '/container' && url.searchParams.get('focused') === '1');
  }

  $effect(() => {
    const mobileDockChrome = showBottomDock($page.url);
    const mobileAppChrome = hideNavOnMobile($page.url);
    document.body.dataset.mobileDockChrome = mobileDockChrome ? 'true' : 'false';
    document.body.dataset.mobileAppChrome = mobileAppChrome ? 'true' : 'false';
    // Immersive apps own the page background — stop the dark Shippie body
    // colour peeking above/below their full-bleed shell.
    document.body.dataset.immersive = isImmersiveApp($page.url) ? 'true' : 'false';
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
  <title>Shippie — small tools that work on your device</title>
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
{#if !isImmersiveApp($page.url)}
  <div class="nav-shell" class:mobile-app-chrome={hideNavOnMobile($page.url)}>
    <Nav user={data.user} />
  </div>
{/if}
<main id="main" class:with-bottom-dock={showBottomDock($page.url)} class:immersive={isImmersiveApp($page.url)}>
  {@render children()}
</main>
{#if showBottomDock($page.url)}
  <BottomDock user={data.user} />
{/if}
{#if !isImmersiveApp($page.url)}
  <Footer />
{/if}
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

  /* Immersive apps (e.g. Uniti) own the full viewport with no Shippie chrome. */
  main.immersive {
    min-height: 100svh;
    min-height: 100dvh;
  }
  /* Match the body to the immersive app's own background so no dark Shippie
     colour shows above the skip-link or below a short page. */
  :global(body[data-immersive='true']) {
    background: #f8f7f4;
  }

  @media (max-width: 640px), (display-mode: standalone) {
    .nav-shell.mobile-app-chrome {
      display: none;
    }

    :global(body[data-mobile-app-chrome='true']) {
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
