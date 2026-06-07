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
</script>

<svelte:head><title>Feedback · Maker</title></svelte:head>

<header>
  <h1>Feedback inbox</h1>
  <p class="lede">{data.counts.total} apps · {data.items.length} items</p>
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
        title="Awaiting moderator review. Public visibility is paused until admin clears these."
      >
        Awaiting review <span>{counts.reviewing}</span>
      </button>
    {/if}
    {#if counts.hidden > 0}
      <button
        type="button"
        class="chip"
        class:active={filterStatus === 'hidden'}
        onclick={() => (filterStatus = 'hidden')}
      >
        Hidden <span>{counts.hidden}</span>
      </button>
    {/if}
    {#if counts.spam > 0}
      <button
        type="button"
        class="chip"
        class:active={filterStatus === 'spam'}
        onclick={() => (filterStatus = 'spam')}
      >
        Spam <span>{counts.spam}</span>
      </button>
    {/if}
    {#if counts.resolved > 0}
      <button
        type="button"
        class="chip"
        class:active={filterStatus === 'resolved'}
        onclick={() => (filterStatus = 'resolved')}
      >
        Resolved <span>{counts.resolved}</span>
      </button>
    {/if}
  </div>
  {#if counts.reviewing > 0}
    <p class="reviewing-note">
      {counts.reviewing} item{counts.reviewing === 1 ? ' is' : 's are'} awaiting moderator review. These
      are not visible publicly while flagged, but you can see them here so nothing's hidden from you.
    </p>
  {/if}
</header>

{#if data.items.length === 0}
  <section class="empty">
    <h2>No feedback yet</h2>
    <p>Once visitors send feedback or rate an app, it lands here.</p>
  </section>
{:else if filteredItems.length === 0}
  <section class="empty">
    <h2>Nothing in this status</h2>
    <p>Try a different filter, or switch back to <button type="button" class="link-btn" onclick={() => (filterStatus = 'all')}>All</button>.</p>
  </section>
{:else}
  <section class="feedback-list" aria-label="Feedback inbox">
    {#each filteredItems as item (item.id)}
      <article>
        <div class="row">
          <a href={`/maker/apps/${item.appSlug}`}>{item.appName}</a>
          <span>{item.type}</span>
          <span class:open={item.status === 'open'}>{item.status}</span>
          {#if item.rating}<strong>{item.rating}/5</strong>{/if}
        </div>
        {#if item.title}<h2>{item.title}</h2>{/if}
        {#if item.body}<p>{item.body}</p>{/if}
        <small>{item.createdAt} · {item.voteCount} votes</small>
      </article>
    {/each}
  </section>
{/if}

<style>
  header { margin-bottom: 1.5rem; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: var(--text-title); margin: 0.25rem 0; letter-spacing: 0; }
  .lede { color: var(--text-muted-warm); margin: 0; }
  .status-summary { display: flex; gap: 0.4rem; margin-top: 0.8rem; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.65rem; font-family: ui-monospace, monospace; font-size: var(--text-caption);
    text-transform: uppercase; letter-spacing: 0.06em;
    background: transparent; color: inherit;
    border: 1px solid var(--paper-cream); cursor: pointer; min-height: var(--touch-min, 44px);
    border-radius: 0;
  }
  .chip:hover { background: rgba(232, 96, 60, 0.06); }
  .chip.active { background: var(--ink-near-black); color: var(--paper-warm-deep); border-color: var(--ink-near-black); }
  .chip.flagged { border-color: rgba(232, 96, 60, 0.45); color: var(--sunset-dim); }
  .chip.flagged.active { background: var(--sunset-dim); color: var(--paper-warm-deep); }
  .chip span { font-weight: 700; opacity: 0.8; }
  .reviewing-note {
    margin: 0.8rem 0 0;
    padding: 0.7rem 0.85rem;
    background: rgba(232, 96, 60, 0.06);
    border-left: 3px solid var(--sunset);
    font-size: var(--text-body);
    color: var(--ink-soft-warm);
  }
  .link-btn { background: none; border: 0; color: var(--sunset); text-decoration: underline; cursor: pointer; padding: 0; font: inherit; }
  .empty { padding: 4rem 2rem; text-align: center; border: 1px dashed var(--border-paper-mid); border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: var(--text-heading); margin: 0.5rem 0; }
  .feedback-list { display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--paper-cream); }
  article { padding: 1rem 0; border-bottom: 1px solid var(--paper-cream); }
  article h2 { font-size: var(--text-lede); margin: 0.65rem 0 0.25rem; }
  article p { margin: 0; color: var(--ink-soft-warm); max-width: 72ch; }
  small { display: block; margin-top: 0.55rem; color: var(--text-muted-warm); font-family: ui-monospace, monospace; font-size: var(--text-caption); }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-family: ui-monospace, monospace; font-size: var(--text-caption); text-transform: uppercase; letter-spacing: 0.08em; }
  .row a { color: var(--sunset); text-decoration: none; }
  .row span, .row strong { border: 1px solid var(--paper-cream); padding: 2px 7px; font-weight: 600; }
  .row .open { border-color: rgba(46,125,91,0.35); color: var(--success); }
  @media (prefers-color-scheme: dark) {
    .empty { border-color: var(--ink-warm-mid); }
    .feedback-list, article { border-color: var(--ink-warm); }
    article p { color: var(--text-secondary); }
    .row span, .row strong { border-color: var(--ink-warm-mid); }
  }
</style>
