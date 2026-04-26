<script lang="ts">
  /**
   * Pretty-prints two JSON snapshots side-by-side and tags each key
   * as `unchanged`, `changed`, `added`, or `removed`. Designed for
   * shallow audit metadata (`{visibilityScope: 'public'}` etc.) — for
   * deeply nested objects we render the JSON.stringify of the value
   * verbatim and rely on the change tag to draw the eye.
   */
  let {
    before,
    after,
  }: {
    before: Record<string, unknown> | null | undefined;
    after: Record<string, unknown> | null | undefined;
  } = $props();

  type Status = 'unchanged' | 'changed' | 'added' | 'removed';
  interface Row {
    key: string;
    status: Status;
    before: string | null;
    after: string | null;
  }

  function fmt(v: unknown): string {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }

  function diff(b: Record<string, unknown> | null | undefined, a: Record<string, unknown> | null | undefined): Row[] {
    const rows: Row[] = [];
    const keys = new Set<string>([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
    for (const key of [...keys].sort()) {
      const inB = b && Object.prototype.hasOwnProperty.call(b, key);
      const inA = a && Object.prototype.hasOwnProperty.call(a, key);
      const bv = inB ? b![key] : undefined;
      const av = inA ? a![key] : undefined;
      let status: Status;
      if (inB && !inA) status = 'removed';
      else if (!inB && inA) status = 'added';
      else if (JSON.stringify(bv) !== JSON.stringify(av)) status = 'changed';
      else status = 'unchanged';
      rows.push({
        key,
        status,
        before: inB ? fmt(bv) : null,
        after: inA ? fmt(av) : null,
      });
    }
    return rows;
  }

  const rows = $derived(diff(before, after));
</script>

{#if rows.length === 0}
  <span class="none">no diff</span>
{:else}
  <table class="diff">
    <tbody>
      {#each rows as r (r.key)}
        <tr class={r.status}>
          <th>{r.key}</th>
          <td class="before">{r.before ?? '—'}</td>
          <td class="arrow">→</td>
          <td class="after">{r.after ?? '—'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .none {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    color: var(--text-secondary, #B8A88F);
  }
  .diff {
    border-collapse: collapse;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
  }
  .diff th {
    text-align: left;
    padding: 2px 8px 2px 0;
    color: var(--text-secondary, #B8A88F);
    font-weight: 500;
    white-space: nowrap;
  }
  .diff td { padding: 2px 6px; vertical-align: top; }
  .diff td.arrow { color: var(--text-light, #7A6B58); }
  .diff td.before { color: var(--text-light, #7A6B58); text-decoration: line-through; }
  .diff td.after { color: var(--text, #EDE4D3); }
  tr.changed td.after { color: var(--marigold, #E8C547); }
  tr.added td.after { color: #A8C491; }
  tr.added td.before { color: var(--text-light, #7A6B58); }
  tr.removed td.before { color: #F47552; text-decoration: line-through; }
  tr.unchanged { opacity: 0.5; }
</style>
