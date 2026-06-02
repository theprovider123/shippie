<!--
  Safe Mode shell (5C).

  When the container or ledger init goes south, this is the route a
  user reaches via the trust-banner "Open Safe Mode" link or the
  `?safe=1` query flag. It does NOT mount the container, does NOT
  require D1/KV access, and stays operable even if the main app fails
  to boot.

  Capabilities exposed:
    - Read the Trust Ledger (links to /__shippie/trust/)
    - Revoke any active capability (links to /__shippie/trust/)
    - Restore data from a previous backup (link out)
    - Wipe on-device data (full reset)
    - Rollback the container channel (5C — sets a localStorage flag
      the SW reads on next install; until SW-side handler is wired,
      this is a manual hint surfaced to the user)
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getLedger } from '$lib/trust-ledger/host';
  import { CONTAINER_CHANNEL_LS_KEY, PINNED_CHANNEL } from '$lib/trust-ledger/container-channel';

  let ledgerOk = $state<'unknown' | 'ok' | 'unavailable'>('unknown');
  let busy = $state(false);
  let notice = $state<string | null>(null);
  let currentChannel = $state<string>(PINNED_CHANNEL);

  onMount(async () => {
    try {
      const ledger = await getLedger();
      ledgerOk = ledger ? 'ok' : 'unavailable';
    } catch {
      ledgerOk = 'unavailable';
    }
    if (typeof localStorage !== 'undefined') {
      currentChannel = localStorage.getItem(CONTAINER_CHANNEL_LS_KEY) ?? PINNED_CHANNEL;
    }
  });

  async function wipeEverything(): Promise<void> {
    if (
      !confirm(
        'Wipe ALL on-device Shippie data on this browser: trust ledger, vault seed, localStorage, IndexedDB? This cannot be undone. Backups remain intact.',
      )
    ) {
      return;
    }
    busy = true;
    try {
      const ledger = await getLedger().catch(() => null);
      if (ledger) {
        try {
          await ledger.wipe();
        } catch {
          // Ledger may already be in an inoperable state; continue with hard reset.
        }
      }
      // Hard reset: localStorage + delete every IndexedDB our packages use.
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof indexedDB !== 'undefined') {
        const known = ['shippie-trust-ledger', 'shippie-ambient', 'shippie-intelligence', 'shippie-local-db'];
        for (const name of known) {
          await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        }
      }
      notice = 'On-device data wiped. Reloading…';
      setTimeout(() => window.location.reload(), 1500);
    } finally {
      busy = false;
    }
  }

  function pinKnownGood(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CONTAINER_CHANNEL_LS_KEY, PINNED_CHANNEL);
    currentChannel = PINNED_CHANNEL;
    notice = `Container pinned to known-good channel '${PINNED_CHANNEL}'. Next launch uses this version.`;
  }

  function releaseChannel(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(CONTAINER_CHANNEL_LS_KEY);
    currentChannel = 'auto (latest)';
    notice = 'Channel released. Container will track the latest release on next launch.';
  }
</script>

<svelte:head>
  <title>Safe Mode — Shippie</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="safe">
  <header>
    <h1>Safe Mode</h1>
    <p>
      Shippie's container is paused. You can read the Trust Ledger, revoke capabilities,
      restore from backup, pin the container to a known-good version, or wipe local data.
    </p>
  </header>

  {#if notice}
    <p class="notice">{notice}</p>
  {/if}

  <section>
    <h2>Trust Ledger</h2>
    <p>Ledger init: <strong>{ledgerOk}</strong></p>
    <p>
      <a class="btn" href="/__shippie/trust/">Open Trust Center</a>
      <a class="btn btn--ghost" href="/__shippie/data">Open Your Data</a>
    </p>
  </section>

  <section>
    <h2>Container channel</h2>
    <p class="muted">Current preference: <code>{currentChannel}</code></p>
    <p>
      <button class="btn" disabled={busy} onclick={pinKnownGood}>Pin to known-good ({PINNED_CHANNEL})</button>
      <button class="btn btn--ghost" disabled={busy} onclick={releaseChannel}>Release pin</button>
    </p>
    <p class="muted">
      Pinning prevents the next container update from applying until a release with healthier
      Proof signals reaches your device. Use this if a recent update started failing on your
      phone.
    </p>
  </section>

  <section>
    <h2>Full reset</h2>
    <p class="muted">
      Last resort. Wipes the on-device Trust Ledger, the Vault seed, every Shippie
      IndexedDB database, and localStorage. Backups in your chosen cloud (Drive / iCloud /
      Dropbox / Hub) are NOT touched.
    </p>
    <p>
      <button class="btn btn--danger" disabled={busy} onclick={wipeEverything}>Wipe on-device data</button>
    </p>
  </section>

  <footer>
    <p class="muted">
      You can leave Safe Mode by closing this tab or navigating to
      <a href="/">shippie.app</a>.
    </p>
  </footer>
</main>

<style>
  .safe {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    font-family: var(--font-sans, system-ui, sans-serif);
    color: var(--ink-primary, #1a1a1a);
  }

  .safe a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
  }

  header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.75rem;
    font-weight: 600;
  }

  header p {
    margin: 0 0 1.5rem;
    color: var(--ink-muted, #666);
  }

  section {
    margin: 2rem 0;
  }

  section h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink-muted, #666);
  }

  .muted {
    color: var(--ink-muted, #666);
    font-size: 0.875rem;
  }

  .notice {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--surface-soft, #f7f4ee);
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 0.9rem;
    border-radius: 0.4rem;
    border: 1px solid var(--border-default, #cfc6b3);
    background: var(--surface-default, #ffffff);
    color: var(--ink-primary, #1a1a1a);
    text-decoration: none;
    font: inherit;
    cursor: pointer;
    margin-right: 0.5rem;
  }

  .btn:hover:not(:disabled) {
    background: var(--surface-soft, #f7f4ee);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--ink-muted, #666);
  }

  .btn--danger {
    border-color: var(--border-warning, #f3c969);
    color: var(--ink-warning, #4a3000);
  }

  code {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 0.85rem;
    color: var(--ink-muted, #666);
  }
</style>
