<!--
  Platform-wide toast renderer. Mount once at the app root.

  Layering:
    z-index: 9999 — above the focused-mode shell (.focused-exit-pill is in the
    100-200 range) but below browser-native modals.

  Positioning:
    safe-area-inset-top so the iOS notch doesn't clip success messages;
    safe-area-inset-right so devices with right-side cutouts behave too.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, type Toast } from '$lib/stores/toast';
  import { track } from '$lib/util/track';

  function variantClass(kind: Toast['kind']): string {
    return `toast variant-${kind}`;
  }

  // Skip-key for the SW update toast. Stored in localStorage as the
  // build id of a version the user explicitly skipped. On the next
  // update, we ask the new WAITING worker for its build id; if it
  // matches the stored skip, suppress the toast. If it differs, show.
  // This is precise per-version — unlike a 24h timestamp, "Skip"
  // doesn't accidentally hide unrelated future updates.
  const SKIP_KEY = 'shippie:sw-skipped-version';

  // Ask the WAITING worker (NOT the active controller) for its build
  // id via MessageChannel. The active controller reports the currently-
  // installed version; we want the pending one. Bails after 1s.
  async function getWaitingWorkerVersion(
    reg: ServiceWorkerRegistration,
  ): Promise<string | null> {
    const waiting = reg.waiting;
    if (!waiting) return null;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      let resolved = false;
      const settle = (value: string | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };
      channel.port1.onmessage = (event) => {
        const v = (event.data as { versionId?: string } | null)?.versionId;
        settle(typeof v === 'string' && v ? v : null);
      };
      try {
        waiting.postMessage({ t: 'version' }, [channel.port2]);
      } catch {
        settle(null);
      }
      window.setTimeout(() => settle(null), 1000);
    });
  }

  // The SW registration in app.html dispatches `shippie:sw-update-ready`
  // when a new worker has installed and a controller exists.
  onMount(() => {
    async function onUpdateReady() {
      const reg = (window as { __shippieSwReg?: ServiceWorkerRegistration })
        .__shippieSwReg;
      if (!reg) return;

      const pendingVersion = await getWaitingWorkerVersion(reg);
      if (pendingVersion) {
        try {
          const skipped = localStorage.getItem(SKIP_KEY);
          if (skipped && skipped === pendingVersion) return; // suppress
        } catch {
          // localStorage blocked (private mode / partitioned) — fall
          // through and show the toast.
        }
      }

      track('sw_update_shown', pendingVersion ? { version_id: pendingVersion } : undefined);
      toast.push({
        kind: 'info',
        message: 'New version available.',
        durationMs: 0,
        action: {
          label: 'Refresh',
          run: () => {
            track('sw_update_refreshed', pendingVersion ? { version_id: pendingVersion } : undefined);
            const worker = reg.waiting ?? reg.installing;
            if (worker) {
              worker.postMessage('SKIP_WAITING');
            } else {
              location.reload();
            }
          },
        },
        // Secondary action: skip this version. Stores the build id so
        // future deploys (different version) still surface the toast.
        secondaryAction: pendingVersion
          ? {
              label: 'Skip this version',
              run: () => {
                track('sw_update_skipped', { version_id: pendingVersion });
                try {
                  localStorage.setItem(SKIP_KEY, pendingVersion);
                } catch {
                  // Silent — user will see the toast again on this device.
                }
              },
            }
          : undefined,
      });
    }
    window.addEventListener('shippie:sw-update-ready', onUpdateReady);
    return () => {
      window.removeEventListener('shippie:sw-update-ready', onUpdateReady);
    };
  });
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
  {#each $toast as t (t.id)}
    <div class={variantClass(t.kind)} role="status">
      <span class="message">{t.message}</span>
      {#if t.action}
        <button
          type="button"
          class="action"
          onclick={() => {
            t.action?.run();
            toast.dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      {/if}
      {#if t.secondaryAction}
        <button
          type="button"
          class="action secondary"
          onclick={() => {
            t.secondaryAction?.run();
            toast.dismiss(t.id);
          }}
        >
          {t.secondaryAction.label}
        </button>
      {/if}
      <button
        type="button"
        class="close"
        aria-label="Dismiss"
        onclick={() => toast.dismiss(t.id)}
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    top: max(24px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: min(420px, calc(100vw - 32px));
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 14px;
    border: 1px solid var(--border);
    background: var(--bg-elevated, var(--bg, #14120F));
    color: var(--text);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    /* Sharp corners — brand. */
    border-radius: 0;
    animation: toast-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .variant-success {
    border-color: var(--gold, #D9A658);
    border-left: 3px solid var(--gold, #D9A658);
  }
  .variant-error {
    border-color: var(--destructive, #c45a4a);
    border-left: 3px solid var(--destructive, #c45a4a);
  }
  .variant-info {
    border-color: var(--sage, #5EA777);
    border-left: 3px solid var(--sage, #5EA777);
  }

  .message {
    flex: 1;
  }

  .action {
    appearance: none;
    background: transparent;
    border: 1px solid currentColor;
    color: var(--gold, #D9A658);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 0;
  }
  .action:hover {
    background: rgba(217, 166, 88, 0.1);
  }
  /* Secondary action (e.g. "Skip this version") — recessed so the
     primary action stays visually dominant. */
  .action.secondary {
    color: var(--text-secondary, #C9BEA9);
    border-color: var(--border-light, rgba(255,255,255,0.18));
  }
  .action.secondary:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text, #EDE4D3);
  }

  .close {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--text-secondary, #C9BEA9);
    font-size: 18px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  .close:hover {
    color: var(--text);
  }

  @keyframes toast-in {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }
</style>
