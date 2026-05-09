<!--
  Install nudge — surfaces "Add Shippie to your home screen" once the
  user has shown engagement (≥3 different tools launched), is not
  already in standalone mode, and hasn't dismissed in the last 30 days.
  Renders inline at the bottom of the apex `/` (NOT a modal popup).

  Two paths:
    1. Browsers with the install prompt (Chrome, Edge, Samsung Internet,
       Brave on Android): we capture `beforeinstallprompt` and surface
       a primary "Install" button that fires the deferred prompt.
    2. iOS Safari (no `beforeinstallprompt`): show a small instructional
       hint card with the share-icon → "Add to Home Screen" copy.

  Telemetry events fire via `lib/util/track` so we can measure whether
  the engagement gate is well-tuned in practice.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { matchesStandalone } from '$lib/util/standalone';
  import { launcherMemory } from '$lib/stores/launcher-memory';
  import { track } from '$lib/util/track';

  const DISMISS_KEY = 'shippie:install-nudge-dismissed-at';
  const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const ENGAGEMENT_THRESHOLD = 3;

  type BipEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };

  let installPromptEvent = $state<BipEvent | null>(null);
  let dismissed = $state(true); // safe default until onMount checks
  let standalone = $state(true);
  let mounted = $state(false);
  let trackedEligible = false;

  // Recompute total launches reactively so the nudge appears as soon as
  // the user crosses the threshold (no full reload required).
  const totalLaunches = $derived(
    Object.values($launcherMemory.launchCounts ?? {}).reduce((sum, n) => sum + (n ?? 0), 0),
  );

  function isIosSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
    const isSafari = /^((?!Chrome|CriOS|FxiOS|EdgiOS|OPiOS).)*Safari/.test(ua);
    return isIos && isSafari;
  }

  const eligible = $derived(
    mounted &&
    !standalone &&
    !dismissed &&
    totalLaunches >= ENGAGEMENT_THRESHOLD &&
    (installPromptEvent !== null || isIosSafari()),
  );

  // Fire install_nudge_eligible the first time the user crosses the
  // threshold + install_nudge_shown each time the card appears.
  $effect(() => {
    if (!eligible) return;
    if (!trackedEligible) {
      trackedEligible = true;
      track('install_nudge_eligible', { iossafari: isIosSafari() });
    }
    track('install_nudge_shown', { iossafari: isIosSafari() });
  });

  onMount(() => {
    standalone = matchesStandalone();
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
      dismissed = !Number.isFinite(at) || at <= 0
        ? false
        : Date.now() - at < DISMISS_TTL_MS;
    } catch {
      dismissed = false;
    }
    mounted = true;

    function onBip(event: Event) {
      event.preventDefault();
      installPromptEvent = event as BipEvent;
    }
    window.addEventListener('beforeinstallprompt', onBip);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  });

  async function install() {
    if (!installPromptEvent) return;
    track('install_nudge_accepted');
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        // Mark dismissed so we don't ask again — the install will switch
        // them to standalone anyway.
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
      }
    } catch {
      // Prompt may throw if called while another is in-flight. Silent.
    } finally {
      installPromptEvent = null;
    }
  }

  function dismiss() {
    track('install_nudge_dismissed');
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode — just hide for this session.
    }
    dismissed = true;
  }
</script>

{#if eligible}
  <aside class="install-nudge" aria-label="Install Shippie">
    <div class="copy">
      <p class="title">Add Shippie to your home screen</p>
      {#if installPromptEvent}
        <p class="body">One tap, no account. Your tools are always one icon away.</p>
      {:else}
        <p class="body">Tap the share icon, then "Add to Home Screen". Your tools are always one icon away.</p>
      {/if}
    </div>
    <div class="actions">
      {#if installPromptEvent}
        <button type="button" class="primary" onclick={install}>Install</button>
      {/if}
      <button type="button" class="ghost" onclick={dismiss}>Not now</button>
    </div>
  </aside>
{/if}

<style>
  .install-nudge {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-md, 1rem);
    align-items: center;
    margin-top: var(--space-2xl, 4rem);
    padding: var(--space-lg, 1.5rem);
    border: 1px solid var(--border-light, rgba(255, 255, 255, 0.18));
    background: var(--surface, #1E1A15);
  }
  @media (max-width: 640px) {
    .install-nudge {
      grid-template-columns: 1fr;
    }
  }
  .copy { min-width: 0; }
  .title {
    margin: 0 0 4px;
    font-family: var(--font-heading, serif);
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text, #EDE4D3);
    letter-spacing: -0.015em;
  }
  .body {
    margin: 0;
    color: var(--text-secondary, #C9BEA9);
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .primary,
  .ghost {
    appearance: none;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 0;
    font-family: var(--font-body, system-ui);
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    background: var(--sunset, #E8603C);
    color: var(--bg-pure, #14120F);
    border: 1px solid var(--sunset, #E8603C);
  }
  .primary:hover {
    background: var(--sunset-hover, #D44E2A);
  }
  .ghost {
    background: transparent;
    color: var(--text-secondary, #C9BEA9);
    border: 1px solid var(--border-light, rgba(255, 255, 255, 0.18));
  }
  .ghost:hover {
    color: var(--text, #EDE4D3);
    border-color: var(--text-secondary, #C9BEA9);
  }
</style>
