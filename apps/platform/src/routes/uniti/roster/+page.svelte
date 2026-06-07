<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Btn } from '$lib/uniti';
  import type { RosterDiff } from '@shippie/cloudlet-contract';

  const BADGE: Record<string, { color: string; bg: string }> = {
    add: { color: '#2EAD73', bg: '#E8F6EF' },
    update: { color: '#E8953A', bg: '#FEF0DC' },
    leaver: { color: '#D95A57', bg: '#FDECEB' },
  };

  let { data }: { data: PageData } = $props();
  const slug = $derived(data.instance?.slug ?? '');

  type ParseError = { row: number; message: string };
  let csvText = $state('');
  let fileName = $state<string | null>(null);
  let previewing = $state(false);
  let applying = $state(false);
  let error = $state<string | null>(null);
  let diff = $state<RosterDiff | null>(null);
  let parseErrors = $state<ParseError[]>([]);
  let appliedMsg = $state<string | null>(null);

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    csvText = await file.text();
    diff = null;
    appliedMsg = null;
  }

  async function preview() {
    if (!slug || !csvText.trim()) return;
    previewing = true;
    error = null;
    appliedMsg = null;
    diff = null;
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/roster`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      if (!res.ok) {
        error = 'Could not read that file. Check it has a pupil name and class column.';
        return;
      }
      const body = (await res.json()) as { diff: RosterDiff; errors: ParseError[] };
      diff = body.diff;
      parseErrors = body.errors ?? [];
    } catch {
      error = 'Something went wrong reading the file.';
    } finally {
      previewing = false;
    }
  }

  async function apply() {
    if (!slug || !diff) return;
    applying = true;
    error = null;
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/roster`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ diff, source: 'csv' }),
      });
      if (!res.ok) {
        error = 'Could not apply the import. Please try again.';
        return;
      }
      appliedMsg = 'Roster updated. Leavers were kept on file (their history is safe).';
      diff = null;
      csvText = '';
      fileName = null;
    } catch {
      error = 'Could not apply the import.';
    } finally {
      applying = false;
    }
  }

  const totalChanges = $derived(
    diff
      ? diff.pupils.adds.length +
          diff.pupils.updates.length +
          diff.pupils.deactivations.length +
          diff.pupils.reactivations.length +
          diff.classes.adds.length +
          diff.classes.updates.length +
          diff.classes.deactivations.length
      : 0,
  );
</script>

<svelte:head><title>uniti · Roster & MIS</title></svelte:head>

