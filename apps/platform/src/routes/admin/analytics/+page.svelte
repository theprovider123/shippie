<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const maxDaily = $derived(
    Math.max(1, ...data.daily.map((row) => Number(row.events ?? 0))),
  );
  const maxDevice = $derived(
    Math.max(1, ...data.platformPulse.deviceSplit.map((row) => Number(row.count ?? 0))),
  );

  function n(value: number | null | undefined): string {
    return Number(value ?? 0).toLocaleString();
  }

  function pct(value: number, max: number): number {
    return Math.max(4, Math.round((Number(value || 0) / max) * 100));
  }
</script>

<svelte:head><title>Admin · Analytics · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow">Admin · Analytics</p>
  <h1>Holistic analytics</h1>
  <p class="lede">
    Aggregate platform health for the last {data.rangeDays} days. No raw user trails,
    no profile-level timelines, no content capture.
  </p>
</header>

{#if data.status === 'unavailable'}
  <section class="empty">
    <h2>Analytics unavailable</h2>
    <p>D1 is not bound in this environment.</p>
  </section>
{:else}
  <section class="ethos">
    <div>
      <p class="eyebrow">Privacy posture</p>
      <h2>Measure the garden, not the people.</h2>
    </div>
    <ul>
      <li>Counts are aggregated by tool, event type, and day.</li>
      <li>Session IDs are counted, never displayed.</li>
      <li>Proof devices are opaque hashes and are not joined to users.</li>
      <li>No event payload content is shown here.</li>
    </ul>
  </section>

  <section class="stat-grid" aria-label="Aggregate platform metrics">
    <article>
      <span>Total events</span>
      <strong>{n(data.summary.totalEvents)}</strong>
    </article>
    <article>
      <span>Open-like events</span>
      <strong>{n(data.summary.openEvents)}</strong>
    </article>
    <article>
      <span>Accepted installs</span>
      <strong>{n(data.summary.installAccepts)}</strong>
    </article>
    <article>
      <span>Anonymous sessions</span>
      <strong>{n(data.summary.anonymousSessions)}</strong>
    </article>
    <article>
      <span>Active tools</span>
      <strong>{n(data.summary.activeTools)} / {n(data.summary.totalTools)}</strong>
    </article>
    <article>
      <span>Builders</span>
      <strong>{n(data.summary.builders)}</strong>
    </article>
    <article>
      <span>Proof events</span>
      <strong>{n(data.summary.proofEvents)}</strong>
    </article>
    <article>
      <span>Proof devices</span>
      <strong>{n(data.summary.proofDevices)}</strong>
    </article>
  </section>

  <section class="panel pulse-panel">
    <div class="section-head">
      <h2>Shippie pulse</h2>
      <p>Simple aggregate platform numbers for the last {data.platformPulse.rangeDays} days.</p>
    </div>
    <div class="stat-grid compact" aria-label="Platform pulse metrics">
      <article>
        <span>Apps</span>
        <strong>{n(data.platformPulse.summary.totalApps)}</strong>
        <p>{n(data.platformPulse.summary.liveApps)} live</p>
      </article>
      <article>
        <span>Public apps</span>
        <strong>{n(data.platformPulse.summary.publicApps)}</strong>
        <p>{n(data.platformPulse.summary.privateApps)} private</p>
      </article>
      <article>
        <span>Active apps</span>
        <strong>{n(data.platformPulse.summary.activeApps)}</strong>
        <p>received aggregate events</p>
      </article>
      <article>
        <span>Anon sessions</span>
        <strong>{n(data.platformPulse.summary.anonymousSessions)}</strong>
        <p>counted, never shown</p>
      </article>
    </div>
    {#if data.platformPulse.deviceSplit.length > 0}
      <div class="device-list" aria-label="Anonymous device split">
        {#each data.platformPulse.deviceSplit as row (row.deviceClass)}
          <div class="device-row">
            <span>{row.deviceClass}</span>
            <div class="bar-track" aria-label={`${row.count} ${row.deviceClass} samples`}>
              <span style={`width:${pct(row.count, maxDevice)}%`}></span>
            </div>
            <strong>{n(row.count)}</strong>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted">No coarse device samples in this window yet.</p>
    {/if}
  </section>

  <section class="panel spaces-panel">
    <div class="section-head">
      <h2>Private spaces</h2>
      <p>Demand signal for rooms, capsules, and private collaboration without member trails.</p>
    </div>
    <div class="stat-grid compact" aria-label="Aggregate private space metrics">
      <article>
        <span>Total spaces</span>
        <strong>{n(data.spacesSummary.totalSpaces)}</strong>
        <p>{n(data.spacesSummary.activeSpaces)} active · {n(data.spacesSummary.archivedSpaces)} archived</p>
      </article>
      <article>
        <span>Join links</span>
        <strong>{n(data.spacesSummary.activeJoinLinks)}</strong>
        <p>{n(data.spacesSummary.totalJoinLinks)} created</p>
      </article>
      <article>
        <span>Claims</span>
        <strong>{n(data.spacesSummary.totalClaims)}</strong>
        <p>aggregate count only</p>
      </article>
      <article>
        <span>Invite uses</span>
        <strong>{n(data.spacesSummary.totalInviteUses)}</strong>
        <p>across all invite types</p>
      </article>
    </div>
  </section>

  <section class="two-col">
    <div class="panel">
      <div class="section-head">
        <h2>Daily shape</h2>
        <p>Event volume without user-level trails.</p>
      </div>
      {#if data.daily.length > 0}
        <div class="bars" role="list">
          {#each data.daily as row (row.day)}
            <div class="bar-row" role="listitem">
              <time>{row.day}</time>
              <div class="bar-track" aria-label={`${row.events} events`}>
                <span style={`width:${pct(row.events, maxDaily)}%`}></span>
              </div>
              <strong>{n(row.events)}</strong>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted">No analytics events in this window.</p>
      {/if}
    </div>

    <div class="panel">
      <div class="section-head">
        <h2>Data posture</h2>
        <p>Current detected kind across the library.</p>
      </div>
      {#if data.kinds.length > 0}
        <ul class="kind-list">
          {#each data.kinds as row (row.kind)}
            <li>
              <span>{row.kind}</span>
              <strong>{n(row.count)}</strong>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No tools found.</p>
      {/if}
    </div>
  </section>

  <section class="panel">
    <div class="section-head">
      <h2>Tools with movement</h2>
      <p>Ranked by aggregate events, then proof activity.</p>
    </div>
    {#if data.topTools.length > 0}
      <div class="table">
        <div class="thead">
          <span>Tool</span>
          <span>Events</span>
          <span>Opens</span>
          <span>Installs</span>
          <span>Proof</span>
        </div>
        {#each data.topTools as row (row.slug)}
          <a class="tr" href={`/apps/${row.slug}`}>
            <span>
              <strong>{row.name}</strong>
              <small>{row.slug} · {row.category}</small>
            </span>
            <span>{n(row.eventCount)}</span>
            <span>{n(row.openEvents)}</span>
            <span>{n(row.installAccepts)}</span>
            <span>{n(row.proofEvents)}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="muted">No aggregate tool events yet.</p>
    {/if}
  </section>

  <section class="two-col">
    <div class="panel">
      <div class="section-head">
        <h2>Event mix</h2>
        <p>Most common accepted event names.</p>
      </div>
      {#if data.topEvents.length > 0}
        <ul class="event-list">
          {#each data.topEvents as row (row.eventName)}
            <li>
              <code>{row.eventName}</code>
              <strong>{n(row.count)}</strong>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No event names yet.</p>
      {/if}
    </div>

    <div class="panel">
      <div class="section-head">
        <h2>Proof signals</h2>
        <p>Runtime evidence, grouped without device details.</p>
      </div>
      {#if data.recentProof.length > 0}
        <ul class="event-list">
          {#each data.recentProof as row (`${row.slug}:${row.eventType}`)}
            <li>
              <span>
                <strong>{row.name}</strong>
                <code>{row.eventType}</code>
              </span>
              <small>{n(row.count)} events · {n(row.distinctDevices)} devices</small>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No proof events in this window.</p>
      {/if}
    </div>
  </section>
{/if}

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset, #E8603C);
    margin: 0;
  }
  h1,
  h2 {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    letter-spacing: -0.02em;
  }
  h1 { font-size: var(--text-title); margin: 0.25rem 0 0.5rem; }
  h2 { font-size: var(--text-subhead); margin: 0; }
  .lede,
  .muted,
  .section-head p,
  small { color: var(--text-secondary, #B8A88F); }
  .ethos,
  .panel,
  .stat-grid article,
  .empty {
    border: 1px solid var(--border-light, #2A251E);
    background: rgba(255,255,255,0.02);
  }
  .ethos {
    display: grid;
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1fr);
    gap: 1.25rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .ethos ul { margin: 0; padding-left: 1rem; color: var(--text-secondary, #B8A88F); }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .stat-grid.compact {
    margin-bottom: 0;
  }
  .stat-grid article { padding: 1rem; display: grid; gap: 0.45rem; }
  .stat-grid span,
  .thead,
  .bar-row time {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
  }
  .stat-grid strong { font-family: var(--font-heading, Georgia, serif); font-size: var(--text-heading); }
  .stat-grid p {
    margin: 0;
    color: var(--text-secondary, #B8A88F);
    font-size: var(--text-small);
  }
  .spaces-panel {
    margin-bottom: 1rem;
  }
  .pulse-panel {
    display: grid;
    gap: 1rem;
  }
  .device-list {
    display: grid;
    gap: 0.65rem;
  }
  .device-row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) 72px;
    gap: 0.75rem;
    align-items: center;
  }
  .device-row span {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
  }
  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .panel { padding: 1rem; margin-bottom: 1rem; }
  .section-head { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  .section-head p { margin: 0; font-size: var(--text-body); }
  .bars { display: grid; gap: 0.7rem; }
  .bar-row {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 56px;
    gap: 0.75rem;
    align-items: center;
  }
  .bar-track { height: 9px; border: 1px solid var(--border-light, #2A251E); }
  .bar-track span { display: block; height: 100%; background: var(--sunset, #E8603C); }
  .kind-list,
  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .kind-list li,
  .event-list li,
  .tr,
  .thead {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    border-top: 1px solid var(--border-light, #2A251E);
    padding: 0.75rem 0;
  }
  .event-list code { display: block; color: var(--marigold, #E8C547); }
  .table { display: grid; }
  .thead,
  .tr {
    grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(80px, 0.3fr));
  }
  .tr { color: inherit; text-decoration: none; }
  .tr:hover strong:first-child { color: var(--sunset, #E8603C); }
  .tr span:first-child { display: grid; gap: 0.2rem; }
  .empty { padding: 2rem; }
  @media (max-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .two-col,
    .ethos { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .stat-grid,
    .thead,
    .tr,
    .device-row { grid-template-columns: 1fr; }
    .thead { display: none; }
    .bar-row { grid-template-columns: 1fr; }
  }
</style>
