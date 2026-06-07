<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Card, ProgressRing } from '$lib/uniti';

  let { data }: { data: PageData } = $props();

  // Which English-style parent subjects are expanded to show their strands.
  let expanded = $state<Record<string, boolean>>({});
  const toggle = (id: string) => (expanded[id] = !expanded[id]);

  const exportHref = $derived(
    `/api/cloudlet/instances/${data.slug}/leadership/export?format=html&scope=${data.includeHistoric ? 'historic' : 'current'}`,
  );

  // Secure-band colour for a percentage (the prototype's three zones).
  const bandColor = (pct: number | null) =>
    pct === null ? 'var(--text-subtle)' : pct >= 68 ? '#2EAD73' : pct >= 38 ? '#E8953A' : '#D95A57';

  const GROUPS = ['SEND', 'EAL', 'FSM'] as const;
</script>

<svelte:head>
  <title>uniti · School Overview</title>
</svelte:head>

<AppShell
  active="leadership"
  slug={data.slug}
  title="School"
  schoolName={data.schoolName}
  teacherName={data.teacher.name}
  teacherRole="Leadership"
>
  <div class="page">
    <div class="head">
      <div>
        <h1>School Overview</h1>
        <p>{data.schoolName} · Summer Term 2026 · Week 8</p>
      </div>
      <div class="head-actions">
        <div class="scope">
          <a class="scope-btn" class:on={!data.includeHistoric} href="?scope=current">Current cohort</a>
          <a class="scope-btn" class:on={data.includeHistoric} href="?scope=historic">+ Historic</a>
        </div>
        <a class="export" href={exportHref} target="_blank" rel="noopener">
          ↓ Export evidence
        </a>
      </div>
    </div>

    <!-- Honesty guard: this is feedback evidence, not attainment. -->
    <div class="banner">
      <span class="dot">⚑</span>
      {data.disclaimer}
      {data.includeHistoric ? 'Includes pupils who have since left (historic evidence).' : ''}
    </div>

    <!-- Totals -->
    <div class="stats">
      <div class="stat"><div class="n">{data.totals.pupils}</div><div class="l">Pupils</div></div>
      <div class="stat"><div class="n">{data.totals.lessons}</div><div class="l">Lessons</div></div>
      <div class="stat"><div class="n">{data.totals.feedbackPoints}</div><div class="l">Feedback points</div></div>
      <div class="stat"><div class="n">{data.totals.subjects}</div><div class="l">Subjects</div></div>
    </div>

    <!-- Progress by subject (English drill-down) -->
    <div class="section-title">Progress by subject <span class="basis">· {data.evidenceBasis}</span></div>
    <div class="subject-grid">
      {#each data.subjects as sub (sub.subjectId)}
        <Card style="padding:16px;text-align:center;">
          <div class="sub-name">{sub.name}</div>
          <div style="display:flex;justify-content:center;">
            <ProgressRing
              pct={sub.pct ?? 0}
              size={68}
              stroke={7}
              color={sub.pct !== null ? sub.color : 'var(--border)'}
              label={sub.pct !== null ? `${sub.pct}%` : '—'}
            />
          </div>
          <div class="sub-meta">{sub.dataPoints > 0 ? `${sub.dataPoints} feedback points` : 'No feedback yet'}</div>

          {#if sub.strands.length > 0}
            <button class="drill" onclick={() => toggle(sub.subjectId)}>
              {expanded[sub.subjectId] ? 'Hide strands' : `Reading · Writing · SPaG`}
              <span class="chev">{expanded[sub.subjectId] ? '▴' : '▾'}</span>
            </button>
            {#if expanded[sub.subjectId]}
              <div class="strands">
                {#each sub.strands as st (st.subjectId)}
                  <div class="strand">
                    <span class="strand-name">{st.name}</span>
                    <span class="strand-pct" style="color:{bandColor(st.pct)};">
                      {st.pct !== null ? `${st.pct}%` : '—'}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </Card>
      {/each}
    </div>

    <!-- Inclusion groups -->
    <div class="section-title">Inclusion · vulnerable groups</div>
    <Card noPad>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Group</th>
              <th>Pupils</th>
              <th>On track</th>
              <th>Needs support</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {#each data.inclusion as g, i (g.group)}
              <tr style="background:{i % 2 ? 'var(--surface-2)' : 'transparent'};">
                <td style="text-align:left;font-weight:600;">{g.label}</td>
                <td>{g.pupils}</td>
                <td>
                  {#if g.pct !== null}
                    <div class="bar-cell">
                      <div class="bar" style="width:{Math.max(g.pct * 0.7, 8)}px;background:{bandColor(g.pct)};"></div>
                      <span style="font-weight:700;color:{bandColor(g.pct)};">{g.pct}%</span>
                    </div>
                  {:else}
                    <span style="color:var(--text-subtle);">No data</span>
                  {/if}
                </td>
                <td>
                  <span style="font-weight:700;color:{(g.needSupportPct ?? 0) > 28 ? '#D95A57' : '#E8953A'};">
                    {g.needSupportPct !== null ? `${g.needSupportPct}%` : '—'}
                  </span>
                </td>
                <td>{g.dataPoints}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>

    <!-- Top strategies (cohort What Works) -->
    <div class="section-title">Strategies with the strongest outcomes</div>
    {#if data.topStrategies.length > 0}
      <div class="strat-list">
        {#each data.topStrategies as s (s.strategy)}
          <Card style="padding:14px 16px;">
            <div class="strat-top">
              <span class="strat-name">{s.strategy}</span>
              <span class="strat-rate" style="color:{bandColor(Math.round(s.successRate * 100))};">
                {Math.round(s.successRate * 100)}%
              </span>
            </div>
            <div class="strat-bar"><div class="strat-fill" style="width:{Math.round(s.successRate * 100)}%;"></div></div>
            <div class="strat-meta">
              {s.n} recorded{s.subjects.length ? ` · ${s.subjects.join(', ')}` : ''}
              {#each GROUPS as g}
                {#if s.byGroup[g]}
                  <span class="grp-chip">{g} {Math.round(s.byGroup[g]!.successRate * 100)}%</span>
                {/if}
              {/each}
            </div>
          </Card>
        {/each}
      </div>
    {:else}
      <Card><p class="empty">No strategy outcomes recorded yet — this builds as teachers mark what worked.</p></Card>
    {/if}

    <!-- Adaptation impact + most-used -->
    <div class="two-col">
      <div>
        <div class="section-title">Adaptation impact</div>
        <Card>
          {#if data.adaptationImpact.flaggedCount > 0}
            <div class="impact-num" style="color:#2EAD73;">{Math.round((data.adaptationImpact.improvedRate ?? 0) * 100)}%</div>
            <div class="impact-label">improved after a flagged strategy</div>
            <div class="impact-detail">
              {data.adaptationImpact.improvedCount} of {data.adaptationImpact.flaggedCount} flagged strategies saw the next
              feedback on that objective improve · avg change
              {(data.adaptationImpact.avgScoreDelta ?? 0) > 0 ? '+' : ''}{data.adaptationImpact.avgScoreDelta ?? 0} points
            </div>
          {:else}
            <p class="empty">Not enough follow-up feedback yet to measure impact.</p>
          {/if}
        </Card>
      </div>
      <div>
        <div class="section-title">Adaptations used most</div>
        <Card noPad>
          {#if data.adaptationsUsed.length > 0}
            <div class="used-list">
              {#each data.adaptationsUsed as a (a.strategy)}
                <div class="used-row">
                  <span class="used-name">{a.strategy}</span>
                  <span class="used-count">{a.timesUsed}×</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty" style="padding:16px;">No adaptations recorded yet.</p>
          {/if}
        </Card>
      </div>
    </div>

    <!-- Pupils to revisit -->
    <div class="section-title">Pupils to revisit</div>
    <Card noPad>
      {#if data.pupilsToRevisit.length > 0}
        <div class="revisit-list">
          {#each data.pupilsToRevisit as p (p.name)}
            <div class="revisit-row">
              <span class="revisit-name">
                {p.name}
                {#if !p.active}<span class="leaver">left</span>{/if}
              </span>
              <span class="revisit-objs">{p.objectives.join(' · ')}</span>
              <span class="revisit-count">{p.objectives.length}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty" style="padding:16px;">No pupils currently flagged for revisit.</p>
      {/if}
    </Card>
  </div>
</AppShell>

<style>
  .page { padding: 22px 26px; }
  .head { margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 3px; }
  .head p { font-size: 13px; color: var(--text-muted); margin: 0; }
  .head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .scope { display: flex; gap: 4px; background: var(--surface-2); padding: 3px; border-radius: 20px; }
  .scope-btn { padding: 5px 12px; border-radius: 18px; font-size: 12px; font-weight: 600; color: var(--text-muted); text-decoration: none; }
  .scope-btn.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
  .export {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px;
    background: var(--primary); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none;
  }
  .export:hover { background: var(--primary-dark); }
  .banner {
    display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px;
    background: var(--primary-light); border: 1px solid var(--primary);
    color: var(--primary-dark); font-size: 12.5px; font-weight: 600; margin-bottom: 20px;
  }
  .banner .dot { flex-shrink: 0; }
  .stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .stat { border: 1px solid var(--border); border-radius: 12px; padding: 12px 18px; min-width: 104px; background: var(--surface); }
  .stat .n { font-size: 24px; font-weight: 800; color: var(--primary); line-height: 1; }
  .stat .l { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .section-title { font-size: 14px; font-weight: 700; margin: 28px 0 14px; }
  .basis { font-weight: 500; color: var(--text-subtle); font-size: 12px; }
  .subject-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
  .sub-name { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .sub-meta { margin-top: 10px; font-size: 11px; color: var(--text-subtle); }
  .drill {
    margin-top: 12px; width: 100%; border: none; background: var(--surface-2); cursor: pointer;
    border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--text-muted);
    display: flex; align-items: center; justify-content: center; gap: 5px; font-family: inherit;
  }
  .drill:hover { color: var(--text); }
  .chev { font-size: 9px; }
  .strands {
    margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 6px;
  }
  .strand { display: flex; justify-content: space-between; font-size: 12px; }
  .strand-name { color: var(--text-muted); font-weight: 500; }
  .strand-pct { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 11px 16px; text-align: center; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid var(--border); }
  td { padding: 11px 16px; text-align: center; font-size: 13px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  .bar-cell { display: flex; align-items: center; justify-content: center; gap: 7px; }
  .bar { height: 5px; border-radius: 3px; }
  .strat-list { display: flex; flex-direction: column; gap: 10px; }
  .strat-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .strat-name { font-size: 13px; font-weight: 600; }
  .strat-rate { font-size: 14px; font-weight: 800; }
  .strat-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
  .strat-fill { height: 100%; background: #2ead73; border-radius: 3px; }
  .strat-meta { margin-top: 8px; font-size: 11px; color: var(--text-subtle); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .grp-chip { background: var(--surface-2); border-radius: 12px; padding: 2px 8px; font-weight: 600; color: var(--text-muted); }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .impact-num { font-size: 34px; font-weight: 800; line-height: 1; }
  .impact-label { font-size: 13px; font-weight: 600; margin-top: 6px; }
  .impact-detail { font-size: 12px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }
  .used-list, .revisit-list { display: flex; flex-direction: column; }
  .used-row, .revisit-row { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .used-row:last-child, .revisit-row:last-child { border-bottom: none; }
  .used-name { flex: 1; font-weight: 500; }
  .used-count { font-weight: 700; color: var(--primary); }
  .revisit-name { width: 150px; font-weight: 600; flex-shrink: 0; }
  .revisit-objs { flex: 1; color: var(--text-muted); font-size: 12px; }
  .revisit-count { font-weight: 700; color: #d95a57; flex-shrink: 0; }
  .leaver { font-size: 10px; font-weight: 700; color: var(--text-subtle); background: var(--surface-2); border-radius: 8px; padding: 1px 6px; margin-left: 6px; }
  .empty { color: var(--text-muted); font-size: 13px; margin: 0; }
  @media (max-width: 720px) { .two-col { grid-template-columns: 1fr; } }
</style>