{#if !data.instance}
  <div class="centered">
    <div class="empty-card">
      <h1>Roster & MIS</h1>
      <p class="muted">You don't have permission to manage this school's roster.</p>
    </div>
  </div>
{:else}
  <AppShell
    active="admin"
    {slug}
    title="Roster & MIS"
    subtitle={data.instance.displayName}
    schoolName={data.instance.displayName}
    teacherName={data.teacher.name}
    teacherRole="Admin"
  >
    <div class="page">
      <p class="eyebrow">Pupils &amp; classes</p>
      <h1>Roster &amp; MIS</h1>
      <p class="lede">
        Import your classes from a spreadsheet, or connect your school's MIS. Your data stays in
        your school's private cloud.
      </p>

      <!-- Data-source status -->
      <section class="sources">
        {#each data.sources as s (s.id)}
          <div class="source" class:on={s.available}>
            <span class="dot" aria-hidden="true"></span>
            <div>
              <div class="src-label">{s.label}</div>
              <div class="src-state">{s.available ? 'Available' : 'Not connected'}</div>
            </div>
          </div>
        {/each}
      </section>

      {#if data.summary}
        <section class="summary">
          <div><strong>{data.summary.activePupils}</strong><span>pupils</span></div>
          <div><strong>{data.summary.activeClasses}</strong><span>classes</span></div>
          {#if data.summary.deactivatedPupils > 0}
            <div class="muted-stat">
              <strong>{data.summary.deactivatedPupils}</strong><span>on file (left)</span>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Upload CSV -->
      <section class="card upload">
        <h2>Upload a spreadsheet</h2>
        <p class="muted">
          A CSV with one row per pupil. Columns: pupil name, class, and optionally year, room,
          SEND, EAL, FSM.
        </p>
        <label class="file">
          <input type="file" accept=".csv,text/csv" onchange={onFile} />
          <span>{fileName ?? 'Choose a CSV file…'}</span>
        </label>
        <div class="actions">
          <Btn onclick={preview} disabled={!csvText.trim() || previewing}>
            {previewing ? 'Reading…' : 'Preview changes'}
          </Btn>
        </div>
        {#if error}<p class="error">{error}</p>{/if}
        {#if appliedMsg}<p class="ok">{appliedMsg}</p>{/if}
      </section>

      <!-- Parse warnings -->
      {#if parseErrors.length}
        <section class="card warn">
          <h3>{parseErrors.length} row{parseErrors.length > 1 ? 's' : ''} skipped</h3>
          <ul>
            {#each parseErrors.slice(0, 8) as e (e.row + e.message)}
              <li>Row {e.row}: {e.message}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Diff preview -->
      {#if diff}
        {#if diff.empty}
          <section class="card"><p class="muted">Already up to date — no changes to apply.</p></section>
        {:else}
          <section class="card preview">
            <h2>Preview · {totalChanges} change{totalChanges > 1 ? 's' : ''}</h2>

            {#snippet badge(kind: string, label: string)}
              <span class="badge" style="color:{BADGE[kind].color};background:{BADGE[kind].bg};">{label}</span>
            {/snippet}

            {#if diff.pupils.adds.length}
              <div class="group">
                {@render badge('add', 'New pupils')}
                <span class="count">{diff.pupils.adds.length}</span>
                <ul>{#each diff.pupils.adds.slice(0, 6) as p (p.sourceId)}<li>{p.name}</li>{/each}</ul>
              </div>
            {/if}
            {#if diff.classes.adds.length}
              <div class="group">
                {@render badge('add', 'New classes')}
                <span class="count">{diff.classes.adds.length}</span>
                <ul>{#each diff.classes.adds as c (c.sourceId)}<li>{c.name}{c.yearGroup ? ` · ${c.yearGroup}` : ''}</li>{/each}</ul>
              </div>
            {/if}
            {#if diff.pupils.updates.length}
              <div class="group">
                {@render badge('update', 'Updated pupils')}
                <span class="count">{diff.pupils.updates.length}</span>
                <ul>{#each diff.pupils.updates.slice(0, 6) as u (u.sourceId)}<li>{u.name} — {u.changes.map((c) => c.field).join(', ')}</li>{/each}</ul>
              </div>
            {/if}
            {#if diff.pupils.deactivations.length}
              <div class="group">
                {@render badge('leaver', 'Leavers (kept on file)')}
                <span class="count">{diff.pupils.deactivations.length}</span>
                <ul>{#each diff.pupils.deactivations.slice(0, 6) as d (d.id)}<li>{d.name}</li>{/each}</ul>
                <p class="note">Leavers are deactivated, never deleted — their lesson history stays safe.</p>
              </div>
            {/if}
            {#if diff.pupils.reactivations.length}
              <div class="group">
                {@render badge('add', 'Returning pupils')}
                <span class="count">{diff.pupils.reactivations.length}</span>
              </div>
            {/if}

            <div class="actions apply-row">
              <Btn variant="ghost" onclick={() => (diff = null)}>Cancel</Btn>
              <Btn onclick={apply} disabled={applying}>
                {applying ? 'Applying…' : `Apply ${totalChanges} change${totalChanges > 1 ? 's' : ''}`}
              </Btn>
            </div>
          </section>
        {/if}
      {/if}
    </div>
  </AppShell>
{/if}

<style>
  .page { max-width: 720px; margin: 0 auto; padding: 32px 24px 64px; }
  .eyebrow {
    text-transform: uppercase; letter-spacing: 0.06em; font-size: 12px;
    font-weight: 600; color: var(--accent); margin: 0 0 4px;
  }
  h1 { font-weight: 800; font-size: 28px; letter-spacing: -0.01em; margin: 0 0 6px; }
  h2 { font-weight: 700; font-size: 19px; margin: 0 0 6px; }
  h3 { font-weight: 700; font-size: 15px; margin: 0 0 8px; }
  .lede { color: var(--text-muted); margin: 0 0 24px; font-size: 15px; line-height: 1.5; }
  .muted { color: var(--text-muted); line-height: 1.5; }

  .sources { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .source {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); flex: 1 1 160px;
  }
  .source .dot {
    width: 8px; height: 8px; border-radius: 999px; background: var(--text-subtle); flex: 0 0 8px;
  }
  .source.on .dot { background: var(--got-it); }
  .src-label { font-weight: 600; font-size: 14px; }
  .src-state { font-size: 12px; color: var(--text-subtle); }

  .summary { display: flex; gap: 24px; margin-bottom: 20px; padding: 0 4px; }
  .summary div { display: flex; flex-direction: column; }
  .summary strong { font-size: 22px; font-weight: 800; }
  .summary span { font-size: 12px; color: var(--text-muted); }
  .summary .muted-stat strong { color: var(--text-muted); }

  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    box-shadow: var(--shadow); padding: 24px; margin-bottom: 16px;
  }
  .card.warn { border-color: var(--accent); background: var(--accent-light); }
  .card.warn ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text-muted); }

  .file {
    display: flex; align-items: center; gap: 10px; margin: 14px 0 4px; padding: 12px 14px;
    border: 1px dashed var(--border); border-radius: var(--radius); cursor: pointer; color: var(--text-muted);
  }
  .file input { display: none; }

  .actions { margin-top: 16px; display: flex; gap: 10px; }
  .apply-row { justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 20px; }

  .group { padding: 12px 0; border-bottom: 1px solid var(--border); }
  .group:last-of-type { border-bottom: none; }
  .badge {
    font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 20px; display: inline-flex;
  }
  .group .count { font-weight: 700; margin-left: 8px; color: var(--text-muted); }
  .group ul { margin: 8px 0 0; padding-left: 4px; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  .group li {
    font-size: 13px; background: var(--surface-2); padding: 4px 10px; border-radius: 999px; color: var(--text);
  }
  .group .note { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; font-style: italic; }

  .error { color: var(--revisit); font-weight: 500; font-size: 14px; margin: 12px 0 0; }
  .ok { color: var(--got-it); font-weight: 600; font-size: 14px; margin: 12px 0 0; }

  .centered { min-height: 70vh; display: flex; align-items: center; justify-content: center; }
  .empty-card { text-align: center; padding: 40px; }
</style>
