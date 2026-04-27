<script lang="ts">
  import type { AdminAppRow } from '../../../routes/admin/+page.server';

  type SortDir = 'asc' | 'desc';
  type SortKey = 'created' | 'name' | 'upvotes' | 'status' | 'visibility';

  let {
    apps,
    sort,
  }: {
    apps: AdminAppRow[];
    sort: string;
  } = $props();

  const [currentKey, currentDir] = (sort ?? 'created:desc').split(':') as [SortKey, SortDir];

  // Helper for cycling sort: same key → flip dir; new key → desc default
  // (with name/visibility/status defaulting to asc since alpha makes
  // more intuitive sense ascending).
  function nextSort(target: SortKey): string {
    const ascDefault: SortKey[] = ['name', 'status', 'visibility'];
    if (target === currentKey) {
      const flipped: SortDir = currentDir === 'asc' ? 'desc' : 'asc';
      return `${target}:${flipped}`;
    }
    return `${target}:${ascDefault.includes(target) ? 'asc' : 'desc'}`;
  }

  function caret(key: SortKey): string {
    if (key !== currentKey) return '';
    return currentDir === 'asc' ? ' ↑' : ' ↓';
  }

  function buildSortHref(target: SortKey): string {
    // Preserve other query params via the current location. Page reloads
    // run the load with the new sort.
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('sort', nextSort(target));
    return `?${params.toString()}`;
  }

  function relTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso).getTime();
    if (Number.isNaN(d)) return iso;
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  }
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th class="sortable">
          <a href={buildSortHref('name')}>App{caret('name')}</a>
        </th>
        <th>Maker</th>
        <th class="sortable">
          <a href={buildSortHref('status')}>Status{caret('status')}</a>
        </th>
        <th class="sortable">
          <a href={buildSortHref('visibility')}>Visibility{caret('visibility')}</a>
        </th>
        <th class="sortable num">
          <a href={buildSortHref('upvotes')}>Upvotes{caret('upvotes')}</a>
        </th>
        <th class="sortable">
          <a href={buildSortHref('created')}>Created{caret('created')}</a>
        </th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each apps as app (app.id)}
        <tr class:archived={app.isArchived}>
          <td>
            <span class="swatch" style:background={app.themeColor}></span>
            <strong>{app.name}</strong>
            <span class="slug">{app.slug}</span>
          </td>
          <td class="muted">{app.makerUsername ?? app.makerEmail}</td>
          <td>
            <span class="status status-{app.latestDeployStatus ?? 'draft'}">
              {app.latestDeployStatus ?? 'draft'}
            </span>
            {#if app.isArchived}
              <span class="status status-archived">archived</span>
            {/if}
          </td>
          <td>
            <form method="POST" action="?/setVisibility" class="inline">
              <input type="hidden" name="id" value={app.id} />
              <select name="visibility" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}>
                <option value="public" selected={app.visibilityScope === 'public'}>public</option>
                <option value="unlisted" selected={app.visibilityScope === 'unlisted'}>unlisted</option>
                <option value="private" selected={app.visibilityScope === 'private'}>private</option>
              </select>
            </form>
          </td>
          <td class="num">{app.upvoteCount}</td>
          <td class="muted mono">{relTime(app.createdAt)}</td>
          <td class="actions">
            <form method="POST" action={app.isArchived ? '?/unarchive' : '?/archive'} class="inline">
              <input type="hidden" name="id" value={app.id} />
              <button type="submit" class="btn-text">
                {app.isArchived ? 'Unarchive' : 'Archive'}
              </button>
            </form>
            <a href={`/apps/${app.slug}`} target="_blank" rel="noopener" class="btn-text">View</a>
            <a href={`/dashboard/apps/${app.slug}`} class="btn-text">Dashboard</a>
          </td>
        </tr>
      {/each}
      {#if apps.length === 0}
        <tr><td colspan="7" class="empty">No apps match these filters.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .table-wrap { border: 1px solid var(--border-light, #2A251E); border-radius: 12px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left;
    padding: 0.625rem 0.875rem;
    background: rgba(255,255,255,0.04);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
    white-space: nowrap;
  }
  th.sortable a {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  th.sortable a:hover { color: var(--sunset, #E8603C); }
  th.num { text-align: right; }
  td { padding: 0.75rem 0.875rem; border-top: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
  td.num { text-align: right; font-family: var(--font-mono, ui-monospace, monospace); }
  td.mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
  td.muted { color: var(--text-secondary, #B8A88F); }
  td.empty { text-align: center; padding: 2rem; color: var(--text-secondary, #B8A88F); }
  tr.archived { opacity: 0.55; }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    margin-right: 0.5rem;
    vertical-align: middle;
  }
  .slug {
    display: block;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--text-secondary, #B8A88F);
    margin-top: 2px;
  }
  .status {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    margin-right: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .status-success { background: rgba(122, 154, 110, 0.18); color: #A8C491; }
  .status-failed { background: rgba(232, 96, 60, 0.18); color: #F47552; }
  .status-building { background: rgba(232, 197, 71, 0.18); color: #E8C547; }
  .status-archived { background: rgba(180, 63, 42, 0.25); color: #F47552; }
  select {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    background: var(--surface, #1E1A15);
    color: var(--text, #EDE4D3);
    border: 1px solid var(--border-light, #2A251E);
    border-radius: 6px;
    padding: 4px 6px;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    white-space: nowrap;
  }
  .inline { display: inline; margin: 0; }
  .btn-text {
    background: none;
    border: none;
    color: var(--sunset, #E8603C);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    padding: 0;
    font-size: 12px;
  }
  .btn-text:hover { text-decoration: underline; }
</style>
