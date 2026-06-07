<script lang="ts" module>
  type StatusPill = { label: string; cls: 'ok' | 'warn' | 'bad' | 'muted' };

  function statusPill(status: string | null): StatusPill {
    switch (status) {
      case 'success':
        return { label: 'Live', cls: 'ok' };
      case 'building':
        return { label: 'Building', cls: 'warn' };
      case 'failed':
        return { label: 'Failed', cls: 'bad' };
      case 'needs_secrets':
        return { label: 'Needs secrets', cls: 'warn' };
      default:
        return { label: 'Draft', cls: 'muted' };
    }
  }

  const VIS_LABELS: Record<string, string> = {
    public: 'Public',
    unlisted: 'Unlisted',
    private: 'Private',
    team: 'Team',
    local: 'Local',
  };

  const STATUS_CHIPS = [
    { value: 'all', label: 'All' },
    { value: 'live', label: 'Live' },
    { value: 'building', label: 'Building' },
    { value: 'failed', label: 'Failed' },
    { value: 'draft', label: 'Draft' },
  ];

  const VIS_OPTIONS = [
    { value: 'all', label: 'All visibility' },
    { value: 'public', label: 'Public' },
    { value: 'unlisted', label: 'Unlisted' },
    { value: 'private', label: 'Private' },
    { value: 'team', label: 'Team' },
  ];

  const SORT_OPTIONS = [
    { value: 'updated:desc', label: 'Recently updated' },
    { value: 'updated:asc', label: 'Oldest first' },
    { value: 'name:asc', label: 'Name A–Z' },
    { value: 'name:desc', label: 'Name Z–A' },
    { value: 'deployed:desc', label: 'Recently deployed' },
  ];

  function formatRelative(iso: string | null): string {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
  }
</script>

<script lang="ts">
  import { page as pageStore } from '$app/stores';
  import { goto } from '$app/navigation';
  import MakerShareSheet from '$components/maker/MakerShareSheet.svelte';
  import { shareStateFor } from '$lib/maker/share';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const demo = $derived(data.demoDiagnostics);

  let shareSheet = $state<{ open: boolean; url: string; title: string }>({
    open: false,
    url: '',
    title: '',
  });
  function openShare(url: string, name: string) {
    shareSheet = { open: true, url, title: `Share ${name}` };
  }
  const f = $derived(data.filters);
  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
  const rangeStart = $derived(data.total === 0 ? 0 : (f.page - 1) * data.pageSize + 1);
  const rangeEnd = $derived(Math.min(f.page * data.pageSize, data.total));
  const hasFilters = $derived(f.q !== '' || f.status !== 'all' || f.visibility !== 'all');

  function applyParam(key: string, value: string) {
    const url = new URL($pageStore.url);
    if (value && value !== 'all') url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    url.searchParams.delete('p');
    void goto(url, { keepFocus: true, noScroll: true });
  }

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const value = String(new FormData(form).get('q') ?? '').trim();
    applyParam('q', value);
  }

  function clearAll() {
    void goto('/maker/apps', { noScroll: true });
  }

  function gotoPage(p: number) {
    const url = new URL($pageStore.url);
    if (p <= 1) url.searchParams.delete('p');
    else url.searchParams.set('p', String(p));
    void goto(url);
  }
</script>

<svelte:head><title>Maker apps · Shippie</title></svelte:head>

