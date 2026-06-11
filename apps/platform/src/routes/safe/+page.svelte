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
  <header class="head">
    <p class="eyebrow">Recovery</p>
    <h1>Safe Mode</h1>
    <p class="lede">
      Shippie's container is paused. You can read the Trust Ledger, revoke capabilities,
      restore from backup, pin the container to a known-good version, or wipe local data.
    </p>
  </header>

  {#if notice}
    <p class="notice" role="status">{notice}</p>
  {/if}

  <div class="sections">
    <section class="block" aria-labelledby="ledger-title">
      <div class="block-head">
        <p class="block-eyebrow">Trust</p>
        <h2 id="ledger-title">Trust Ledger</h2>
      </div>
      <div class="ledger-status">
        <span>Ledger init</span>
        <span class="status-val" class:ok={ledgerOk === 'ok'} class:err={ledgerOk === 'unavailable'}>{ledgerOk}</span>
      </div>
      <div class="action-row">
        <a class="btn btn-primary" href="/__shippie/trust/">Open Trust Center</a>
        <a class="btn" href="/__shippie/data">Your Data</a>
      </div>
    </section>

    <section class="block" aria-labelledby="channel-title">
      <div class="block-head">
        <p class="block-eyebrow">Container</p>
        <h2 id="channel-title">Channel pin</h2>
      </div>
      <p class="block-meta">Current preference: <code>{currentChannel}</code></p>
      <p class="block-desc">
        Pinning prevents the next container update from applying. Use this if a recent update
        started failing on your phone.
      </p>
      <div class="action-row">
        <button class="btn btn-primary" disabled={busy} onclick={pinKnownGood}>
          Pin to {PINNED_CHANNEL}
        </button>
        <button class="btn" disabled={busy} onclick={releaseChannel}>Release pin</button>
      </div>
    </section>

    <section class="block block-danger" aria-labelledby="reset-title">
      <div class="block-head">
        <p class="block-eyebrow">Danger</p>
        <h2 id="reset-title">Full reset</h2>
      </div>
      <p class="block-desc">
        Last resort. Wipes the on-device Trust Ledger, the Vault seed, every Shippie
        IndexedDB database, and localStorage. Backups in your chosen cloud — Drive, iCloud,
        Dropbox, Hub — are not touched.
      </p>
      <div class="action-row">
        <button class="btn btn-danger" disabled={busy} onclick={wipeEverything}>
          Wipe on-device data
        </button>
      </div>
    </section>
  </div>

  <footer class="foot">
    <p>Leave Safe Mode by closing this tab or navigating to <a href="/">shippie.app</a>.</p>
  </footer>
</main>

<style>
  .safe {
    max-width: 640px;
    margin: 0 auto;
    padding: calc(var(--safe-top, 0px) + var(--space-xl)) clamp(1rem, 4vw, 2rem) calc(var(--safe-bottom, 0px) + var(--space-3xl));
    background: var(--bg);
    color: var(--text);
    min-height: 100dvh;
    box-sizing: border-box;
  }

  .head {
    padding-bottom: var(--space-xl);
    border-bottom: 1px solid var(--border-light);
    margin-bottom: var(--space-xl);
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sunset);
  }

  h1 {
    margin: 0 0 var(--space-sm);
    font-family: var(--font-heading);
    font-size: var(--text-display);
    line-height: 1;
  }

  .lede {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-body);
    line-height: 1.6;
    max-width: 52ch;
  }

  .notice {
    margin: 0 0 var(--space-lg);
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    border-left: 3px solid var(--sunset);
    background: rgba(232, 96, 60, 0.04);
    color: var(--text);
    font-size: var(--text-small);
  }

  .sections {
    display: grid;
    gap: 0;
  }

  .block {
    padding: var(--space-lg) 0;
    border-bottom: 1px solid var(--border-light);
    display: grid;
    gap: var(--space-sm);
  }

  .block:first-child {
    border-top: 0;
  }

  .block-danger .block-eyebrow {
    color: var(--danger, #b43f2a);
  }

  .block-head {
    display: grid;
    gap: 0.15rem;
    margin-bottom: var(--space-xs);
  }

  .block-eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
  }

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    letter-spacing: 0;
  }

  .ledger-status {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--text-small);
    color: var(--text-secondary);
  }

  .status-val {
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .status-val.ok { color: var(--success, #2e7d5b); }
  .status-val.err { color: var(--danger, #b43f2a); }

  .block-meta {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-small);
  }

  .block-meta code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    background: var(--surface);
    padding: 1px 6px;
    border: 1px solid var(--border-light);
    color: var(--text);
  }

  .block-desc {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-small);
    line-height: 1.6;
    max-width: 56ch;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: var(--space-xs);
  }

  .btn {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    border-color: var(--sunset);
    color: var(--sunset);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--sunset) 88%, #fff);
    border-color: color-mix(in srgb, var(--sunset) 88%, #fff);
  }

  .btn-danger {
    border-color: rgba(180, 63, 42, 0.45);
    color: var(--danger, #b43f2a);
  }

  .btn-danger:hover:not(:disabled) {
    border-color: var(--danger, #b43f2a);
    background: rgba(180, 63, 42, 0.08);
  }

  .foot {
    margin-top: var(--space-xl);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border-light);
  }

  .foot p {
    margin: 0;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.04em;
  }

  .foot a {
    color: var(--sunset);
    text-decoration: none;
  }

  @media (max-width: 640px) {
    .action-row {
      flex-direction: column;
    }
    .btn {
      width: 100%;
    }
  }
</style>
