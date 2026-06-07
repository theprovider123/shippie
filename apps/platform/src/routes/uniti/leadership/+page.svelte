<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Card, ProgressRing } from '$lib/uniti';

  let { data }: { data: PageData } = $props();
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
    </div>

    <!-- Progress by subject -->
    <div class="section-title">Progress by subject</div>
    <div class="subject-grid">
      {#each data.subjectRows as sub (sub.id)}
        <Card style="padding:16px;text-align:center;">
          <div class="sub-name">{sub.name}</div>
          <div style="display:flex;justify-content:center;">
            {#if sub.pct !== null}
              <ProgressRing pct={sub.pct} size={68} stroke={7} color={sub.color} label={`${sub.pct}%`} />
            {:else}
              <ProgressRing pct={0} size={68} stroke={7} color="var(--border)" label="—" />
            {/if}
          </div>
          <div class="sub-meta">
            {sub.n > 0 ? `${sub.n} data points` : 'No data yet'}
          </div>

          <!-- English (and any parent) strand breakdown -->
          {#if sub.strands.length > 0}
            <div class="strands">
              {#each sub.strands as st (st.id)}
                <div class="strand">
                  <span class="strand-name">{st.name}</span>
                  <span class="strand-pct" style="color:{st.pct !== null ? st.color : 'var(--text-subtle)'};">
                    {st.pct !== null ? `${st.pct}%` : '—'}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </Card>
      {/each}
    </div>

    <!-- Inclusion groups -->
    <div class="section-title">Inclusion groups</div>
    <Card noPad>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Group</th>
              <th>Data points</th>
              <th>On track</th>
            </tr>
          </thead>
          <tbody>
            {#each data.groupRows as g, i (g.label)}
              <tr style="background:{i % 2 ? 'var(--surface-2)' : 'transparent'};">
                <td style="text-align:left;font-weight:600;">{g.label}</td>
                <td>{g.n}</td>
                <td>
                  {#if g.pct !== null}
                    <div class="bar-cell">
                      <div class="bar" style="width:{Math.max(g.pct * 0.7, 8)}px;"></div>
                      <span style="font-weight:700;color:#2EAD73;">{g.pct}%</span>
                    </div>
                  {:else}
                    <span style="color:var(--text-subtle);">No data</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</AppShell>

<style>
  .page {
    padding: 22px 26px;
  }
  .head {
    margin-bottom: 24px;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 3px;
  }
  .head p {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }
  .section-title {
    font-size: 14px;
    font-weight: 700;
    margin: 28px 0 14px;
  }
  .subject-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 12px;
  }
  .sub-name {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .sub-meta {
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-subtle);
  }
  .strands {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .strand {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }
  .strand-name {
    color: var(--text-muted);
    font-weight: 500;
  }
  .strand-pct {
    font-weight: 700;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    padding: 11px 16px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 2px solid var(--border);
  }
  td {
    padding: 11px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  .bar-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
  }
  .bar {
    height: 5px;
    background: #2ead73;
    border-radius: 3px;
  }
</style>
