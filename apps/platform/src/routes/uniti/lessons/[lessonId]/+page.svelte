<script lang="ts">
  import type { PageData } from './$types';
  import {
    AppShell,
    Avatar,
    GroupBadge,
    ProgressRing,
    Btn,
    Icon,
    FEEDBACK_CONFIG,
    FEEDBACK_ORDER,
  } from '$lib/uniti';
  import type { SyncStatus } from '$lib/uniti';

  let { data }: { data: PageData } = $props();

  const subjColor: Record<string, string> = {
    maths: '#2EAD73',
    english: '#3A8FCC',
    'english.writing': '#3A8FCC',
    'english.reading': '#3A8FCC',
    'english.spag': '#3A8FCC',
    science: '#8B6BD6',
    history: '#E8953A',
    pshe: '#D95A57',
  };
  const primary = $derived(subjColor[data.lesson.subjectId] ?? '#2EAD73');

  // Local feedback map (optimistic). Seeded from the server projection.
  let fb = $state<Record<string, string>>(
    Object.fromEntries(data.feedback.map((f) => [f.pupilId, f.state])),
  );
  let notes = $state<Record<string, string>>(
    Object.fromEntries(data.feedback.filter((f) => f.note).map((f) => [f.pupilId, f.note as string])),
  );

  let filter = $state<'all' | 'unset' | 'needs_revisit'>('all');
  let sync = $state<SyncStatus>('synced');
  let pending = $state(0);

  const assessed = $derived(Object.values(fb).filter(Boolean).length);
  const pct = $derived(Math.round((assessed / data.pupils.length) * 100));

  const filtered = $derived(
    data.pupils.filter((p) => {
      if (filter === 'all') return true;
      if (filter === 'unset') return !fb[p.id];
      return fb[p.id] === filter;
    }),
  );

  function pupilGroups(p: (typeof data.pupils)[number]): string[] {
    const g: string[] = [];
    if (p.send) g.push('SEND');
    if (p.eal) g.push('EAL');
    if (p.fsm) g.push('FSM');
    return g;
  }

  // ── Drawer ──
  let drawerPupil = $state<(typeof data.pupils)[number] | null>(null);
  let drawerSel = $state<string | null>(null);
  let drawerNote = $state('');
  let drawerSupport = $state('');
  let drawerConfidence = $state(3);
  let saving = $state(false);

  function openDrawer(p: (typeof data.pupils)[number]) {
    drawerPupil = p;
    drawerSel = fb[p.id] ?? null;
    drawerNote = notes[p.id] ?? '';
    drawerSupport = '';
    drawerConfidence = 3;
  }
  function closeDrawer() {
    drawerPupil = null;
  }

  async function save() {
    if (!drawerPupil) return;
    const pupil = drawerPupil;
    saving = true;
    // Optimistic UI: reflect immediately, mark pending, then POST.
    if (drawerSel) fb[pupil.id] = drawerSel;
    if (drawerNote) notes[pupil.id] = drawerNote;
    pending += 1;
    sync = 'syncing';
    const closing = pupil;
    closeDrawer();
    try {
      const res = await fetch(
        `/api/cloudlet/instances/${encodeURIComponent(data.slug)}/events`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientEventId: `fb-${data.lesson.id}-${closing.id}-${Date.now()}`,
            type: 'feedback.created',
            deviceId: 'web',
            createdOfflineAt: new Date().toISOString(),
            schemaVersion: 1,
            payload: {
              lessonId: data.lesson.id,
              pupilId: closing.id,
              state: drawerSel,
              note: drawerNote || null,
              supportStrategy: drawerSupport || null,
              confidence: drawerConfidence,
            },
          }),
        },
      );
      pending = Math.max(0, pending - 1);
      sync = res.ok ? (pending > 0 ? 'pending' : 'synced') : 'offline';
    } catch {
      pending = Math.max(0, pending - 1);
      sync = 'offline'; // saved locally; full offline SDK is Phase 4
    } finally {
      saving = false;
    }
  }

  const filterOpts = $derived([
    { key: 'all' as const, label: 'All' },
    { key: 'unset' as const, label: `Unassessed (${data.pupils.length - assessed})` },
    {
      key: 'needs_revisit' as const,
      label: `Needs revisit (${Object.values(fb).filter((s) => s === 'needs_revisit').length})`,
    },
  ]);
</script>

<svelte:head>
  <title>uniti · {data.lesson.topic}</title>
</svelte:head>

<AppShell
  active="lesson"
  slug={data.slug}
  title={data.lesson.topic}
  subtitle={`${data.class?.yearGroup ?? ''} · ${data.class?.name ?? ''} · ${data.lesson.time}`}
  schoolName={data.schoolName}
  teacherName={data.teacher.name}
  teacherRole="Teacher"
  syncStatus={sync}
  {pending}
