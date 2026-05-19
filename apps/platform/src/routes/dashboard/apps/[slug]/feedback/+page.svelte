<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const counts = $derived.by(() => {
    const c = { open: 0, reviewing: 0, hidden: 0, spam: 0, resolved: 0, other: 0 };
    for (const item of data.items) {
      const s = (item.status ?? 'open') as keyof typeof c;
      if (s in c) c[s]++;
      else c.other++;
    }
    return c;
  });

  let filterStatus = $state<'all' | 'open' | 'reviewing' | 'hidden' | 'spam' | 'resolved'>('all');
  const filteredItems = $derived(
    filterStatus === 'all'
      ? data.items
      : data.items.filter((item) => (item.status ?? 'open') === filterStatus),
  );

  function buildSdkSnippet(): string {
    return `import { shippie } from '@shippie/sdk';

shippie.feedback.submit({
  type: 'idea',
  body: 'I would love…',
});`;
  }
  function buildButtonSnippet(): string {
    return `<button id="shippie-feedback">Share feedback</button>
<script type="module">
  import { shippie } from 'https://cdn.shippie.app/sdk/v1.latest.js';
  document.getElementById('shippie-feedback')?.addEventListener('click', () => {
    shippie.feedback.open('idea');
  });
</` + `script>`;
  }
</script>

<svelte:head><title>Feedback · {data.app.name}</title></svelte:head>

