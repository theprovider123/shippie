<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Avatar, GroupBadge, StatusPill, Card, FEEDBACK_CONFIG } from '$lib/uniti';

  let { data }: { data: PageData } = $props();

  // "What helps" is the default tab — the pupil memory is the headline.
  let tab = $state<'helps' | 'timeline'>('helps');

  const subjLabel = (id: string) =>
    data.subjects.find((s) => s.id === id)?.name ?? id;

  const trendLabel: Record<string, string> = {
    improving: 'Improving ↑',
    steady: 'Holding steady →',
    dipping: 'Worth a look ↓',
  };
  const trendColor: Record<string, string> = {
    improving: '#2EAD73',
    steady: '#E8953A',
    dipping: '#D95A57',
  };

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

    <!-- tabs -->
    <div class="tabs">
      <button class="tab" class:on={tab === 'helps'} onclick={() => (tab = 'helps')}>
        What helps {data.pupil.name.split(' ')[0]}
      </button>
      <button class="tab" class:on={tab === 'timeline'} onclick={() => (tab = 'timeline')}>
        Timeline
      </button>
    </div>

    {#if tab === 'helps'}
      {@const profile = data.profile}
      {@const narrative = data.narrative}
      <!-- profile header -->
      <div class="wbar">
        <span class="wbar-icon">✨</span>
        <span class="wbar-text">
          Based on recent lessons · Teacher-owned · Evidence from {profile.lessonsObserved}
          {profile.lessonsObserved === 1 ? 'lesson' : 'lessons'}
        </span>
        <span class="trend" style="color:{trendColor[profile.confidenceTrend]};">
          {trendLabel[profile.confidenceTrend]}
        </span>
      </div>

      {#if profile.coldStart}
        <Card style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:4px;">Still getting to know {data.pupil.name.split(' ')[0]}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">{narrative.summary}</div>
          <div style="display:flex;flex-direction:column;gap:9px;">
            {#each narrative.standingAdaptations as a}
              <div class="strat-row">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:600;">{a.strategy}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">{a.basedOn}</div>
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {:else}
        <!-- summary + standing adaptations -->
        <Card style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:4px;">What's helped before</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">{narrative.summary}</div>
          <div style="display:flex;flex-direction:column;gap:9px;">
            {#each narrative.standingAdaptations as a}
              <div class="strat-row">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:600;">{a.strategy}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">{a.basedOn} · {a.subject}</div>
                </div>
                <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
                  <div class="bar"><div class="bar-fill" style="width:{a.confidence}%;"></div></div>
                  <span class="pct">{a.confidence}%</span>
                </div>
              </div>
            {/each}
          </div>
        </Card>

        <div class="grid2">
          <!-- recurring needs as chips -->
          <Card>
            <div style="font-size:13px;font-weight:700;margin-bottom:14px;">Patterns we've noticed</div>
            {#if profile.recurringNeeds.length === 0}
              <div style="font-size:12px;color:var(--text-muted);">No recurring patterns past the evidence threshold yet.</div>
            {:else}
              <div style="display:flex;flex-direction:column;gap:10px;">
                {#each profile.recurringNeeds as n}
                  <div class="need">
                    <div class="dot" style="background:{n.status === 'established' ? '#D95A57' : '#E8953A'};"></div>
                    <div style="flex:1;">
                      <div style="font-size:12px;font-weight:600;line-height:1.4;">{n.need}</div>
                      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
                        {n.subjects.map(subjLabel).join(', ')} · {n.count} {n.count === 1 ? 'lesson' : 'lessons'}{n.crossSubject ? ' · across subjects' : ''}
                      </div>
                    </div>
                    <span
                      class="chip"
                      style="background:{n.status === 'established' ? '#FDECEB' : '#FEF0DC'};color:{n.status === 'established' ? '#D95A57' : '#E8953A'};"
                    >
                      {n.status === 'established' ? 'Regular pattern' : 'Emerging'}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </Card>

          <!-- strategies that work, with success % -->
          <Card>
            <div style="font-size:13px;font-weight:700;margin-bottom:14px;">What's helped</div>
            {#if profile.strategiesThatWork.length === 0}
              <div style="font-size:12px;color:var(--text-muted);">Record outcomes on adaptations to build this.</div>
            {:else}
              <div style="display:flex;flex-direction:column;gap:10px;">
                {#each profile.strategiesThatWork as s}
                  <div>
                    <div style="font-size:12px;font-weight:600;margin-bottom:5px;line-height:1.4;">{s.strategy}</div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div class="bar"><div class="bar-fill" style="width:{Math.round(s.successRate * 100)}%;"></div></div>
                      <span class="pct">{Math.round(s.successRate * 100)}%</span>
                    </div>
                    <div style="font-size:10px;color:var(--text-subtle);margin-top:3px;">
                      Evidence from {s.evidence.length} {s.evidence.length === 1 ? 'lesson' : 'lessons'}{s.subjects.length ? ` · ${s.subjects.map(subjLabel).join(', ')}` : ''}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </Card>
        </div>
      {/if}

      <!-- GDPR / trust note -->
      <div class="gdpr">
        <span>🛡️</span>
        <span>
          This is a memory of what helps {data.pupil.name.split(' ')[0]} learn — not a fixed label.
          Evidence-linked, teacher-owned, and deleted when the pupil moves on.
        </span>
      </div>
    {:else if data.timeline.length === 0}
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
  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
  }
  .tab.on {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }
  .wbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: var(--primary-light, #fdecec);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 16px;
  }
  .wbar-icon {
    font-size: 14px;
  }
  .wbar-text {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary);
  }
  .trend {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 20px;
    background: var(--surface);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 16px;
  }
  .strat-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 13px;
    background: var(--surface-2, var(--surface));
    border: 1px solid var(--border);
    border-radius: 9px;
  }
  .bar {
    height: 5px;
    width: 44px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: #2ead73;
    border-radius: 3px;
  }
  .pct {
    font-size: 10px;
    font-weight: 700;
    color: #2ead73;
  }
  .need {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 4px;
    flex-shrink: 0;
  }
  .chip {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .gdpr {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 13px;
    border-radius: 8px;
    background: var(--surface-2, var(--surface));
    border: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.5;
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
