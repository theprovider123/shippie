<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const deploy = data.deploy;
  const report = data.report;

  function gradeColor(grade: string | undefined): string {
    if (!grade) return 'var(--text-light)';
    if (grade === 'A+' || grade === 'A') return '#3D8B5C';
    if (grade === 'B') return '#5C8B3D';
    if (grade === 'C') return '#E8A547';
    return '#C84B4B'; // F
  }

  function scoreColor(score: number | undefined): string {
    if (score === undefined) return 'var(--text-light)';
    if (score >= 90) return '#3D8B5C';
    if (score >= 70) return '#5C8B3D';
    if (score >= 50) return '#E8A547';
    return '#C84B4B';
  }

  function kindBadge(kind: string): string {
    if (kind === 'local') return 'Runs locally';
    if (kind === 'connected') return 'Connected';
    if (kind === 'cloud') return 'Cloud-dependent';
    return kind;
  }
</script>

<svelte:head>
  <title>Deploy v{deploy.version} — Shippie</title>
</svelte:head>

<div class="page">
  <header class="header">
    <div class="title-row">
      <h1>Deploy v{deploy.version}</h1>
      <span class="status status-{deploy.status}">{deploy.status}</span>
    </div>
    <p class="meta">
      {deploy.sourceType} · {new Date(deploy.createdAt).toLocaleString()}
      {#if deploy.durationMs}· {(deploy.durationMs / 1000).toFixed(1)}s{/if}
      {#if deploy.commitSha}· <code>{deploy.commitSha.slice(0, 7)}</code>{/if}
    </p>
  </header>

  {#if !report}
    <div class="card empty">
      <p>No deploy report for this version. Older deploys (pre-Phase 2) shipped without a report — re-deploy to see security, privacy, and kind detail.</p>
    </div>
  {:else}
    <section class="grid">
      <div class="card score">
        <h3>Security</h3>
        <div class="big-number" style="color: {scoreColor(report.security.score?.value)}">
          {report.security.score?.value ?? '—'}<span class="small">/100</span>
        </div>
        <p class="sub">
          {report.security.blocks} block · {report.security.warns} warn · {report.security.infos} info
        </p>
        <p class="caveat">Internal score — not surfaced to users yet.</p>
      </div>

      <div class="card grade">
        <h3>Privacy</h3>
        <div class="big-number" style="color: {gradeColor(report.privacy.grade?.grade)}">
          {report.privacy.grade?.grade ?? '—'}
        </div>
        <p class="sub">{report.privacy.grade?.reason ?? ''}</p>
        <p class="caveat">Internal grade — not surfaced to users yet.</p>
      </div>

      <div class="card kind">
        <h3>Kind</h3>
        <div class="badge">{kindBadge(report.kind.public)}</div>
        <p class="sub">
          confidence {Math.round((report.kind.confidence ?? 0) * 100)}% · status {report.kind.publicStatus}
        </p>
        {#if report.kind.reasons.length}
          <ul class="reasons">
            {#each report.kind.reasons.slice(0, 3) as reason}
              <li>{reason}</li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    {#if report.security.score?.deductions.length}
      <section class="card">
        <h3>Why this score?</h3>
        <ul class="deductions">
          {#each report.security.score.deductions as deduction}
            <li>
              <span class="delta">{deduction.delta}</span>
              <span class="rule">{deduction.rule}</span>
              <span class="reason">{deduction.reason}</span>
              <span class="count">×{deduction.count}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if report.security.findings.length}
      <section class="card">
        <h3>Security findings ({report.security.findings.length})</h3>
        <ul class="findings">
          {#each report.security.findings.slice(0, 30) as finding}
            <li class="finding finding-{finding.severity}">
              <div class="finding-head">
                <span class="severity">{finding.severity}</span>
                <span class="rule">{finding.rule}</span>
                <span class="location">{finding.location}</span>
              </div>
              <p class="reason">{finding.reason}</p>
              {#if finding.snippet}
                <code>{finding.snippet}</code>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if report.privacy.domains.length}
      <section class="card">
        <h3>Outbound domains ({report.privacy.domains.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>Category</th>
              <th>Files</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {#each report.privacy.domains as domain}
              <tr class="domain-{domain.category}">
                <td><code>{domain.host}</code></td>
                <td>{domain.category}</td>
                <td>{domain.occurrences}</td>
                <td class="reason">{domain.reason}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if report.steps.length}
      <section class="card">
        <h3>Pipeline steps</h3>
        <ul class="steps">
          {#each report.steps as step}
            <li class="step step-{step.status}">
              <span class="step-status">{step.status}</span>
              <span class="step-title">{step.title}</span>
              <span class="step-elapsed">{(step.finishedAtMs / 1000).toFixed(2)}s</span>
              {#if step.notes && step.notes.length}
                <ul class="step-notes">
                  {#each step.notes as note}<li>{note}</li>{/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
        {#if data.hasStream}
          <p class="stream-link">
            Live stream: <code>GET /api/deploy/{deploy.id}/stream</code>
          </p>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  .header h1 {
    margin: 0;
    font-size: 2rem;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }
  .status {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: var(--surface-alt);
  }
  .status-success { background: rgba(61, 139, 92, 0.15); color: #3D8B5C; }
  .status-failed  { background: rgba(200, 75, 75, 0.15); color: #C84B4B; }
  .meta {
    color: var(--text-light);
    font-size: 0.9rem;
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
  }
  .big-number {
    font-size: 3rem;
    font-weight: 600;
    line-height: 1;
    font-family: var(--font-heading);
  }
  .big-number .small {
    font-size: 1.25rem;
    color: var(--text-light);
  }
  .sub {
    margin: 0.5rem 0 0 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  .caveat {
    margin: 0.75rem 0 0 0;
    font-size: 0.8rem;
    color: var(--text-light);
    font-style: italic;
  }
  .badge {
    display: inline-block;
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
    background: var(--surface-alt);
    font-size: 0.95rem;
    font-weight: 500;
    margin-top: 0.25rem;
  }
  .reasons {
    margin: 0.75rem 0 0 0;
    padding-left: 1rem;
    font-size: 0.85rem;
    color: var(--text-light);
  }
  .deductions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .deductions li {
    display: grid;
    grid-template-columns: 60px 200px 1fr 60px;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
    font-size: 0.9rem;
  }
  .deductions .delta { color: #C84B4B; font-weight: 600; }
  .deductions .rule { color: var(--text-secondary); font-family: var(--font-mono); }
  .deductions .count { text-align: right; color: var(--text-light); }
  .findings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .finding {
    border-left: 3px solid var(--border-light);
    padding: 0.5rem 0.75rem;
  }
  .finding-block { border-color: #C84B4B; }
  .finding-warn  { border-color: #E8A547; }
  .finding-info  { border-color: var(--text-light); }
  .finding-head {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.85rem;
  }
  .finding-head .severity {
    text-transform: uppercase;
    font-weight: 600;
    font-size: 0.7rem;
  }
  .finding-head .rule { color: var(--text-secondary); font-family: var(--font-mono); }
  .finding-head .location { color: var(--text-light); margin-left: auto; font-family: var(--font-mono); font-size: 0.8rem; }
  .finding .reason { margin: 0.25rem 0; font-size: 0.9rem; }
  .finding code {
    display: inline-block;
    background: var(--surface-alt);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.8rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-light);
    text-align: left;
  }
  th {
    color: var(--text-secondary);
    font-weight: 500;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .domain-tracker { background: rgba(200, 75, 75, 0.05); }
  .domain-unknown { background: rgba(232, 165, 71, 0.05); }
  td.reason { color: var(--text-light); font-size: 0.85rem; }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .step {
    display: grid;
    grid-template-columns: 60px 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.4rem 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  .step-ok      { background: rgba(61, 139, 92, 0.05); }
  .step-warn    { background: rgba(232, 165, 71, 0.05); }
  .step-block   { background: rgba(200, 75, 75, 0.05); }
  .step-skipped { background: var(--surface-alt); }
  .step-status {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .step-elapsed {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-light);
  }
  .step-notes {
    grid-column: 2 / -1;
    margin: 0.25rem 0 0 0;
    padding-left: 1rem;
    font-size: 0.8rem;
    color: var(--text-light);
  }
  .stream-link {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--text-light);
  }
  .empty p {
    color: var(--text-light);
  }
</style>
