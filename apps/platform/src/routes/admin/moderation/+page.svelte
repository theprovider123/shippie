<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const statuses = ['reviewing', 'hidden', 'resolved', 'spam', 'open'];

  let selected = $state<Set<string>>(new Set());
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }
  function clearSelection() {
    selected = new Set();
  }
  function selectAllVisible() {
    selected = new Set(data.items.map((item) => item.id));
  }

  // Track q via a local input so we can show the controlled value without
  // resubmitting on every keystroke. The form actually navigates on submit.
  let qInput = $state(data.filters.q);
  let appSlugInput = $state(data.filters.appSlug);
</script>

<svelte:head><title>Moderation · Admin</title></svelte:head>

<header>
  <p>Admin</p>
  <h1>Moderation</h1>
  <span>{data.items.length} feedback items {data.filters.status !== 'all' || data.filters.q || data.filters.appSlug ? '(filtered)' : ''}</span>
</header>

{#if form?.ok}<p class="ok">Moderation status updated{form.count != null ? ` for ${form.count} item${form.count === 1 ? '' : 's'}` : ''}.</p>{/if}

<form method="GET" class="filters" aria-label="Feedback filters">
  <div class="filter-row">
    <label>
      <span>Status</span>
      <select name="status" onchange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}>
        <option value="all" selected={data.filters.status === 'all'}>All</option>
        {#each statuses as status}
          <option value={status} selected={data.filters.status === status}>{status}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>App slug</span>
      <input
        type="text"
        name="appSlug"
        value={appSlugInput}
        oninput={(e) => (appSlugInput = e.currentTarget.value)}
        placeholder="e.g. coffee"
      />
    </label>
    <label>
      <span>Search</span>
      <input
        type="text"
        name="q"
        value={qInput}
        oninput={(e) => (qInput = e.currentTarget.value)}
        placeholder="title, body, user, maker email"
      />
    </label>
    <button type="submit" class="filter-apply">Apply</button>
    {#if data.filters.status !== 'all' || data.filters.q || data.filters.appSlug}
      <a class="filter-clear" href="?">Clear</a>
    {/if}
  </div>
</form>

{#if selected.size > 0}
  <form method="POST" action="?/bulkSetStatus" class="bulk-bar" aria-label="Bulk actions">
    <span>{selected.size} selected</span>
    {#each [...selected] as id (id)}
      <input type="hidden" name="id" value={id} />
    {/each}
    {#each ['hidden', 'spam', 'resolved', 'open'] as status}
      <button type="submit" name="status" value={status}>Mark {status}</button>
    {/each}
    <button type="button" class="ghost" onclick={clearSelection}>Clear selection</button>
  </form>
{:else if data.items.length > 0}
  <div class="bulk-hint">
    <button type="button" class="ghost" onclick={selectAllVisible}>Select all visible</button>
    <span>Tip: tick rows to bulk-moderate.</span>
  </div>
{/if}

<section>
  {#each data.items as item (item.id)}
    <article class:selected={selected.has(item.id)}>
      <label class="bulk-select">
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onchange={() => toggle(item.id)}
          aria-label={`Select feedback ${item.id}`}
        />
      </label>
      <div class="content">
        <div class="meta">
          <a href={`/apps/${item.appSlug}`}>{item.appName}</a>
          <span>{item.type}</span>
          <span>{item.status}</span>
          {#if item.rating}<strong>{item.rating}/5</strong>{/if}
        </div>
        {#if item.title}<h2>{item.title}</h2>{/if}
        {#if item.body}<p>{item.body}</p>{/if}
        {#if Array.isArray(item.metadata?.moderation_flags) && item.metadata.moderation_flags.length > 0}
          <div class="flags">
            {#each item.metadata.moderation_flags as flag}
              <span>{flag}</span>
            {/each}
          </div>
        {/if}
        <small>{item.createdAt} · maker {item.makerEmail}</small>
        <form method="POST" action="?/setStatus">
          <input type="hidden" name="id" value={item.id} />
          {#each statuses as status}
            <button type="submit" name="status" value={status}>{status}</button>
          {/each}
        </form>
      </div>
    </article>
  {/each}
  {#if data.items.length === 0}
    <article class="empty">
      <p>No feedback matches the current filters.</p>
    </article>
  {/if}
</section>

<style>
  header { display: flex; gap: 1rem; align-items: end; margin-bottom: 1.5rem; }
  header p, header span { margin: 0; color: #B8A88F; font-family: ui-monospace, monospace; font-size: 12px; }
  h1 { margin: 0; font-size: 2rem; }
  .ok { color: #A8C491; }
  .filters { margin-bottom: 1rem; }
  .filter-row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: end; }
  .filter-row label { display: grid; gap: 0.2rem; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; color: #B8A88F; }
  .filter-row input, .filter-row select {
    padding: 0.4rem 0.55rem;
    background: #1E1A15;
    color: #EDE4D3;
    border: 1px solid #3A352D;
    font: inherit;
    min-height: var(--touch-min, 44px);
    min-width: 8rem;
  }
  .filter-apply, .filter-clear {
    padding: 0.4rem 0.85rem;
    background: transparent;
    color: #EDE4D3;
    border: 1px solid #3A352D;
    cursor: pointer;
    font: inherit;
    min-height: var(--touch-min, 44px);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .filter-apply:hover, .filter-clear:hover { border-color: #E8603C; color: #E8603C; }
  .bulk-bar {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
    padding: 0.6rem 0.8rem;
    background: #2A2520; color: #EDE4D3;
    border: 1px solid #3A352D;
    margin-bottom: 0.8rem;
  }
  .bulk-bar span { font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; color: #B8A88F; }
  .bulk-bar button { border: 1px solid #3A352D; background: transparent; color: #EDE4D3; padding: 0.35rem 0.6rem; cursor: pointer; min-height: var(--touch-min, 44px); }
  .bulk-bar button:hover { border-color: #E8603C; color: #E8603C; }
  .bulk-bar button.ghost { color: #8B847A; border-color: transparent; }
  .bulk-hint { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.6rem; color: #8B847A; font-size: 12px; }
  .bulk-hint button.ghost { background: transparent; color: #B8A88F; border: 1px dashed #3A352D; padding: 0.3rem 0.55rem; font: inherit; cursor: pointer; }
  section { border-top: 1px solid #2A251E; }
  article { display: grid; grid-template-columns: auto 1fr; gap: 0.75rem; padding: 1rem 0; border-bottom: 1px solid #2A251E; }
  article.selected { background: rgba(232, 96, 60, 0.05); }
  article.empty { display: block; color: #8B847A; padding: 2rem 0; text-align: center; border: 1px dashed #3A352D; }
  .bulk-select { padding-top: 0.2rem; }
  .bulk-select input { width: 18px; height: 18px; cursor: pointer; }
  .content { display: block; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; }
  .meta a { color: #E8603C; text-decoration: none; }
  .meta span, .meta strong { border: 1px solid #3A352D; padding: 2px 7px; color: #EDE4D3; }
  h2 { margin: 0.65rem 0 0.25rem; font-size: 1.1rem; }
  p { color: #B8A88F; max-width: 76ch; }
  small { color: #7A6B58; font-family: ui-monospace, monospace; font-size: 11px; }
  .content form { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }
  .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.6rem 0; }
  .flags span { border: 1px solid rgba(232,197,71,0.38); color: #E8C547; padding: 2px 7px; font-family: ui-monospace, monospace; font-size: 11px; }
  .content form button { border: 1px solid #3A352D; background: transparent; color: #EDE4D3; padding: 0.35rem 0.6rem; cursor: pointer; min-height: var(--touch-min, 44px); }
  .content form button:hover { border-color: #E8603C; color: #E8603C; }
</style>
