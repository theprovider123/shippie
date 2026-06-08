<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const statuses = ['open', 'reviewing', 'actioned', 'dismissed'];

  let qInput = $state('');
  $effect(() => {
    qInput = data.filters.q;
  });
</script>

<svelte:head><title>Reports · Admin</title></svelte:head>

<header>
  <p>Admin</p>
  <h1>Reports</h1>
  <span>{data.reports.length} report{data.reports.length === 1 ? '' : 's'} {data.filters.status !== 'all' || data.filters.q ? '(filtered)' : ''}</span>
</header>

{#if form?.ok}<p class="ok">Report updated.</p>{/if}

<form method="GET" class="filters" aria-label="Report filters">
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
      <span>Search</span>
      <input
        type="text"
        name="q"
        value={qInput}
        oninput={(e) => (qInput = e.currentTarget.value)}
        placeholder="slug or detail"
      />
    </label>
    <button type="submit" class="filter-apply">Apply</button>
    {#if data.filters.status !== 'all' || data.filters.q}
      <a class="filter-clear" href="?">Clear</a>
    {/if}
  </div>
</form>

<section>
  {#each data.reports as report (report.id)}
    <article>
      <div class="meta">
        <a href={`/apps/${report.slug}`}>{report.appName ?? report.slug}</a>
        <span class="reason">{report.reason}</span>
        <span>{report.status}</span>
        {#if report.appArchived}<strong class="down">offline</strong>{/if}
      </div>
      {#if report.detail}<p>{report.detail}</p>{/if}
      {#if report.moderationFlags && report.moderationFlags.length > 0}
        <div class="flags">
          {#each report.moderationFlags as flag}<span>{flag}</span>{/each}
        </div>
      {/if}
      <small>{report.createdAt} · {report.reporterUsername ? `@${report.reporterUsername}` : 'anonymous'}</small>
      <div class="actions">
        <form method="POST" action="?/setStatus">
          <input type="hidden" name="id" value={report.id} />
          {#each statuses as status}
            <button type="submit" name="status" value={status}>{status}</button>
          {/each}
        </form>
        {#if !report.appArchived}
          <form method="POST" action="?/suspend" class="danger-form">
            <input type="hidden" name="id" value={report.id} />
            <button type="submit" class="danger">Suspend app</button>
          </form>
        {/if}
      </div>
    </article>
  {/each}
  {#if data.reports.length === 0}
    <article class="empty"><p>No reports match the current filters.</p></article>
  {/if}
</section>

<style>
  header { display: flex; gap: 1rem; align-items: end; margin-bottom: 1.5rem; }
  header p, header span { margin: 0; color: var(--text-secondary); font-family: var(--font-mono); font-size: var(--text-caption); }
  h1 { margin: 0; font-size: var(--text-title); }
  .ok { color: var(--sage-highlight); }
  .filters { margin-bottom: 1rem; }
  .filter-row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: end; }
  .filter-row label { display: grid; gap: 0.2rem; font-family: var(--font-mono); font-size: var(--text-caption); text-transform: uppercase; color: var(--text-secondary); }
  .filter-row input, .filter-row select {
    padding: 0.4rem 0.55rem; background: var(--surface); color: var(--text);
    border: 1px solid var(--border-light); font: inherit; min-height: var(--touch-min, 44px); min-width: 8rem;
  }
  .filter-apply, .filter-clear {
    padding: 0.4rem 0.85rem; background: transparent; color: var(--text);
    border: 1px solid var(--border-light); cursor: pointer; font: inherit;
    min-height: var(--touch-min, 44px); text-decoration: none; display: inline-flex; align-items: center;
  }
  .filter-apply:hover, .filter-clear:hover { border-color: var(--sunset); color: var(--sunset); }
  section { border-top: 1px solid var(--border-light); }
  article { padding: 1rem 0; border-bottom: 1px solid var(--border-light); }
  article.empty { color: var(--text-secondary); padding: 2rem 0; text-align: center; border: 1px dashed var(--border-light); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-family: var(--font-mono); font-size: var(--text-caption); text-transform: uppercase; align-items: center; }
  .meta a { color: var(--sunset); text-decoration: none; }
  .meta span, .meta strong { border: 1px solid var(--border-light); padding: 2px 7px; color: var(--text); }
  .meta .reason { border-color: rgba(232,197,71,0.38); color: var(--marigold); }
  .meta .down { border-color: var(--sunset); color: var(--sunset); }
  p { color: var(--text-secondary); max-width: 76ch; margin: 0.6rem 0 0.25rem; }
  small { color: var(--text-light); font-family: var(--font-mono); font-size: var(--text-caption); }
  .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.6rem 0; }
  .flags span { border: 1px solid rgba(232,197,71,0.38); color: var(--marigold); padding: 2px 7px; font-family: var(--font-mono); font-size: var(--text-caption); }
  .actions { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-top: 0.75rem; align-items: center; }
  .actions form { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .actions button { border: 1px solid var(--border-light); background: transparent; color: var(--text); padding: 0.35rem 0.6rem; cursor: pointer; min-height: var(--touch-min, 44px); font: inherit; }
  .actions button:hover { border-color: var(--sunset); color: var(--sunset); }
  .actions button.danger { border-color: var(--sunset); color: var(--sunset); }
  .actions button.danger:hover { background: var(--sunset); color: var(--bg); }
</style>
