<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Localize — Shippie</title>
</svelte:head>

<div class="page">
  <header class="header">
    <h1>Localize</h1>
    <p class="meta">
      Make this app run on your users' phones. Pure local-first transformation —
      no cloud database, no auth server, no third-party storage. Source migration only:
      every change is a reviewable diff.
    </p>
  </header>

  {#if !data.deploy}
    <div class="card empty">
      <p>No deploys yet. Push your code first; localize offers appear after the next deploy report.</p>
    </div>
  {:else if data.kind?.public === 'local'}
    <div class="card success">
      <h3>Already local-first</h3>
      <p>Shippie classified this app as <strong>{data.kind.public}</strong>. Nothing to localize.</p>
    </div>
  {:else if data.offers.length === 0}
    <div class="card empty">
      <h3>No localize offers found</h3>
      <p>
        Shippie classified this app as <strong>{data.kind?.public ?? 'connected'}</strong>,
        but couldn't detect a Supabase / Firebase / Auth.js pattern it can transform.
      </p>
      <p class="caveat">
        We currently support: Supabase basic CRUD, Supabase Storage, Auth.js / NextAuth sessions.
        Firebase Firestore + more land later.
      </p>
    </div>
  {:else}
    <p class="intro">
      Shippie detected {data.offers.length} transformation{data.offers.length === 1 ? '' : 's'} that
      would make this app local-first. Review the diff before applying.
    </p>

    <section class="offers">
      {#each data.offers as offer}
        <article class="card offer">
          <header class="offer-head">
            <h3>{offer.transform}</h3>
            <span class="counts">
              {offer.fileChangeCount} file{offer.fileChangeCount === 1 ? '' : 's'} modified ·
              {offer.newFileCount} new
            </span>
          </header>

          <p class="effect">{describeTransform(offer.transform)}</p>

          {#if offer.sampleFiles.length > 0}
            <div class="sample">
              <p>Sample files:</p>
              <ul>
                {#each offer.sampleFiles as file}<li><code>{file}</code></li>{/each}
              </ul>
            </div>
          {/if}

          {#if offer.warnings.length > 0}
            <div class="warnings">
              <p>Notes:</p>
              <ul>
                {#each offer.warnings as w}<li>{w}</li>{/each}
              </ul>
            </div>
          {/if}

          <div class="actions">
            <button class="btn-secondary" disabled>View full diff (coming soon)</button>
            <button class="btn-primary" disabled>Apply transform (coming soon)</button>
          </div>
          <p class="caveat">
            Apply-side workflow lands once we wire the writeable git/zip step. Today this is preview-only.
          </p>
        </article>
      {/each}
    </section>
  {/if}
</div>

<script lang="ts" context="module">
  function describeTransform(name: string): string {
    switch (name) {
      case 'supabase-basic-queries':
        return 'Replace Supabase client CRUD calls with shippie.local.db.* — your tables become local SQLite, no server.';
      case 'supabase-storage-to-local-files':
        return 'Replace Supabase Storage uploads with shippie.local.files.* — photos stay on the device.';
      case 'authjs-to-local-identity':
        return 'Strip Auth.js / NextAuth and use Shippie Local Identity — one user per device, no login flow.';
      default:
        return 'Source-migration transform — review the diff before applying.';
    }
  }
</script>

<style>
  .page {
    max-width: 1000px;
    margin: 0 auto;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  .header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }
  .meta {
    color: var(--text-secondary);
    font-size: 0.95rem;
    max-width: 60ch;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
  }
  .card h3 {
    margin: 0 0 0.5rem 0;
  }
  .empty p {
    color: var(--text-light);
    margin: 0.25rem 0;
  }
  .success {
    border-color: rgba(61, 139, 92, 0.3);
    background: rgba(61, 139, 92, 0.04);
  }
  .intro {
    color: var(--text-secondary);
  }
  .offers {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .offer-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }
  .offer-head h3 {
    font-family: var(--font-mono);
    font-size: 1rem;
    margin: 0;
  }
  .counts {
    font-size: 0.85rem;
    color: var(--text-light);
  }
  .effect {
    color: var(--text-secondary);
    margin: 0.5rem 0;
  }
  .sample, .warnings {
    margin-top: 0.75rem;
    font-size: 0.9rem;
  }
  .sample p, .warnings p {
    margin: 0 0 0.25rem 0;
    color: var(--text-secondary);
  }
  .sample ul, .warnings ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--text-light);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .btn-secondary, .btn-primary {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: not-allowed;
    opacity: 0.6;
  }
  .btn-secondary {
    background: var(--surface-alt);
    color: var(--text);
    border: 1px solid var(--border-light);
  }
  .btn-primary {
    background: var(--sunset);
    color: var(--bg-pure);
    border: 1px solid var(--sunset);
  }
  .caveat {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-light);
    font-style: italic;
  }
</style>
