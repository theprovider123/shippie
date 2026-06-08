<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Card } from '$lib/uniti';

  let { data }: { data: PageData } = $props();

  // ── AI consent (the per-school setting) ──────────────────────────────────
  let aiEnabled = $state(data.ai.aiEnabled);
  let sensitivity = $state<'group' | 'pseudonymised' | 'identified'>(data.ai.sensitivity);
  let savingAi = $state(false);
  let aiSaved = $state(false);

  async function saveAi() {
    savingAi = true;
    aiSaved = false;
    try {
      // Written as a workspace setting EVENT (lives in the school's own cloud,
      // not the platform DB) — same path as setup.
      await fetch(`/api/cloudlet/instances/${encodeURIComponent(data.slug)}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientEventId: `privacy-ai-${Date.now()}`,
          type: 'setup.privacy_saved',
          deviceId: 'web',
          schemaVersion: 1,
          payload: { aiEnabled, sensitivity },
        }),
      });
      aiSaved = true;
    } finally {
      savingAi = false;
    }
  }

  // ── Retention ────────────────────────────────────────────────────────────
  let retentionMonths = $state(data.retentionNotesMonths);
  let savingRetention = $state(false);
  let retentionSaved = $state(false);

  async function saveRetention() {
    savingRetention = true;
    retentionSaved = false;
    try {
      await fetch(`/api/cloudlet/instances/${encodeURIComponent(data.slug)}/retention`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retentionNotesMonths: retentionMonths }),
      });
      retentionSaved = true;
    } finally {
      savingRetention = false;
    }
  }

  // ── Per-pupil erasure ──────────────────────────────────────────────────────
  let erasePupilId = $state('');
  let eraseReason = $state('');
  let erasingPupil = $state(false);
  let pupilErasedMsg = $state('');

  async function erasePupil() {
    if (!erasePupilId) return;
    erasingPupil = true;
    pupilErasedMsg = '';
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(data.slug)}/erase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'pupil', pupilId: erasePupilId, reason: eraseReason || null }),
      });
      const body = await res.json();
      pupilErasedMsg = res.ok
        ? `Erased. ${body.notesPurged ?? 0} note(s) purged, aggregate kept.`
        : `Failed: ${body.error ?? res.status}`;
      if (res.ok) erasePupilId = '';
    } finally {
      erasingPupil = false;
    }
  }

  // ── Whole-school erasure (typed confirmation) ──────────────────────────────
  let confirmSlug = $state('');
  let erasingSchool = $state(false);
  let schoolErasedMsg = $state('');

  async function eraseSchool() {
    if (confirmSlug !== data.slug) return;
    erasingSchool = true;
    schoolErasedMsg = '';
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(data.slug)}/erase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'school', confirm: confirmSlug }),
      });
      const body = await res.json();
      schoolErasedMsg = res.ok
        ? 'School workspace erased. The control-plane record is kept as proof of deletion.'
        : `Failed: ${body.error ?? res.status}`;
    } finally {
      erasingSchool = false;
    }
  }

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };
</script>

<svelte:head>
  <title>uniti · Privacy & data</title>
</svelte:head>

<AppShell
  active="admin"
  slug={data.slug}
  title="Privacy & data"
  schoolName={data.schoolName}
  teacherName={data.teacher.name}
  teacherRole="Admin"
>
  <div class="page">
    <div class="head">
      <h1>Privacy &amp; data</h1>
      <p>{data.schoolName} · Region: {data.region.toUpperCase()}</p>
    </div>

    <!-- Data-boundary statement -->
    <Card style="padding:16px;">
      <div class="boundary">
        <span class="lock">🔒</span>
        <div>
          <strong>Your data stays in your school cloud.</strong>
          <p>
            All pupil and classroom data lives only in this school's private
            workspace. Shippie's platform never holds pupil data, and no other
            school can see yours. Every AI request and every access to pupil data
            is recorded below.
          </p>
        </div>
      </div>
    </Card>

    <!-- Export -->
    <Card style="padding:16px;">
      <h2>Export your data</h2>
      <p class="muted">
        Download a complete copy of this school's workspace — pupil list, lessons,
        feedback, adaptations, settings, the full event log and audit, plus the
        leadership evidence summary — as JSON. The school owns its data.
      </p>
      <a class="btn" href={`/api/cloudlet/instances/${data.slug}/export`}>Download full export (JSON)</a>
    </Card>

    <!-- AI consent + sensitivity -->
    <Card style="padding:16px;">
      <h2>AI &amp; consent</h2>
      <label class="toggle">
        <input type="checkbox" bind:checked={aiEnabled} />
        <span>AI suggestions {aiEnabled ? 'ON' : 'OFF'}</span>
      </label>
      <p class="muted">
        With AI off, Uniti still works using built-in teaching strategies. AI only
        ever suggests — a teacher always decides.
      </p>
      {#if aiEnabled}
        <div class="section-label">Sensitivity sent to AI</div>
        <div class="opts">
          <label class:sel={sensitivity === 'group'}>
            <input type="radio" name="sens" value="group" bind:group={sensitivity} />
            Group only (no pupil names)
          </label>
          <label class:sel={sensitivity === 'pseudonymised'}>
            <input type="radio" name="sens" value="pseudonymised" bind:group={sensitivity} />
            Pseudonymised (Pupil A/B) — recommended
          </label>
        </div>
      {/if}
      <button class="btn" onclick={saveAi} disabled={savingAi}>
        {savingAi ? 'Saving…' : 'Save AI settings'}
      </button>
      {#if aiSaved}<span class="ok">Saved ✓</span>{/if}
      <p class="muted small">
        Safeguarding content is always excluded from AI, regardless of these
        settings.
      </p>
    </Card>

    <!-- Retention -->
    <Card style="padding:16px;">
      <h2>Data retention</h2>
      <p class="muted">
        Choose how long raw feedback notes are kept. After this window the note
        text is cleared automatically; anonymous aggregates are always kept.
      </p>
      <div class="retention">
        <input type="number" min="0" max="120" bind:value={retentionMonths} />
        <span>months (0 = keep indefinitely)</span>
      </div>
      <button class="btn" onclick={saveRetention} disabled={savingRetention}>
        {savingRetention ? 'Saving…' : 'Save retention'}
      </button>
      {#if retentionSaved}<span class="ok">Saved ✓</span>{/if}
    </Card>

    <!-- AI audit log -->
    <Card style="padding:16px;">
      <h2>AI audit log</h2>
      <p class="muted">Every AI request through the governed broker.</p>
      {#if data.aiAudit.length === 0}
        <p class="empty">No AI requests yet.</p>
      {:else}
        <div class="table">
          <div class="tr th">
            <span>When</span><span>Purpose</span><span>Model</span><span>Cached</span><span>Excluded</span><span>Status</span>
          </div>
          {#each data.aiAudit as a (a.id)}
            <div class="tr">
              <span>{fmt(a.at)}</span>
              <span>{a.purpose ?? '—'}</span>
              <span class="mono">{a.model ?? '—'}</span>
              <span>{a.cached ? 'yes' : 'no'}</span>
              <span>{a.safeguardingExcluded ?? 0}</span>
              <span class={a.refused ? 'bad' : 'good'}>{a.refused ? `refused (${a.reason})` : 'ok'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <!-- Break-glass access log -->
    <Card style="padding:16px;">
      <h2>Break-glass access log</h2>
      <p class="muted">
        Any privileged access to this school's pupil data — including platform
        support staff — is recorded here.
      </p>
      {#if data.breakGlass.length === 0}
        <p class="empty">No break-glass access recorded. Good.</p>
      {:else}
        <div class="table table-3">
          <div class="tr th"><span>When</span><span>Who</span><span>What</span></div>
          {#each data.breakGlass as b (b.id)}
            <div class="tr">
              <span>{fmt(b.at)}</span>
              <span class="mono">{b.actorUserId ?? '—'}</span>
              <span>{(b.detail?.resource as string) ?? b.action}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <!-- Erasure -->
    <Card style="padding:16px;" >
      <h2>Erasure</h2>

      <div class="section-label">Erase one pupil (right to be forgotten)</div>
      <p class="muted">
        Removes that pupil's personal details and note text; anonymous totals are
        kept.
      </p>
      <select bind:value={erasePupilId}>
        <option value="">Choose a pupil…</option>
        {#each data.pupils as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <input class="reason" placeholder="Reason (optional)" bind:value={eraseReason} />
      <button class="btn warn" onclick={erasePupil} disabled={erasingPupil || !erasePupilId}>
        {erasingPupil ? 'Erasing…' : 'Erase pupil'}
      </button>
      {#if pupilErasedMsg}<p class="msg">{pupilErasedMsg}</p>{/if}

      {#if data.tombstones.length > 0}
        <p class="muted small">{data.tombstones.length} pupil(s) already erased (tombstoned).</p>
      {/if}

      {#if data.canEraseSchool}
        <div class="danger">
          <div class="section-label danger-label">Erase the entire school workspace</div>
          <p class="muted">
            This permanently purges all of this school's data. The control-plane
            record is kept as dated proof of deletion. Type the school id
            <strong>{data.slug}</strong> to confirm.
          </p>
          <input class="confirm" placeholder={data.slug} bind:value={confirmSlug} />
          <button
            class="btn danger-btn"
            onclick={eraseSchool}
            disabled={erasingSchool || confirmSlug !== data.slug}
          >
            {erasingSchool ? 'Erasing…' : 'Permanently erase this school'}
          </button>
          {#if schoolErasedMsg}<p class="msg">{schoolErasedMsg}</p>{/if}
        </div>
      {/if}
    </Card>

    <!-- Data-event trail -->
    <Card style="padding:16px;">
      <h2>Data-boundary events</h2>
      {#if data.dataEvents.length === 0}
        <p class="empty">No export, erasure, or retention events yet.</p>
      {:else}
        <div class="table table-3">
          <div class="tr th"><span>When</span><span>Action</span><span>Who</span></div>
          {#each data.dataEvents as d (d.id)}
            <div class="tr">
              <span>{fmt(d.at)}</span>
              <span>{d.action}</span>
              <span class="mono">{d.actorUserId ?? '—'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  </div>
</AppShell>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    max-width: 820px;
    margin: 0 auto;
  }
  .head h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
  }
  .head p {
    color: var(--text-muted);
    margin: 4px 0 0;
    font-size: 13px;
  }
  h2 {
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 8px;
  }
  .muted {
    color: var(--text-muted);
    font-size: 13px;
    margin: 0 0 12px;
  }
  .small {
    font-size: 12px;
  }
  .empty {
    color: var(--text-subtle);
    font-size: 13px;
  }
  .boundary {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .boundary .lock {
    font-size: 22px;
  }
  .boundary p {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 13px;
  }
  .btn {
    display: inline-block;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    padding: 9px 16px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    text-decoration: none;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn.warn {
    background: var(--accent);
  }
  .danger-btn {
    background: var(--revisit);
  }
  .ok {
    margin-left: 10px;
    color: var(--got-it);
    font-weight: 600;
    font-size: 13px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .section-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-subtle);
    margin: 12px 0 8px;
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }
  .opts label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
  }
  .opts label.sel {
    border-color: var(--primary);
    background: var(--primary-light);
  }
  .retention {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .retention input {
    width: 80px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  select,
  .reason,
  .confirm {
    display: block;
    width: 100%;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
    font-size: 14px;
  }
  .table {
    display: flex;
    flex-direction: column;
    font-size: 12px;
  }
  .tr {
    display: grid;
    grid-template-columns: 1.4fr 1.3fr 1.4fr 0.6fr 0.7fr 1fr;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
  }
  .tr.th {
    font-weight: 700;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 11px;
  }
  .table-3 .tr {
    grid-template-columns: 1.4fr 1.4fr 2fr;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 11px;
    word-break: break-all;
  }
  .good {
    color: var(--got-it);
  }
  .bad {
    color: var(--revisit);
  }
  .danger {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px dashed var(--revisit);
  }
  .danger-label {
    color: var(--revisit);
  }
  .msg {
    font-size: 13px;
    margin: 8px 0 0;
    color: var(--text);
  }
</style>
