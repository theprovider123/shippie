<!--
  Trust Center (5B).

  Cross-app surface for the on-device Trust Ledger.
  - Recent activity across every app (last 24 h).
  - Active revocations with restore.
  - Export-all / wipe-all actions.
  - Retention setting.

  Read-only for the ledger contents; users mutate via revoke / wipe /
  retention controls only. 5C lands the safe-mode rollback story.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getLedger,
    getRevocationStore,
  } from '$lib/trust-ledger/host';
  import type { LedgerRow, RevocationRecord } from '@shippie/trust-ledger';

  const RETENTION_KEY = 'shippie.trust-ledger.retention-ms';
  const RETENTION_PRESETS = [
    { label: 'Session only', ms: 0 },
    { label: '24 hours', ms: 24 * 3600 * 1000 },
    { label: '7 days', ms: 7 * 24 * 3600 * 1000 },
    { label: '30 days', ms: 30 * 24 * 3600 * 1000 },
    { label: '90 days', ms: 90 * 24 * 3600 * 1000 },
  ];

  let rows = $state<LedgerRow[]>([]);
  let telemetryRows = $state<LedgerRow[]>([]);
  let revocations = $state<RevocationRecord[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let retentionMs = $state<number>(RETENTION_PRESETS[3]!.ms);

  onMount(async () => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(RETENTION_KEY) : null;
      if (stored && Number.isFinite(Number(stored))) {
        retentionMs = Number(stored);
      }
      await reload();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  async function reload(): Promise<void> {
    const ledger = await getLedger();
    if (!ledger) {
      error = 'Trust Ledger unavailable in this environment.';
      return;
    }
    const since = Date.now() - 24 * 3600 * 1000;
    const all = await ledger.exportAll();
    rows = all.filter((r) => r.ts >= since && r.category === 'capability').slice(0, 200);
    telemetryRows = all.filter((r) => r.ts >= since && r.category === 'telemetry-egress').slice(0, 100);
    const store = await getRevocationStore();
    revocations = store ? await store.list() : [];
  }

  async function revokeRow(row: LedgerRow): Promise<void> {
    const store = await getRevocationStore();
    if (!store) return;
    busy = true;
    try {
      await store.revoke(row.app, row.capability);
      notice = `Revoked ${row.capability} for ${row.app}.`;
      await reload();
    } finally {
      busy = false;
    }
  }

  async function restoreRevocation(record: RevocationRecord): Promise<void> {
    const store = await getRevocationStore();
    if (!store) return;
    busy = true;
    try {
      await store.restore(record.app, record.capability);
      notice = `Restored ${record.capability} for ${record.app}.`;
      await reload();
    } finally {
      busy = false;
    }
  }

  async function exportAll(): Promise<void> {
    const ledger = await getLedger();
    if (!ledger) return;
    busy = true;
    try {
      const all = await ledger.exportAll();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shippie-trust-ledger-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice = `Exported ${all.length} rows.`;
    } finally {
      busy = false;
    }
  }

  async function wipeAll(): Promise<void> {
    if (!confirm('Wipe every Trust Ledger row on this device? This cannot be undone.')) return;
    const ledger = await getLedger();
    if (!ledger) return;
    busy = true;
    try {
      const count = await ledger.wipe();
      notice = `Wiped ${count} rows.`;
      await reload();
    } finally {
      busy = false;
    }
  }

  async function applyRetention(ms: number): Promise<void> {
    retentionMs = ms;
    if (typeof localStorage !== 'undefined') localStorage.setItem(RETENTION_KEY, String(ms));
    const ledger = await getLedger();
    if (!ledger) return;
    busy = true;
    try {
      const cutoff = ms > 0 ? Date.now() - ms : Date.now();
      const deleted = await ledger.sweepRetention(cutoff);
      notice = `Retention set to ${ms === 0 ? 'session only' : formatMs(ms)}; swept ${deleted} rows.`;
      await reload();
    } finally {
      busy = false;
    }
  }

  function formatMs(ms: number): string {
    const days = Math.round(ms / (24 * 3600 * 1000));
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
    const hours = Math.round(ms / (3600 * 1000));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  function formatTs(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<svelte:head>
  <title>Trust Center — Shippie</title>
  <meta name="description" content="What every installed app has recorded on this device." />
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="trust-center">
  <header>
    <h1>Trust Center</h1>
    <p>What every installed app has recorded on this device. This data never leaves your device.</p>
  </header>

  {#if notice}
    <p class="notice">{notice}</p>
  {/if}
  {#if error}
    <p class="notice notice--error">{error}</p>
  {/if}

  {#if loading}
    <p class="trust-empty">Reading the local ledger…</p>
  {:else}
    <section>
      <h2>Active revocations</h2>
      {#if revocations.length === 0}
        <p class="trust-empty">No revocations active.</p>
      {:else}
        <ul class="revocations">
          {#each revocations as record (record.id)}
            <li>
              <strong>{record.app}</strong> · <code>{record.capability}</code>
              <span class="trust-muted">since {formatTs(record.revokedAt)}</span>
              <button class="btn btn--ghost" disabled={busy} onclick={() => restoreRevocation(record)}>
                Restore
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h2>Recent activity (24h)</h2>
      {#if rows.length === 0}
        <p class="trust-empty">No bridge activity recorded.</p>
      {:else}
        <ol class="trust-list">
          {#each rows as row (row.id)}
            <li class="trust-row trust-row--{row.outcome}">
              <span class="trust-app">{row.app}</span>
              <span class="trust-capability"><code>{row.capability}</code></span>
              <span class="trust-summary">{row.summary}</span>
              <button
                class="btn btn--ghost btn--small"
                disabled={busy}
                onclick={() => revokeRow(row)}
                title="Revoke this capability for this app"
              >
                Revoke
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section>
      <h2>Telemetry mirrored from this device (24h)</h2>
      <p class="trust-muted">Every event Shippie's platform was told about this device.</p>
      {#if telemetryRows.length === 0}
        <p class="trust-empty">No telemetry has been sent in the last 24h.</p>
      {:else}
        <ol class="trust-list">
          {#each telemetryRows as row (row.id)}
            <li class="trust-row">
              <span class="trust-app">{row.source ?? 'unknown'}</span>
              <span class="trust-summary">{row.summary}</span>
              <span class="trust-host">{row.target_host}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section>
      <h2>Retention</h2>
      <div class="retention">
        {#each RETENTION_PRESETS as preset}
          <button
            class="btn btn--toggle"
            class:btn--toggle-active={retentionMs === preset.ms}
            disabled={busy}
            onclick={() => applyRetention(preset.ms)}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2>Your data</h2>
      <div class="actions">
        <button class="btn" disabled={busy} onclick={exportAll}>Export all rows (JSON)</button>
        <button class="btn btn--danger" disabled={busy} onclick={wipeAll}>Wipe ledger</button>
      </div>
    </section>
  {/if}
</main>

<style>
  .trust-center {
    max-width: 880px;
    margin: 0 auto;
    padding: var(--space-lg, 1.5rem) var(--space-md, 1rem);
    font-family: var(--font-sans, system-ui, sans-serif);
    color: var(--ink-primary, #1a1a1a);
    overflow-x: clip;
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
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink-muted, #666);
  }

  .notice {
    margin: 0.5rem 0;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--surface-soft, #f7f4ee);
  }

  .notice--error {
    background: var(--surface-warning, #fef6e4);
    color: var(--ink-warning, #4a3000);
  }

  .trust-muted {
    color: var(--ink-muted, #666);
    font-size: 0.875rem;
  }

  .trust-empty {
    color: var(--ink-muted, #666);
  }

  .revocations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .revocations li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface-soft, #f7f4ee);
    border-radius: 0.5rem;
  }

  .trust-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .trust-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 8rem 12rem 1fr auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--surface-soft, #f7f4ee);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .trust-row--denied,
  .trust-row--fail-closed {
    background: var(--surface-warning, #fef6e4);
  }

  .trust-app {
    font-weight: 500;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .trust-capability code,
  .trust-host {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: 0.8rem;
    color: var(--ink-muted, #666);
    overflow-wrap: anywhere;
  }

  .trust-summary {
    word-break: break-word;
  }

  .retention {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .btn {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0.9rem;
    border-radius: 0.4rem;
    border: 1px solid var(--border-default, #cfc6b3);
    background: var(--surface-default, #ffffff);
    color: var(--ink-primary, #1a1a1a);
    font: inherit;
    cursor: pointer;
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

  .btn--small {
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
  }

  .btn--toggle {
    padding: 0.4rem 0.8rem;
  }

  .btn--toggle-active {
    background: var(--ink-primary, #1a1a1a);
    color: var(--surface-default, #fff);
    border-color: var(--ink-primary, #1a1a1a);
  }

  .btn--danger {
    border-color: var(--border-warning, #f3c969);
    color: var(--ink-warning, #4a3000);
  }

  @media (max-width: 640px) {
    .trust-row {
      grid-template-columns: 1fr;
      gap: 0.35rem;
      align-items: start;
    }

    .trust-capability,
    .trust-host,
    .trust-summary {
      min-width: 0;
    }

    .retention,
    .actions {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