>
  <div class="lesson">
    <!-- mini header -->
    <div class="lhead">
      <a class="back" href="/uniti"><Icon name="back" size={14} />Back</a>
      <div class="lhead-meta">
        {data.lesson.objective}
      </div>
      <ProgressRing {pct} size={38} stroke={4} color={primary} label={`${pct}%`} />
    </div>

    <!-- filter bar -->
    <div class="filterbar">
      {#each filterOpts as opt (opt.key)}
        <button
          class="filter-chip"
          class:active={filter === opt.key}
          onclick={() => (filter = opt.key)}
          style={filter === opt.key
            ? 'background:var(--primary);color:#fff;'
            : 'background:var(--surface-2);color:var(--text-muted);'}
        >
          {opt.label}
        </button>
      {/each}
      <div class="assessed">{assessed}/{data.pupils.length} assessed</div>
    </div>

    <!-- pupil grid -->
    <div class="grid-wrap">
      <div class="grid">
        {#each filtered as p (p.id)}
          {@const cfg = fb[p.id] ? FEEDBACK_CONFIG[fb[p.id]] : null}
          <button
            class="pupil-card"
            onclick={() => openDrawer(p)}
            style="background:{cfg ? cfg.bg : 'var(--surface)'};
              border:1.5px solid {cfg ? cfg.color + '50' : 'var(--border)'};"
          >
            <Avatar initials={p.initials} size={36} statusColor={cfg?.color ?? null} />
            <div class="pname">{p.name}</div>
            {#if pupilGroups(p).length > 0}
              <div class="pgroups">
                {#each pupilGroups(p) as g}<GroupBadge group={g} />{/each}
              </div>
            {/if}
            {#if cfg}
              <div class="pbadge" style="background:{cfg.color};">{cfg.emoji}</div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Feedback drawer -->
  {#if drawerPupil}
    {@const p = drawerPupil}
    <div
      class="scrim"
      onclick={closeDrawer}
      onkeydown={(e) => e.key === 'Escape' && closeDrawer()}
      role="button"
      tabindex="-1"
      aria-label="Close"
    ></div>
    <div class="drawer">
      <div class="drawer-head">
        <Avatar initials={p.initials} size={40} />
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;color:var(--text);">{p.name}</div>
          <div style="display:flex;gap:5px;margin-top:3px;align-items:center;flex-wrap:wrap;">
            {#each pupilGroups(p) as g}<GroupBadge group={g} />{/each}
            <span style="font-size:11px;color:var(--text-subtle);"
              >{data.subject?.name ?? ''} · {data.class?.yearGroup ?? ''}</span
            >
          </div>
        </div>
        <button class="x" onclick={closeDrawer} aria-label="Close"><Icon name="x" size={20} /></button>
      </div>

      <div class="drawer-body">
        <div class="section-label">How did today's lesson go?</div>
        <div class="state-grid">
          {#each FEEDBACK_ORDER as key}
            {@const cfg = FEEDBACK_CONFIG[key]}
            {@const active = drawerSel === key}
            <button
              class="state-btn"
              onclick={() => (drawerSel = active ? null : key)}
              style="border:2px solid {active ? cfg.color : 'transparent'};
                background:{active ? cfg.bg : 'var(--surface-2)'};"
            >
              <span style="font-size:17px;">{cfg.emoji}</span>
              <span style="font-size:12px;font-weight:600;color:{active ? cfg.color : 'var(--text)'};"
                >{cfg.label}</span
              >
            </button>
          {/each}
        </div>

        <div class="section-label" style="margin-top:20px;">Notes (optional)</div>
        <textarea
          bind:value={drawerNote}
          placeholder="Add a quick observation…"
          rows="3"
          class="note"
        ></textarea>

        <div class="section-label" style="margin-top:20px;">Support strategy (optional)</div>
        <input bind:value={drawerSupport} placeholder="e.g. Pre-taught vocabulary" class="input" />

        <div class="section-label" style="margin-top:20px;">Confidence</div>
        <div class="confidence">
          {#each [1, 2, 3, 4, 5] as n}
            <button
              class="conf-dot"
              class:on={drawerConfidence >= n}
              onclick={() => (drawerConfidence = n)}
              aria-label={`Confidence ${n}`}
            ></button>
          {/each}
          <span class="conf-label">{['', 'Low', 'Some', 'Sure', 'High', 'Certain'][drawerConfidence]}</span>
        </div>
      </div>

      <div class="drawer-foot">
        <Btn variant="ghost" onclick={closeDrawer} style="flex:1;justify-content:center;">Cancel</Btn>
        <Btn onclick={save} disabled={saving} style="flex:2;justify-content:center;">
          {saving ? 'Saving…' : 'Save feedback'}
        </Btn>
      </div>
    </div>
  {/if}
</AppShell>

<style>
  .lesson {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lhead {
    padding: 9px 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .back {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--primary);
    font-size: 13px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    text-decoration: none;
  }
  .lhead-meta {
    flex: 1;
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .filterbar {
    padding: 8px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .filter-chip {
    padding: 4px 12px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.12s;
  }
  .assessed {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-subtle);
  }
  .grid-wrap {
    flex: 1;
    overflow: auto;
    padding: 12px 20px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }
  .pupil-card {
    padding: 10px 8px;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    transition: all 0.12s ease;
    position: relative;
    font-family: inherit;
  }
  .pupil-card:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  }
  .pname {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    text-align: center;
    line-height: 1.25;
    width: 100%;
  }
  .pgroups {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .pbadge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.22);
    z-index: 100;
    backdrop-filter: blur(3px);
    border: none;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 400px;
    max-width: 100vw;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    z-index: 101;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
  }
  @keyframes slideIn {
    from {
      transform: translateX(40px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .drawer-head {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .x {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-subtle);
    padding: 4px;
    border-radius: 6px;
    display: flex;
  }
  .drawer-body {
    flex: 1;
    overflow: auto;
    padding: 18px;
  }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 10px;
  }
  .state-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .state-btn {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.12s;
    font-family: inherit;
    text-align: left;
  }
  .note,
  .input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    background: var(--surface);
    color: var(--text);
    outline: none;
    transition: border-color 0.15s;
  }
  .note {
    resize: none;
  }
  .note:focus,
  .input:focus {
    border-color: var(--primary);
  }
  .confidence {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .conf-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    padding: 0;
    transition: all 0.12s;
  }
  .conf-dot.on {
    background: var(--primary);
    border-color: var(--primary);
  }
  .conf-label {
    font-size: 12px;
    color: var(--text-muted);
    margin-left: 4px;
  }
  .drawer-foot {
    padding: 13px 18px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
  }
</style>