<header class="maker-head">
  <div>
    <h1>Apps</h1>
    <p class="lede">
      {#if data.counts.total === 0}
        No apps are attached to this account yet.
      {:else}
        Manage the apps attached to this account.
      {/if}
    </p>
  </div>
</header>

<section class="summary-grid" aria-label="Apps summary">
  <div>
    <span>Total</span>
    <strong>{data.counts.total}</strong>
  </div>
  <div>
    <span>Live</span>
    <strong>{data.counts.live}</strong>
  </div>
  <div>
    <span>Private</span>
    <strong>{data.counts.private}</strong>
  </div>
</section>

{#if data.counts.total === 0}
  <section class="empty" aria-labelledby="empty-title">
    <p class="eyebrow">No apps yet</p>
    <h2 id="empty-title">Ship or claim your first app.</h2>
    <p>
      Dock and Tools can show bundled tools. Maker only shows apps whose account owner matches
      <strong>{data.user.email}</strong>.
    </p>
    <div class="empty-actions">
      <a class="primary" href="/new">Ship app</a>
      {#if data.user.isAdmin}
        <a href="/admin">Admin</a>
      {/if}
    </div>
    {#if data.user.isAdmin}
      <details class="diagnostics">
        <summary>Demo app diagnostics</summary>
        {#if demo.rows.length > 0}
          <p>
            Demo rows found: {demo.rows.map((row) => row.slug).join(', ')}.
            {demo.ownedSlugs.length === 0 ? 'None are owned by this account.' : `Owned here: ${demo.ownedSlugs.join(', ')}.`}
          </p>
        {:else}
          <p>No seeded demo rows were found in this database.</p>
        {/if}
      </details>
    {/if}
  </section>
{:else}
  <section class="controls" aria-label="Search and filter">
    <form class="search" onsubmit={submitSearch} role="search">
      <input
        type="search"
        name="q"
        placeholder="Search by name or slug"
        value={f.q}
        aria-label="Search apps"
      />
      <button type="submit">Search</button>
    </form>
    <div class="filters">
      <div class="chips" role="group" aria-label="Filter by status">
        {#each STATUS_CHIPS as chip}
          <button
            type="button"
            class:active={f.status === chip.value}
            aria-pressed={f.status === chip.value}
            onclick={() => applyParam('status', chip.value)}
          >{chip.label}</button>
        {/each}
      </div>
      <div class="selects">
        <label>
          <span class="sr-only">Visibility</span>
          <select aria-label="Filter by visibility" onchange={(e) => applyParam('visibility', e.currentTarget.value)}>
            {#each VIS_OPTIONS as opt}
              <option value={opt.value} selected={f.visibility === opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
        <label>
          <span class="sr-only">Sort</span>
          <select aria-label="Sort apps" onchange={(e) => applyParam('sort', e.currentTarget.value)}>
            {#each SORT_OPTIONS as opt}
              <option value={opt.value} selected={f.sort === opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>
  </section>

  <p class="result-meta">
    {#if data.total === 0}
      No apps match your filters.
    {:else}
      Showing {rangeStart}–{rangeEnd} of {data.total}{hasFilters ? ' matching' : ''}.
    {/if}
    {#if hasFilters}
      <button type="button" class="clear" onclick={clearAll}>Clear filters</button>
    {/if}
  </p>

  {#if data.total === 0}
    <section class="no-match">
      <p>Try a different search or filter.</p>
    </section>
  {:else}
    <section class="app-list" aria-label="Apps">
      {#each data.apps as app (app.id)}
        {@const pill = statusPill(app.latestDeployStatus)}
        {@const share = shareStateFor(app)}
        <article class="app-row">
          <a class="app-main" href={`/maker/apps/${app.slug}`}>
            <span class="swatch" style:background={app.themeColor}></span>
            <span class="app-id">
              <strong>{app.name}</strong>
              <small>{app.slug}.shippie.app</small>
            </span>
          </a>
          <span class="pills">
            <span class="status status-{pill.cls}">{pill.label}</span>
            <span class="vis">{VIS_LABELS[app.visibilityScope] ?? app.visibilityScope}</span>
          </span>
          <span class="time">{formatRelative(app.lastDeployedAt)}</span>
          <span class="actions">
            {#if share.kind !== 'blocked'}
              <a class="action" href={`https://${app.slug}.shippie.app/`} target="_blank" rel="noreferrer">Open</a>
            {/if}
            {#if share.kind === 'public'}
              <button class="action" type="button" onclick={() => openShare(share.url, app.name)}>Share</button>
            {:else if share.kind === 'invite'}
              <a class="action" href={share.href}>Share</a>
            {/if}
            <a class="action manage" href={`/maker/apps/${app.slug}`}>Manage</a>
          </span>
        </article>
      {/each}
    </section>

    {#if totalPages > 1}
      <nav class="pager" aria-label="Pagination">
        <button type="button" disabled={f.page <= 1} onclick={() => gotoPage(f.page - 1)}>← Prev</button>
        <span>Page {f.page} of {totalPages}</span>
        <button type="button" disabled={f.page >= totalPages} onclick={() => gotoPage(f.page + 1)}>Next →</button>
      </nav>
    {/if}
  {/if}
{/if}

<MakerShareSheet
  open={shareSheet.open}
  url={shareSheet.url}
  title={shareSheet.title}
  onClose={() => (shareSheet.open = false)}
/>

<style>
  .maker-head {
    margin-bottom: 1rem;
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--sunset);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .manage,
  .empty-actions a {
    text-decoration: none;
  }
  h1,
  h2 {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    letter-spacing: 0;
  }
  h1 {
    font-size: clamp(2rem, 7vw, 3.25rem);
    line-height: 0.98;
  }
  h2 {
    font-size: 1.4rem;
    line-height: 1.05;
  }
  .lede {
    margin: 0.35rem 0 0;
    color: var(--text-muted-warm);
  }
  .empty-actions a {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.95rem;
    border: 1px solid var(--paper-cream);
    color: inherit;
    font-weight: 700;
  }
  .empty-actions a.primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    margin-bottom: 1rem;
    border: 1px solid var(--paper-cream);
    background: var(--paper-cream);
  }
  .summary-grid div {
    min-height: 80px;
    display: grid;
    align-content: space-between;
    padding: 0.85rem;
    background: var(--bg);
  }
  .summary-grid span {
    color: var(--text-muted-warm);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .summary-grid strong {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.65rem, 5vw, 2.35rem);
    line-height: 0.95;
  }

  /* Controls */
  .controls {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 0.85rem;
  }
  .search {
    display: flex;
    gap: 0.5rem;
  }
  .search input {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-min, 44px);
    padding: 0 0.85rem;
    border: 1px solid var(--paper-cream);
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: 16px;
    border-radius: 0;
  }
  .search input:focus {
    outline: none;
    border-color: var(--sunset);
  }
  .search button {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--sunset);
    background: var(--sunset);
    color: white;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: space-between;
    align-items: center;
  }
  .chips {
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chips button {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 0 0.7rem;
    border: 1px solid var(--paper-cream);
    background: transparent;
    color: var(--text-muted-warm);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    border-radius: 0;
  }
  .chips button.active {
    border-color: var(--sunset);
    background: var(--sunset);
    color: white;
  }
  .selects {
    display: flex;
    gap: 0.4rem;
  }
  .selects select {
    min-height: 36px;
    padding: 0 0.5rem;
    border: 1px solid var(--paper-cream);
    background: var(--bg);
    color: inherit;
    font: inherit;
    font-size: 13px;
    border-radius: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .result-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    margin: 0 0 0.75rem;
    color: var(--text-muted-warm);
    font-size: 13px;
  }
  .clear {
    border: 0;
    background: none;
    color: var(--sunset);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }
  .no-match {
    padding: 1.5rem 0;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
    color: var(--text-muted-warm);
  }
  .no-match p {
    margin: 0;
  }

  /* List */
  .app-list {
    display: grid;
    border: 1px solid var(--paper-cream);
  }
  .app-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) auto auto auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 0.9rem;
    border-top: 1px solid var(--paper-cream);
  }
  .app-row:first-child {
    border-top: 0;
  }
  .app-main {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: inherit;
    text-decoration: none;
  }
  .app-id {
    min-width: 0;
    display: grid;
    gap: 0.1rem;
  }
  .app-main strong,
  .app-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-main small,
  .time,
  .vis {
    color: var(--text-muted-warm);
  }
  .swatch {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }
  .pills {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
  .status,
  .vis,
  .time {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    white-space: nowrap;
  }
  .status {
    padding: 3px 8px;
  }
  .status-ok {
    background: rgba(46, 125, 91, 0.15);
    color: var(--success);
  }
  .status-bad {
    background: rgba(180, 63, 42, 0.15);
    color: var(--danger);
  }
  .status-warn {
    background: rgba(232, 96, 60, 0.15);
    color: var(--danger-hover);
  }
  .status-muted {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
  }
  .actions {
    display: inline-flex;
    gap: 0.4rem;
    justify-self: end;
  }
  .action {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    padding: 0 0.6rem;
    color: var(--sunset);
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
    white-space: nowrap;
  }
  button.action {
    background: none;
    border: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .action.manage {
    border: 1px solid var(--paper-cream);
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
    color: var(--text-muted-warm);
    font-size: 13px;
  }
  .pager button {
    min-height: var(--touch-min, 44px);
    padding: 0 0.9rem;
    border: 1px solid var(--paper-cream);
    background: var(--bg);
    color: inherit;
    font: inherit;
    cursor: pointer;
    border-radius: 0;
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Empty */
  .empty {
    display: grid;
    gap: 0.85rem;
    padding: 1rem 0;
    border-top: 1px solid var(--paper-cream);
    border-bottom: 1px solid var(--paper-cream);
  }
  .empty p,
  .diagnostics p {
    margin: 0;
    color: var(--text-muted-warm);
    line-height: 1.5;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .diagnostics summary {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: var(--sunset);
    cursor: pointer;
    font-weight: 700;
  }

  @media (max-width: 900px) {
    .app-row {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.5rem 0.75rem;
    }
    .pills,
    .time {
      justify-self: start;
    }
    .actions {
      grid-column: 1 / -1;
      justify-self: stretch;
    }
    .action.manage {
      flex: 1;
      justify-content: center;
    }
    .action:not(.manage) {
      flex: 1;
      justify-content: center;
      border: 1px solid var(--paper-cream);
    }
  }
  @media (max-width: 760px) {
    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .filters {
      flex-direction: column;
      align-items: stretch;
    }
    .selects {
      justify-content: space-between;
    }
    .selects select {
      flex: 1;
    }
    .app-row {
      padding: 0.85rem 0;
    }
    .app-list {
      border-left: 0;
      border-right: 0;
    }
  }
  @media (prefers-color-scheme: dark) {
    .empty-actions a,
    .summary-grid,
    .summary-grid div,
    .app-list,
    .app-row,
    .empty,
    .action.manage,
    .search input,
    .search,
    .chips button,
    .selects select,
    .pager button,
    .no-match {
      border-color: var(--ink-warm);
    }
    .summary-grid {
      background: var(--ink-warm);
    }
    .status-muted {
      background: rgba(255, 255, 255, 0.06);
    }
  }
</style>
