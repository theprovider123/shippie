<script lang="ts">
  import JsonDiff from './JsonDiff.svelte';
  import type { AuditDisplayRow } from '../../../routes/admin/audit/$types';

  let { row }: { row: AuditDisplayRow } = $props();

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  }
</script>

<tr class="audit-row">
  <td class="time mono">{fmtDate(row.createdAt)}</td>
  <td>
    <strong>{row.actorUsername ?? row.actorEmail ?? 'system'}</strong>
  </td>
  <td><span class="action">{row.action}</span></td>
  <td class="target">
    {#if row.targetTable}
      <span class="mono">{row.targetTable}</span>
      {#if row.targetId}
        <br /><span class="mono muted">{row.targetId.slice(0, 8)}…</span>
      {/if}
    {:else}
      <span class="muted">—</span>
    {/if}
  </td>
  <td class="diff-cell">
    <JsonDiff before={row.before} after={row.after} />
  </td>
</tr>

<style>
  td {
    padding: 0.625rem 0.875rem;
    border-top: 1px solid rgba(255,255,255,0.05);
    vertical-align: top;
    font-size: 13px;
  }
  td.time { white-space: nowrap; color: var(--text-secondary, #B8A88F); }
  .mono {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
  }
  .muted { color: var(--text-secondary, #B8A88F); }
  .action {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(232, 96, 60, 0.12);
    color: var(--sunset, #E8603C);
    white-space: nowrap;
  }
  .target { white-space: nowrap; }
  .diff-cell { min-width: 280px; }
</style>