<header>
  <p class="eyebrow">
    <a href="/dashboard">Dashboard</a> ·
    <a href={`/dashboard/apps/${data.app.slug}`}>{data.app.name}</a> ·
    feedback
  </p>
  <h1>Feedback</h1>
  <p class="lede">
    Private inbox for {data.app.name}. Items appear here as users submit them.
    Only you see this — publish individual items later if you want a public roadmap.
  </p>
  <div class="status-summary" aria-label="Status breakdown">
    <button
      type="button"
      class="chip"
      class:active={filterStatus === 'all'}
      onclick={() => (filterStatus = 'all')}
    >
      All <span>{data.items.length}</span>
    </button>
    <button
      type="button"
      class="chip"
      class:active={filterStatus === 'open'}
      onclick={() => (filterStatus = 'open')}
    >
      Open <span>{counts.open}</span>
    </button>
    {#if counts.reviewing > 0}
      <button
        type="button"
        class="chip flagged"
        class:active={filterStatus === 'reviewing'}
        onclick={() => (filterStatus = 'reviewing')}
        title="Awaiting moderator review. Not public yet."
      >
        Awaiting review <span>{counts.reviewing}</span>
      </button>
    {/if}
    {#if counts.spam > 0}
      <button type="button" class="chip" class:active={filterStatus === 'spam'} onclick={() => (filterStatus = 'spam')}>
        Spam <span>{counts.spam}</span>
      </button>
    {/if}
    {#if counts.hidden > 0}
      <button type="button" class="chip" class:active={filterStatus === 'hidden'} onclick={() => (filterStatus = 'hidden')}>
        Hidden <span>{counts.hidden}</span>
      </button>
    {/if}
    {#if counts.resolved > 0}
      <button type="button" class="chip" class:active={filterStatus === 'resolved'} onclick={() => (filterStatus = 'resolved')}>
        Resolved <span>{counts.resolved}</span>
      </button>
    {/if}
  </div>
</header>

{#if data.items.length === 0}
  <section class="empty">
    <h2>No feedback yet</h2>
    <p class="lede">Add a feedback affordance to your app and submissions land here.</p>
    <details open class="snippet">
      <summary>Add it in one paste</summary>
      <div class="snippet-tabs">
        <details open>
          <summary>SDK (npm)</summary>
          <pre>{buildSdkSnippet()}</pre>
        </details>
        <details>
          <summary>Plain HTML</summary>
          <pre>{buildButtonSnippet()}</pre>
        </details>
      </div>
    </details>
  </section>
{:else}
  {#if filteredItems.length === 0}
    <section class="empty">
      <h2>Nothing in this status</h2>
      <p>
        Try a different filter, or switch back to
        <button type="button" class="link-btn" onclick={() => (filterStatus = 'all')}>All</button>.
      </p>
    </section>
  {:else}
    <section class="feedback-list" aria-label="Feedback inbox">
      {#each filteredItems as item (item.id)}
        <article>
          <div class="row">
            <span>{item.type}</span>
            <span class:open={item.status === 'open'} class:flagged={item.status === 'reviewing' || item.status === 'spam'}>{item.status}</span>
            {#if item.rating}<strong>{item.rating}/5</strong>{/if}
            {#if item.externalUserDisplay}<span class="user">{item.externalUserDisplay}</span>{/if}
          </div>
          {#if item.title}<h2>{item.title}</h2>{/if}
          {#if item.body}<p>{item.body}</p>{/if}
          {#if Array.isArray(item.metadata?.moderation_flags) && item.metadata.moderation_flags.length > 0}
            <div class="flags">
              {#each item.metadata.moderation_flags as flag}<span>{flag}</span>{/each}
            </div>
          {/if}
          <form method="POST" action="?/setStatus" class="item-actions">
            <input type="hidden" name="id" value={item.id} />
            <button name="status" value="open" type="submit" disabled={item.status === 'open'}>Reopen</button>
            <button name="status" value="resolved" type="submit" disabled={item.status === 'resolved'}>Mark resolved</button>
            <button name="status" value="hidden" type="submit" disabled={item.status === 'hidden'}>Hide</button>
          </form>
          <small>{item.createdAt} · {item.voteCount} votes</small>
        </article>
      {/each}
    </section>
  {/if}
{/if}

<style>
  header { margin-bottom: 1.5rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8603C; margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; margin: 0.25rem 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; margin: 0 0 0.5rem; max-width: 64ch; }
  .status-summary { display: flex; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.65rem; font-family: ui-monospace, monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em;
    background: transparent; color: inherit;
    border: 1px solid #E5DDC8; cursor: pointer; min-height: var(--touch-min, 44px);
    border-radius: 0;
  }
  .chip:hover { background: rgba(232, 96, 60, 0.06); }
  .chip.active { background: #1a1a1a; color: #FAF5E9; border-color: #1a1a1a; }
  .chip.flagged { border-color: rgba(232, 96, 60, 0.45); color: #C84A2A; }
  .chip.flagged.active { background: #C84A2A; color: #FAF5E9; }
  .chip span { font-weight: 700; opacity: 0.8; }
  .link-btn { background: none; border: 0; color: #E8603C; text-decoration: underline; cursor: pointer; padding: 0; font: inherit; }
  .empty { padding: 2rem; text-align: center; border: 1px dashed #C9C2B1; border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  .feedback-list { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #E5DDC8; }
  article { padding: 1rem 0; border-bottom: 1px solid #E5DDC8; }
  article h2 { font-size: 1.1rem; margin: 0.65rem 0 0.25rem; }
  article p { margin: 0; color: #5C5751; max-width: 72ch; }
  small { display: block; margin-top: 0.55rem; color: #8B847A; font-family: ui-monospace, monospace; font-size: 11px; }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .row span, .row strong { border: 1px solid #E5DDC8; padding: 2px 7px; font-weight: 600; }
  .row .open { border-color: rgba(46,125,91,0.35); color: #2E7D5B; }
  .row .flagged { border-color: rgba(232,96,60,0.45); color: #C84A2A; }
  .row .user { color: #8B847A; }
  .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.55rem 0 0; }
  .flags span { border: 1px solid rgba(232,197,71,0.38); color: #B49100; padding: 2px 7px; font-family: ui-monospace, monospace; font-size: 11px; }
  .item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.65rem;
  }
  .item-actions button {
    min-height: var(--touch-min, 44px);
    border: 1px solid #E5DDC8;
    background: transparent;
    color: #E8603C;
    padding: 0 0.65rem;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .item-actions button:disabled {
    color: #8B847A;
    cursor: not-allowed;
    opacity: 0.65;
  }
  .snippet { margin-top: 1rem; text-align: left; padding: 0.75rem 1rem; border: 1px dashed #C9C2B1; }
  .snippet > summary { cursor: pointer; font-weight: 600; color: #E8603C; min-height: var(--touch-min, 44px); display: flex; align-items: center; }
  .snippet-tabs { display: grid; gap: 0.5rem; margin-top: 0.5rem; }
  .snippet-tabs > details > summary { cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px; text-transform: uppercase; padding: 0.3rem 0; }
  pre { font-family: ui-monospace, monospace; font-size: 12px; padding: 0.6rem; background: rgba(0,0,0,0.04); margin: 0; overflow-x: auto; white-space: pre; }
  @media (prefers-color-scheme: dark) {
    .empty, .feedback-list, article { border-color: #2A251E; }
    .row span, .row strong { border-color: #3A352D; }
    article p { color: #B8A88F; }
    pre { background: rgba(255,255,255,0.04); }
  }
</style>
