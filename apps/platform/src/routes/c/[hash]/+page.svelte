<script lang="ts">
  import type { PageData } from './$types';
  import EntryNav from '$lib/components/layout/EntryNav.svelte';
  import { toast } from '$lib/stores/toast';
  import { encodeBlobToFragment } from '@shippie/share';

  let { data }: { data: PageData } = $props();

  const blob = $derived(data.blob);
  const author = $derived(blob.author?.name ?? 'unnamed device');
  const fingerprint = $derived(blob.author?.pubkey?.slice(0, 12) ?? '');
  const verifiedBadge = $derived(
    data.verified
      ? { kind: 'ok', label: '✓ signature verified' }
      : data.verifyReason === 'tampered'
        ? { kind: 'err', label: '✗ signature does not match — modified in transit' }
        : { kind: 'warn', label: '⚠ unverified — your browser cannot check the signature' },
  );

  const expiresLabel = $derived(
    data.expires_at
      ? `expires ${new Date(data.expires_at).toLocaleDateString()}`
      : null,
  );

  type RecipePayload = {
    title: string;
    notes?: string | null;
    servings?: number | null;
    cook_minutes?: number | null;
    ingredients?: Array<{ name: string; amount?: string | null; unit?: string | null }>;
  };
  type JournalPayload = { title?: string | null; body: string; sentiment_label?: string | null; topic?: string | null };
  type MemoryPayload = { content?: string | null; photo_data_url?: string | null; memory_date: string };
  type VisitPayload = { name: string; notes?: string | null; rating?: number | null; visitedAt: string; photoDataUrl?: string | null };

  const targetApp = $derived(
    blob.type === 'recipe'
      ? { slug: 'palate', name: 'Palate' }
      : blob.type === 'journal-entry'
        ? { slug: 'journal', name: 'Journal' }
        : blob.type === 'restaurant-visit'
          ? { slug: 'restaurant-memory', name: 'Restaurant Memory' }
          : blob.type === 'mevrouw-memory'
            ? { slug: 'mevrouw', name: 'Mevrouw' }
            : null,
  );
  const railActions = $derived(
    targetApp
      ? [{ href: `/${targetApp.slug}`, label: 'Open tool' }]
      : [{ href: '/tools', label: 'Browse tools' }],
  );

  let openUrl = $state<string | null>(null);
  $effect(() => {
    void (async () => {
      if (!targetApp) return;
      const fragment = await encodeBlobToFragment(blob);
      openUrl = `https://shippie.app/${targetApp.slug}#shippie-import=${fragment}`;
    })();
  });

  async function copyOpenUrl() {
    if (!openUrl) return;
    try {
      await navigator.clipboard.writeText(openUrl);
      toast.push({ kind: 'success', message: 'Link copied. Paste it on your phone to import.' });
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy. Long-press the link to copy manually.' });
    }
  }
</script>

<svelte:head>
  <title>{blob.type === 'recipe' ? 'Recipe' : blob.type === 'journal-entry' ? 'Journal entry' : blob.type === 'restaurant-visit' ? 'Restaurant memory' : 'A memory'} · Shippie</title>
  <meta name="robots" content="noindex,nofollow" />
  <meta name="description" content="A pinned local-first share. Anonymous, signature-verified, expires after 90 days." />
</svelte:head>

