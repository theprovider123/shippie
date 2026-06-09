<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let q = $state(data.q);
  let submitting = $state<string | null>(null);

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  }
</script>

<svelte:head>
  <title>Users — Shippie Admin</title>
</svelte:head>

<div class="page-head">
  <h1>Users</h1>
  <form method="get" class="search-row">
    <input
      name="q"
      type="search"
      bind:value={q}
      placeholder="Search email, username…"
      autocomplete="off"
    />
    <button type="submit">Search</button>
  </form>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>User</th>
        <th>Joined</th>
        <th>Role</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.users as user (user.id)}
        <tr class:admin-row={user.isAdmin}>
          <td>
            <span class="user-name">{user.displayName ?? user.username ?? '—'}</span>
            <span class="user-email">{user.email}</span>
          </td>
          <td class="mono">{formatDate(user.createdAt)}</td>
          <td>
            {#if user.isAdmin}
              <span class="badge badge-admin">Admin</span>
            {:else if user.verifiedMaker}
              <span class="badge badge-maker">Maker</span>
            {:else}
              <span class="badge">User</span>
            {/if}
          </td>
          <td class="actions-cell">
            {#if user.id !== data.admin.id}
              <form
                method="post"
                action="?/setAdmin"
                use:enhance={({ formData }) => {
                  submitting = user.id;
                  return async ({ update }) => {
                    submitting = null;
                    await update();
                  };
                }}
              >
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="isAdmin" value={String(!user.isAdmin)} />
                <button
                  type="submit"
                  class="action-btn"
                  class:danger={user.isAdmin}
                  disabled={submitting === user.id}
                >
                  {user.isAdmin ? 'Remove admin' : 'Make admin'}
                </button>
              </form>
            {:else}
              <span class="self-note">You</span>
            {/if}
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="4" class="empty">No users found{data.q ? ` for "${data.q}"` : ''}.</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if data.users.length === 50}
  <div class="pagination">
    {#if data.page > 1}
      <a href="?q={encodeURIComponent(data.q)}&page={data.page - 1}">← Previous</a>
    {/if}
    <a href="?q={encodeURIComponent(data.q)}&page={data.page + 1}">Next →</a>
  </div>
{/if}

<style>
  .page-head {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  h1 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
  }
  .search-row {
    display: flex;
    gap: 0.5rem;
    flex: 1;
    max-width: 380px;
  }
  .search-row input {
    flex: 1;
    min-height: var(--touch-min, 44px);
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-small);
    border-radius: 0;
  }
  .search-row input:focus {
    outline: none;
    border-color: var(--sunset);
  }
  .search-row button {
    min-height: var(--touch-min, 44px);
    padding: 0 1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-small);
    cursor: pointer;
    border-radius: 0;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-small);
  }
  th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  td {
    padding: 0.65rem 0.75rem;
    border-bottom: 1px solid var(--border-light);
    vertical-align: top;
  }
  tr:hover td { background: rgba(255, 255, 255, 0.02); }
  .admin-row td { background: rgba(232, 197, 71, 0.04); }
  .user-name {
    display: block;
    font-weight: 600;
  }
  .user-email {
    display: block;
    font-size: var(--text-caption);
    color: var(--text-secondary);
  }
  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-secondary);
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border: 1px solid var(--border-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 0;
  }
  .badge-admin {
    border-color: rgba(232, 197, 71, 0.4);
    background: rgba(232, 197, 71, 0.1);
    color: var(--marigold, #e8c547);
  }
  .badge-maker {
    border-color: rgba(232, 96, 60, 0.4);
    background: rgba(232, 96, 60, 0.08);
    color: var(--sunset);
  }
  .actions-cell { white-space: nowrap; }
  .action-btn {
    min-height: 32px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-caption);
    cursor: pointer;
    border-radius: 0;
  }
  .action-btn:hover { border-color: var(--sunset); color: var(--sunset); }
  .action-btn.danger { border-color: rgba(180, 63, 42, 0.4); }
  .action-btn.danger:hover { border-color: var(--danger, #b43f2a); color: var(--danger, #b43f2a); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .self-note {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-secondary);
    padding: 0 0.4rem;
  }
  .empty {
    color: var(--text-secondary);
    text-align: center;
    padding: 2rem;
  }
  .pagination {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .pagination a {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-secondary);
    text-decoration: none;
  }
  .pagination a:hover { color: var(--sunset); }
</style>
