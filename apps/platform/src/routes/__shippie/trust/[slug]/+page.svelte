<!--
  Minimal per-app Trust Ledger timeline (5A).

  Reads the local Trust Ledger via the host singleton, decrypts the
  last 24h of rows for the requested slug, and renders a read-only
  timeline. No revoke controls (those land in 5B). No cross-app view
  (that's the Trust Center in 5B).

  SSR-safe: the server returns the chrome + slug; the client hydrates
  and reads IDB after mount.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getLedger } from '$lib/trust-ledger/host';
  import type { LedgerRow } from '@shippie/trust-ledger';

  const slug = $derived($page.params.slug ?? '');
  let rows = $state<LedgerRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let egressVisibility = $state<'full' | 'bridge-only' | 'unknown'>('unknown');

  onMount(async () => {
    try {
      const ledger = await getLedger();
      if (!ledger) {
        error = 'Trust Ledger is unavailable in this environment.';
        loading = false;
        return;
      }
      const since = Date.now() - 24 * 3600 * 1000;
      const result = await ledger.readApp(slug, { since, limit: 500 });
      rows = result;
      const visibility = result.find((r) => r.egress_visibility)?.egress_visibility;
      egressVisibility = visibility ?? 'unknown';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  });

  function formatTs(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function formatBytes(n: number | undefined): string {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<svelte:head>
  <title>Trust Ledger — {slug} — Shippie</title>
  <meta name="description" content="Per-app activity recorded on this device." />
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="trust-page">
  <header class="trust-header">
    <h1>Trust Ledger</h1>
    <p class="trust-slug">{slug}</p>
    {#if egressVisibility === 'bridge-only'}
      <p class="trust-banner trust-banner--bridge-only">
        This app runs on its own origin. Shippie records what passes through the bridge;
        activity that stays inside the app is not enumerable here.
      </p>
    {/if}
  </header>

  <section class="trust-body">
    <h2>Last 24 hours</h2>

    {#if loading}
      <p class="trust-empty">Reading the local ledger…</p>
    {:else if error}
      <p class="trust-empty trust-empty--error">{error}</p>
    {:else if rows.length === 0}
      <p class="trust-empty">No activity recorded for {slug} in the last 24 hours.</p>
    {:else}
      <ol class="trust-list">
        {#each rows as row (row.id)}
          <li class="trust-row trust-row--{row.outcome}">
            <span class="trust-ts">{formatTs(row.ts)}</span>
            <span class="trust-summary">{row.summary}</span>
            {#if row.target_host}
              <span class="trust-host">{row.target_host}</span>
            {/if}
            {#if row.bytes_in || row.bytes_out}
              <span class="trust-bytes">
                {#if row.bytes_out}↑ {formatBytes(row.bytes_out)}{/if}
                {#if row.bytes_in}↓ {formatBytes(row.bytes_in)}{/if}
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <footer class="trust-footer">
    <p>This ledger lives on your device. It is encrypted with a key derived from your Vault. Spec 5A.</p>
  </footer>
</main>

<style>
  .trust-page {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-lg, 1.5rem) var(--space-md, 1rem);
    font-family: var(--font-sans, system-ui, sans-serif);
    color: var(--ink-primary, #1a1a1a);
    overflow-x: clip;
  }

  .trust-header h1 {
    margin: 0;
    font-size: var(--text-heading);
    font-weight: 600;
  }

  .trust-slug {
    margin: 0.25rem 0 1rem;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: var(--text-body);
    color: var(--ink-muted, #666);
  }

  .trust-banner {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: var(--text-small);
    line-height: 1.5;
  }

  .trust-banner--bridge-only {
    background: var(--surface-warning, #fef6e4);
    border: 1px solid var(--border-warning, #f3c969);
    color: var(--ink-warning, #4a3000);
  }

  .trust-body h2 {
    margin: 1rem 0 0.5rem;
    font-size: var(--text-body);
    font-weight: 500;
    color: var(--ink-muted, #666);
  }

  .trust-empty {
    margin: 1rem 0;
    color: var(--ink-muted, #666);
  }

  .trust-empty--error {
    color: var(--ink-warning, #a04000);
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
    grid-template-columns: 3.5rem 1fr auto auto;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface-soft, #f7f4ee);
    font-size: var(--text-small);
    align-items: baseline;
  }

  .trust-row--denied {
    background: var(--surface-warning, #fef6e4);
  }

  .trust-row--fail-closed {
    background: var(--surface-warning, #fef6e4);
  }

  .trust-ts {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    color: var(--ink-muted, #666);
  }

  .trust-summary {
    word-break: break-word;
  }

  .trust-host {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: var(--text-small);
    color: var(--ink-muted, #666);
    overflow-wrap: anywhere;
  }

  .trust-bytes {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
    font-size: var(--text-small);
    color: var(--ink-muted, #666);
    white-space: nowrap;
  }

  .trust-footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-soft, #e8e0d2);
    font-size: var(--text-small);
    color: var(--ink-muted, #666);
  }

  @media (max-width: 640px) {
    .trust-row {
      grid-template-columns: 3.5rem minmax(0, 1fr);
      align-items: start;
    }

    .trust-host,
    .trust-bytes {
      grid-column: 2;
    }
  }
</style>