<main class="wrap">
  <EntryNav actions={railActions} />

  <article class="pinned">
    <header class="pinned-header">
      <p class="eyebrow">pinned · anonymous · {expiresLabel ?? '90-day window'}</p>
      <p class="badge badge-{verifiedBadge.kind}">{verifiedBadge.label}</p>
    </header>

    {#if blob.type === 'recipe'}
      {@const r = blob.payload as RecipePayload}
      <h1>{r.title}</h1>
      {#if r.cook_minutes || r.servings}
        <p class="meta">
          {#if r.cook_minutes}{r.cook_minutes} min{/if}
          {#if r.cook_minutes && r.servings} · {/if}
          {#if r.servings}serves {r.servings}{/if}
        </p>
      {/if}
      {#if r.ingredients && r.ingredients.length > 0}
        <h2>Ingredients</h2>
        <ul class="ingredients">
          {#each r.ingredients as ing}
            <li>
              {#if ing.amount}<strong>{ing.amount}</strong>{/if}
              {#if ing.unit}<em>{ing.unit}</em>{/if}
              {ing.name}
            </li>
          {/each}
        </ul>
      {/if}
      {#if r.notes}
        <h2>Notes</h2>
        <p class="notes">{r.notes}</p>
      {/if}
    {:else if blob.type === 'journal-entry'}
      {@const j = blob.payload as JournalPayload}
      {#if j.title}<h1>{j.title}</h1>{/if}
      {#if j.sentiment_label || j.topic}
        <p class="meta">
          {#if j.sentiment_label}mood: {j.sentiment_label}{/if}
          {#if j.sentiment_label && j.topic} · {/if}
          {#if j.topic}topic: {j.topic}{/if}
        </p>
      {/if}
      <p class="notes">{j.body}</p>
    {:else if blob.type === 'restaurant-visit'}
      {@const v = blob.payload as VisitPayload}
      <h1>{v.name}</h1>
      {#if v.photoDataUrl}
        <img src={v.photoDataUrl} alt="" class="photo" />
      {/if}
      <p class="meta">
        {new Date(v.visitedAt).toLocaleDateString()}
        {#if v.rating} · {v.rating}/5{/if}
      </p>
      {#if v.notes}<p class="notes">{v.notes}</p>{/if}
    {:else if blob.type === 'mevrouw-memory'}
      {@const m = blob.payload as MemoryPayload}
      <p class="meta">{new Date(m.memory_date).toLocaleDateString()}</p>
      {#if m.photo_data_url}
        <img src={m.photo_data_url} alt="" class="photo" />
      {/if}
      {#if m.content}<p class="notes">{m.content}</p>{/if}
    {:else}
      <h1>Pinned content</h1>
      <p class="meta">type: {blob.type}</p>
      <pre class="raw">{JSON.stringify(blob.payload, null, 2)}</pre>
    {/if}

    <footer class="pinned-footer">
      <p class="muted">
        signed by <strong>{author}</strong>
        <span class="fingerprint">{fingerprint}…</span>
      </p>

      {#if targetApp && openUrl}
        <div class="cta-row">
          <a class="primary-cta" href={openUrl}>Open in {targetApp.name}</a>
          <button type="button" class="secondary-cta" onclick={copyOpenUrl}>
            Copy import link
          </button>
        </div>
        <p class="muted small">
          Don't have {targetApp.name}? Visit
          <a href={`https://shippie.app/tools?q=${encodeURIComponent(targetApp.slug)}`}>
            shippie.app/tools
          </a>
          to find it, then come back to this URL.
        </p>
      {:else}
        <p class="muted small">No matching Shippie app for type "{blob.type}" yet.</p>
      {/if}
    </footer>
  </article>
</main>

<style>
  .wrap {
    max-width: 680px;
    margin: 0 auto;
    padding: calc(var(--safe-top, 0px) + var(--space-md)) var(--space-md) calc(var(--safe-bottom, 0px) + var(--space-xl));
    display: grid;
    gap: 1rem;
  }
  .pinned {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 3px solid var(--sunset);
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .pinned-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-light);
    margin: 0;
  }
  .badge {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.04em;
    margin: 0;
  }
  .badge-ok { color: var(--sunset); }
  .badge-warn { color: var(--marigold); }
  .badge-err { color: var(--sunset); }

  h1 {
    font-family: var(--font-heading);
    font-size: var(--text-display);
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  h2 {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-light);
    margin: var(--space-md) 0 0;
  }
  .meta {
    font-family: var(--font-mono);
    font-size: var(--text-small);
    color: var(--text-secondary);
    margin: 0;
  }
  .photo {
    width: 100%;
    max-height: 360px;
    object-fit: cover;
    border: 1px solid var(--border);
  }
  .ingredients {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ingredients strong { font-variant-numeric: tabular-nums; }
  .ingredients em { font-style: normal; opacity: 0.7; }
  .notes {
    margin: 0;
    font-size: var(--text-body);
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .raw {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    background: var(--bg-pure);
    padding: var(--space-md);
    overflow-x: auto;
    border: 1px solid var(--border);
  }
  .pinned-footer {
    border-top: 1px solid var(--border);
    padding-top: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .muted { color: var(--text-secondary); margin: 0; font-size: var(--text-small); }
  .muted.small { font-size: var(--text-caption); }
  .fingerprint { font-family: var(--font-mono); font-size: var(--text-caption); opacity: 0.6; }
  .cta-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .primary-cta {
    background: var(--sunset);
    color: var(--bg-pure);
    padding: 12px 18px;
    font-family: var(--font-mono);
    font-size: var(--text-small);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-decoration: none;
    border-radius: 0;
    flex: 1;
    text-align: center;
    min-width: 200px;
  }
  .primary-cta:hover { background: var(--sunset-hover); }
  .secondary-cta {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    padding: 12px 18px;
    font-family: var(--font-mono);
    font-size: var(--text-small);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    border-radius: 0;
  }
  .secondary-cta:hover { border-color: var(--text-secondary); }
  @media (max-width: 640px) {
    .wrap {
      padding: calc(var(--safe-top, 0px) + 0.75rem) 1rem calc(var(--safe-bottom, 0px) + 1.25rem);
    }
    .pinned {
      padding: 1rem;
      gap: 1rem;
    }
    .pinned-header {
      gap: 0.5rem;
    }
    h1 {
      font-size: var(--text-display);
    }
    .cta-row {
      display: grid;
    }
    .primary-cta,
    .secondary-cta {
      width: 100%;
      min-width: 0;
      min-height: var(--touch-min, 44px);
      box-sizing: border-box;
    }
  }
</style>
