<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import '$lib/styles/tokens.css';
  import Nav from '$lib/components/layout/Nav.svelte';
  import BottomDock from '$lib/components/layout/BottomDock.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import { installOfflineRepairLoop } from '$lib/stores/cached-slugs';
  import { matchesStandalone } from '$lib/util/standalone';
  import { track } from '$lib/util/track';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children: import('svelte').Snippet;
  }

  let { data, children }: Props = $props();

  function isDockRoute(url: URL): boolean {
    return url.pathname === '/dock';
  }

  // Routes that wear the Dock's left-rail chrome (one nav model). The global
  // top Nav is suppressed here; the rail (desktop) + BottomDock (mobile) nav.
  function isRailShellRoute(url: URL): boolean {
    return url.pathname === '/dock' || url.pathname === '/tools' || url.pathname === '/you';
  }

  function isImmersiveToolRoute(url: URL): boolean {
    return url.pathname.startsWith('/run')
      || ((url.pathname === '/container' || url.pathname === '/dock') && url.searchParams.get('focused') === '1');
  }

  // The maker area now uses the global Nav as its top chrome (like Dock/Tools/
  // You) plus its own horizontal section sub-nav, so the Nav is NOT suppressed
  // there. Only the legacy /dashboard alias (which 308s to /maker) is excluded.
  function isMakerShellRoute(url: URL): boolean {
    const p = url.pathname;
    return p === '/dashboard' || p.startsWith('/dashboard/');
  }

  function showBottomDock(url: URL): boolean {
    const pathname = url.pathname;
    if ((pathname === '/container' || pathname === '/dock') && url.searchParams.get('focused') !== '1') return true;

    return ![
      '/admin',
      '/api',
      '/auth',
      '/c/',
      '/container',
      '/dock',
      '/dashboard',
      '/maker',
      '/dev',
      '/invite',
      '/manifest.webmanifest',
      '/run',
      '/trust-preview',
    ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  }

  function hideNavOnMobile(url: URL): boolean {
    return isDockRoute(url)
      || showBottomDock(url)
      || url.pathname.startsWith('/auth')
      || url.pathname.startsWith('/invite')
      || url.pathname.startsWith('/c/')
      || url.pathname === '/new'
      || url.pathname.startsWith('/run')
      || ((url.pathname === '/container' || url.pathname === '/dock') && url.searchParams.get('focused') === '1');
  }

  function showFooter(url: URL): boolean {
    const pathname = url.pathname;
    return !isRailShellRoute(url)
      && !pathname.startsWith('/run')
      && !((pathname === '/container' || pathname === '/dock') && url.searchParams.get('focused') === '1');
  }

  $effect(() => {
    const mobileDockChrome = showBottomDock($page.url);
    const mobileAppChrome = hideNavOnMobile($page.url);
    const dockShellRoute = isRailShellRoute($page.url);
    document.body.dataset.mobileDockChrome = mobileDockChrome ? 'true' : 'false';
    document.body.dataset.mobileAppChrome = mobileAppChrome ? 'true' : 'false';
    document.body.dataset.dockShellRoute = dockShellRoute ? 'true' : 'false';
  });

  onMount(() => {
    let authChannel: BroadcastChannel | null = null;
    const handleAuthEvent = () => {
      void invalidateAll();
    };

    try {
      authChannel = new BroadcastChannel('shippie-auth');
      authChannel.onmessage = (event) => {
        if ((event.data as { kind?: string } | null)?.kind === 'signed-in') {
          handleAuthEvent();
        }
      };
    } catch {
      authChannel = null;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'shippie:auth-event:v1' && event.newValue) {
        handleAuthEvent();
      }
    };
    window.addEventListener('storage', onStorage);

    if (data.user) {
      try {
        const key = `shippie:auth-broadcasted:${data.user.id}`;
        if (!sessionStorage.getItem(key)) {
          const payload = { kind: 'signed-in', at: Date.now() };
          authChannel?.postMessage(payload);
          localStorage.setItem('shippie:auth-event:v1', JSON.stringify(payload));
          sessionStorage.setItem(key, '1');
        }
      } catch {
        // Storage and BroadcastChannel are best-effort in private/PWA contexts.
      }
    }

    document.body.dataset.appReady = 'true';
    installOfflineRepairLoop();

    // Per-session telemetry. Gated by sessionStorage so each event
    // fires once per tab/PWA session.
    try {
      if (!sessionStorage.getItem('shippie:track:viewport_mode')) {
        const w = window.innerWidth;
        const mode = w < 768 ? 'mobile' : w < 1280 ? 'tablet' : 'desktop';
        track('viewport_mode', { mode });
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

    return () => {
      authChannel?.close();
      window.removeEventListener('storage', onStorage);
    };
  });
</script>

<svelte:head>
  <title>Shippie — small tools that work on your device</title>
  <meta name="theme-color" content="#14120F" />
</svelte:head>

<a href="#main" class="skip-link">Skip to main content</a>
{#if !isRailShellRoute($page.url) && !isMakerShellRoute($page.url) && !isImmersiveToolRoute($page.url)}
  <div class="nav-shell" class:mobile-app-chrome={hideNavOnMobile($page.url)}>
    <Nav user={data.user} />
  </div>
{/if}
<main
  id="main"
  class:with-bottom-dock={showBottomDock($page.url)}
  class:dock-shell-route={isRailShellRoute($page.url)}
  class:immersive-tool-route={isImmersiveToolRoute($page.url)}
>
  {@render children()}
</main>
{#if showBottomDock($page.url)}
  <BottomDock user={data.user} />
{/if}
{#if showFooter($page.url)}
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

  main.dock-shell-route {
    min-height: 100svh;
    min-height: 100dvh;
  }

  main.immersive-tool-route {
    min-height: 100svh;
    min-height: 100dvh;
  }

  :global(body[data-dock-shell-route='true']) {
    padding-top: 0;
  }

  /* Dock 1.1 — when a tool owns the screen (immersive active-tool), the
     full-bleed shell covers everything; drop the dock + global nav from the
     DOM so they can't peek under safe-area or steal taps. */
  :global(html[data-shippie-immersive] .bottom-dock),
  :global(html[data-shippie-immersive] .nav-shell) {
    display: none;
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
      padding-bottom: calc(66px + var(--safe-bottom));
      scroll-padding-bottom: calc(66px + var(--safe-bottom));
    }
  }
</style>
