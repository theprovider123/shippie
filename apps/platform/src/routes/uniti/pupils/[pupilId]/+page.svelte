<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Avatar, GroupBadge, StatusPill, Card, FEEDBACK_CONFIG } from '$lib/uniti';

  let { data }: { data: PageData } = $props();

  function groups(p: { send: number; eal: number; fsm: number }): string[] {
    const g: string[] = [];
    if (p.send) g.push('SEND');
    if (p.eal) g.push('EAL');
    if (p.fsm) g.push('FSM');
    return g;
  }

  function shortDate(ms: number): string {
    try {
      return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  // Group the timeline by objective.
  const byObjective = $derived(
    (() => {
      const map = new Map<
        string,
        { objective: string; subjectId: string; entries: typeof data.timeline }
      >();
      for (const t of data.timeline) {
        const key = t.objective || t.topic;
        if (!map.has(key))
          map.set(key, { objective: key, subjectId: t.subjectId, entries: [] });
        map.get(key)!.entries.push(t);
      }
      return [...map.values()];
    })(),
  );

  const subjName = $derived(
    Object.fromEntries(data.subjects.map((s) => [s.id, s.name])) as Record<string, string>,
  );

  // Latest state per objective (the headline pill).
  function latest(entries: typeof data.timeline): string {
    return entries[entries.length - 1]?.state ?? 'absent';
  }
</script>

<svelte:head>
  <title>uniti · {data.pupil.name}</title>
</svelte:head>

<AppShell
  active="timeline"
  slug={data.slug}
  title="Pupil Progress"
  schoolName={data.schoolName}
  teacherName={data.teacher.name}
  teacherRole="Teacher"
>
  <div class="page">
    <h1>Pupil Progress</h1>

    <!-- pupil selector -->
    <div class="selector">
      <span class="viewing">Viewing:</span>
      <div class="pills">
        {#each data.pupils.slice(0, 9) as p (p.id)}
          <a
            class="ppill"
            class:on={p.id === data.pupil.id}
            href="/uniti/pupils/{p.id}"
            style={p.id === data.pupil.id
              ? 'background:var(--primary);color:#fff;border-color:var(--primary);'
              : 'background:var(--surface);color:var(--text-muted);border-color:var(--border);'}
          >
            {p.name}
          </a>
        {/each}
      </div>
    </div>

    <!-- pupil header -->
    <div class="phead">
      <Avatar initials={data.pupil.initials} size={42} />
      <div style="flex:1;">
        <div style="font-size:16px;font-weight:700;">{data.pupil.name}</div>
        <div style="display:flex;gap:6px;margin-top:3px;align-items:center;">
          {#each groups(data.pupil) as g}<GroupBadge group={g} />{/each}
          <span style="font-size:12px;color:var(--text-muted);">Summer Term 2026</span>
        </div>
      </div>
    </div>

    {#if data.timeline.length === 0}
      <Card>
        <div style="text-align:center;padding:24px 0;color:var(--text-muted);">
          <div style="font-weight:600;margin-bottom:6px;">No feedback yet for {data.pupil.name}</div>
          <div style="font-size:13px;">Builds automatically after a few lessons of feedback.</div>
        </div>
      </Card>
    {:else}
      {#each byObjective as obj (obj.objective)}
        <Card style="margin-bottom:16px;">
          <div class="obj-head">
            <div>
              <div style="font-size:15px;font-weight:700;">{obj.objective}</div>
              <div style="font-size:12px;color:var(--text-muted);">
                {subjName[obj.subjectId] ?? obj.subjectId} · {obj.entries.length}
                {obj.entries.length === 1 ? 'lesson' : 'lessons'}
              </div>
            </div>
            <StatusPill status={latest(obj.entries)} />
          </div>

          <!-- timeline rail -->
          <div class="tl-scroll">
            <div class="tl">
              <div class="tl-line"></div>
              {#each obj.entries as e (e.lessonId + e.updatedAt)}
                {@const cfg = FEEDBACK_CONFIG[e.state]}
                <div class="tl-node">
                  <div
                    class="tl-dot"
                    style="background:{cfg?.bg ?? '#eee'};border:3px solid {cfg?.color ?? '#ccc'};"
                  >
                    {cfg?.emoji ?? ''}
                  </div>
                  <div class="tl-date">{shortDate(e.updatedAt)}</div>
                  {#if e.note}<div class="tl-note">{e.note}</div>{/if}
                </div>
              {/each}
            </div>
          </div>
        </Card>
      {/each}
    {/if}
  </div>
</AppShell>

<style>
  .page {
    padding: 22px 26px;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 20px;
  }
  .selector {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }
  .viewing {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
  }
  .pills {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  .ppill {
    padding: 5px 11px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--border);
    text-decoration: none;
    transition: all 0.12s;
  }
  .phead {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .obj-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }
  .tl-scroll {
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .tl {
    display: flex;
    gap: 0;
    min-width: max-content;
    position: relative;
  }
  .tl-line {
    position: absolute;
    top: 19px;
    left: 20px;
    right: 20px;
    height: 2px;
    background: var(--border);
    z-index: 0;
  }
  .tl-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 90px;
    position: relative;
    z-index: 1;
  }
  .tl-dot {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
  }
  .tl-date {
    font-size: 10px;
    color: var(--text-subtle);
    font-weight: 600;
  }
  .tl-note {
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.3;
    max-width: 84px;
  }
</style>
