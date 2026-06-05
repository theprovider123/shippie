<script lang="ts">
  import type { PageData } from './$types';
  import { MAKER_STATUSES, MAX_MAKER_REPLY_LEN, isMakerStatus, makerStatusLabel } from '$lib/feedback/status';
  let { data }: { data: PageData } = $props();

  function isHeld(status: string | null): boolean {
    return status === 'reviewing' || status === 'spam';
  }
  // A held/legacy item defaults the status selector to "open" so a maker
  // triages it forward rather than re-saving a moderation state.
  function defaultStatusFor(status: string | null): string {
    return isMakerStatus(status) ? status : 'open';
  }

  const counts = $derived.by(() => {
    const c = { open: 0, planned: 0, fixed: 0, closed: 0, held: 0 };
    for (const item of data.items) {
      const s = item.status ?? 'open';
      if (s === 'open') c.open++;
      else if (s === 'planned') c.planned++;
      else if (s === 'fixed') c.fixed++;
      else if (s === 'closed') c.closed++;
      else if (isHeld(s)) c.held++;
    }
    return c;
  });

  type Filter = 'all' | 'open' | 'planned' | 'fixed' | 'closed' | 'held';
  let filterStatus = $state<Filter>('all');
  const filteredItems = $derived.by(() => {
    if (filterStatus === 'all') return data.items;
    if (filterStatus === 'held') return data.items.filter((item) => isHeld(item.status));
    return data.items.filter((item) => (item.status ?? 'open') === filterStatus);
  });

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
    <a href="/maker">Maker</a> ·
    <a href={`/maker/apps/${data.app.slug}`}>{data.app.name}</a> ·
    feedback
  </p>
  <h1>Feedback</h1>
  <p class="lede">
    Private inbox for {data.app.name}. Items appear here as users submit them.
    Only you see this — publish individual items later if you want a public roadmap.
  </p>
  <div class="status-summary" aria-label="Status breakdown">
    <button type="button" class="chip" class:active={filterStatus === 'all'} onclick={() => (filterStatus = 'all')}>
      All <span>{data.items.length}</span>
    </button>
    <button type="button" class="chip" class:active={filterStatus === 'open'} onclick={() => (filterStatus = 'open')}>
      Open <span>{counts.open}</span>
    </button>
    <button type="button" class="chip" class:active={filterStatus === 'planned'} onclick={() => (filterStatus = 'planned')}>
      Planned <span>{counts.planned}</span>
    </button>
    <button type="button" class="chip" class:active={filterStatus === 'fixed'} onclick={() => (filterStatus = 'fixed')}>
      Fixed <span>{counts.fixed}</span>
    </button>
    <button type="button" class="chip" class:active={filterStatus === 'closed'} onclick={() => (filterStatus = 'closed')}>
      Closed <span>{counts.closed}</span>
    </button>
    {#if counts.held > 0}
      <button
        type="button"
        class="chip flagged"
        class:active={filterStatus === 'held'}
        onclick={() => (filterStatus = 'held')}
        title="Held for moderator review. Not public yet."
      >
        Held <span>{counts.held}</span>
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
            <span class:open={item.status === 'open'} class:flagged={isHeld(item.status)}>{makerStatusLabel(item.status ?? 'open')}</span>
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
          {#if item.makerReply}
            <p class="maker-reply"><span>Your reply</span>{item.makerReply}</p>
          {/if}
          <form method="POST" action="?/triage" class="triage">
            <input type="hidden" name="id" value={item.id} />
            <label class="triage-status">
              <span>Status</span>
              <select name="status">
                {#each MAKER_STATUSES as s}
                  <option value={s} selected={defaultStatusFor(item.status) === s}>{makerStatusLabel(s)}</option>
                {/each}
              </select>
            </label>
            <label class="triage-reply">
              <span>Reply to the user</span>
              <textarea name="reply" rows="2" maxlength={MAX_MAKER_REPLY_LEN} placeholder="Optional — shown in the user’s feedback history">{item.makerReply ?? ''}</textarea>
            </label>
            <button type="submit">Save</button>
          </form>
          <small>{item.createdAt} · {item.voteCount} votes</small>
        </article>
      {/each}
    </section>
  {/if}
{/if}

<style>
  header { margin-bottom: 1.5rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sunset); margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; margin: 0.25rem 0; letter-spacing: 0; }
  .lede { color: var(--text-muted-warm); margin: 0 0 0.5rem; max-width: 64ch; }
  .status-summary { display: flex; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.65rem; font-family: ui-monospace, monospace; font-size: 11px;
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
  .link-btn { background: none; border: 0; color: var(--sunset); text-decoration: underline; cursor: pointer; padding: 0; font: inherit; }
  .empty { padding: 2rem; text-align: center; border: 1px dashed var(--border-paper-mid); border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  .feedback-list { display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--paper-cream); }
  article { padding: 1rem 0; border-bottom: 1px solid var(--paper-cream); }
  article h2 { font-size: 1.1rem; margin: 0.65rem 0 0.25rem; }
  article p { margin: 0; color: var(--ink-soft-warm); max-width: 72ch; }
  small { display: block; margin-top: 0.55rem; color: var(--text-muted-warm); font-family: ui-monospace, monospace; font-size: 11px; }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .row span, .row strong { border: 1px solid var(--paper-cream); padding: 2px 7px; font-weight: 600; }
  .row .open { border-color: rgba(46,125,91,0.35); color: var(--success); }
  .row .flagged { border-color: rgba(232,96,60,0.45); color: var(--sunset-dim); }
  .row .user { color: var(--text-muted-warm); }
  .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.55rem 0 0; }
  .flags span { border: 1px solid rgba(232,197,71,0.38); color: var(--warning); padding: 2px 7px; font-family: ui-monospace, monospace; font-size: 11px; }
  .maker-reply {
    display: grid;
    gap: 0.2rem;
    margin: 0.65rem 0 0;
    padding: 0.55rem 0.7rem;
    border-left: 2px solid var(--sunset);
    background: rgba(232, 96, 60, 0.05);
    color: var(--ink-soft-warm);
    font-size: 0.95rem;
  }
  .maker-reply span {
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sunset);
  }
  .triage {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: end;
    margin-top: 0.7rem;
  }
  .triage label {
    display: grid;
    gap: 0.25rem;
  }
  .triage label span {
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted-warm);
  }
  .triage select,
  .triage textarea {
    min-height: var(--touch-min, 44px);
    border: 1px solid var(--paper-cream);
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: 14px;
    padding: 0.4rem 0.55rem;
    border-radius: 0;
  }
  .triage textarea {
    resize: vertical;
    line-height: 1.4;
  }
  .triage select:focus,
  .triage textarea:focus {
    outline: none;
    border-color: var(--sunset);
  }
  .triage button {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--sunset);
    background: var(--sunset);
    color: white;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0;
  }
  @media (max-width: 600px) {
    .triage {
      grid-template-columns: 1fr;
      align-items: stretch;
    }
  }
  .snippet { margin-top: 1rem; text-align: left; padding: 0.75rem 1rem; border: 1px dashed var(--border-paper-mid); }
  .snippet > summary { cursor: pointer; font-weight: 600; color: var(--sunset); min-height: var(--touch-min, 44px); display: flex; align-items: center; }
  .snippet-tabs { display: grid; gap: 0.5rem; margin-top: 0.5rem; }
  .snippet-tabs > details > summary { cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px; text-transform: uppercase; padding: 0.3rem 0; }
  pre { font-family: ui-monospace, monospace; font-size: 12px; padding: 0.6rem; background: rgba(0,0,0,0.04); margin: 0; overflow-x: auto; white-space: pre; }
  @media (prefers-color-scheme: dark) {
    .empty, .feedback-list, article { border-color: var(--ink-warm); }
    .row span, .row strong { border-color: var(--ink-warm-mid); }
    article p { color: var(--text-secondary); }
    pre { background: rgba(255,255,255,0.04); }
  }
</style>
