<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const statusCopy = {
    receiving: 'Receiving aggregate events',
    waiting: 'Waiting for first event',
    unavailable: 'Analytics unavailable',
  } as const;

  const maxDaily = $derived(Math.max(1, ...data.analytics.daily.map((row) => row.events)));
  const maxDevice = $derived(Math.max(1, ...data.analytics.deviceSplit.map((row) => row.count)));

  function n(value: number | null | undefined): string {
    return Number(value ?? 0).toLocaleString();
  }

  function pct(value: number, max: number): number {
    return Math.max(4, Math.round((Number(value || 0) / max) * 100));
  }

  function formatDateTime(value: string | null | undefined): string {
    if (!value) return 'None yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
</script>

<svelte:head><title>Analytics · {data.app.name}</title></svelte:head>

<section class="analytics">
  <a class="back-link" href={`/maker/apps/${data.app.slug}`}>Back to Home</a>

  <aside class="privacy-band" aria-labelledby="privacy-band-title">
    <p id="privacy-band-title">
      <strong>Anonymous aggregate usage only.</strong>
      Makers see counts by day, event type, and coarse device class. Session tokens are counted
      server-side and never shown.
    </p>
    <details>
      <summary>What gets recorded</summary>
      <ul>
        <li><strong>Recorded:</strong> event names, install/open counts, anonymous session counts, and coarse mobile/tablet/desktop split.</li>
        <li><strong>Never shown:</strong> session IDs, device hashes, user IDs, IP addresses, URLs, referrers, or event payload timelines.</li>
        <li><strong>Never collected here:</strong> form contents, files, photos, voice memos, notes, or anything typed inside the app.</li>
        <li>Failed SDK batches stay on the user's device and retry without opening another data path.</li>
      </ul>
    </details>
  </aside>

  <div class="health">
    <p class="eyebrow">Analytics health</p>
    <h2>{statusCopy[data.analytics.health]}</h2>
    <p class="lede">
      Last {data.analytics.rangeDays} days for <strong>{data.app.name}</strong>. These numbers are
      useful for product decisions without becoming a user trail.
    </p>
  </div>

  <section class="stats" aria-label="Aggregate analytics metrics">
    <article>
      <span>Total events</span>
      <strong>{n(data.analytics.summary.totalEvents)}</strong>
    </article>
    <article>
      <span>Opens</span>
      <strong>{n(data.analytics.summary.openEvents)}</strong>
    </article>
    <article>
      <span>Installs</span>
      <strong>{n(data.analytics.summary.installAccepts)}</strong>
    </article>
    <article>
      <span>Anon sessions</span>
      <strong>{n(data.analytics.summary.anonymousSessions)}</strong>
    </article>
    <article>
      <span>Active days</span>
      <strong>{n(data.analytics.summary.activeDays)}</strong>
    </article>
    <article>
      <span>Last received</span>
      <strong class="small-strong">{formatDateTime(data.analytics.summary.latestAt)}</strong>
    </article>
  </section>

  <section class="two-col">
    <div class="panel">
      <div class="section-head">
        <h3>Daily shape</h3>
        <p>Aggregate event volume; no per-session sequence.</p>
      </div>
      {#if data.analytics.daily.length > 0}
        <div class="bars" role="list">
          {#each data.analytics.daily as row (row.day)}
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
        <p class="muted">No aggregate events in this window.</p>
      {/if}
    </div>

    <div class="panel">
      <div class="section-head">
        <h3>Device split</h3>
        <p>Coarse class from app opens: mobile, tablet, desktop.</p>
      </div>
      {#if data.analytics.deviceSplit.length > 0}
        <div class="device-list" role="list">
          {#each data.analytics.deviceSplit as row (row.deviceClass)}
            <div class="device-row" role="listitem">
              <span>{row.deviceClass}</span>
              <div class="bar-track" aria-label={`${row.count} ${row.deviceClass} opens`}>
                <span style={`width:${pct(row.count, maxDevice)}%`}></span>
              </div>
              <strong>{n(row.count)}</strong>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted">No open events with device class yet.</p>
      {/if}
    </div>
  </section>

  <section class="panel">
    <div class="section-head">
      <h3>Event mix</h3>
      <p>Most common accepted event names, grouped across the window.</p>
    </div>
    {#if data.analytics.eventMix.length > 0}
      <ul class="event-list">
        {#each data.analytics.eventMix as row (row.eventName)}
          <li>
            <code>{row.eventName}</code>
            <strong>{n(row.count)}</strong>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">No event names yet.</p>
    {/if}
  </section>
</section>

<style>
  .analytics {
    display: grid;
    gap: 1.25rem;
    max-width: 1040px;
  }
  .back-link {
    justify-self: start;
    color: var(--ink-soft-warm);
    font-size: var(--small-size, 0.9rem);
    text-decoration: none;
  }
  .back-link:hover {
    color: var(--ink-warm);
    text-decoration: underline;
  }
  .privacy-band {
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-lg);
    display: grid;
    gap: 0.6rem;
  }
  .privacy-band p { margin: 0; font-size: var(--small-size, 0.9rem); line-height: 1.55; }
  .privacy-band strong { color: var(--ink-warm); }
  .privacy-band details summary {
    cursor: pointer;
    font-size: var(--small-size, 0.9rem);
    color: var(--ink-soft-warm);
  }
  .privacy-band details ul {
    margin: 0.6rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    font-size: var(--small-size, 0.9rem);
    line-height: 1.55;
    color: var(--ink-warm-line);
  }
  .stats article {
    border: 1px solid var(--border-light);
  }
  .panel {
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .health {
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-lg);
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted-warm);
    font-size: 0.72rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
  .stats article {
    padding: 1rem;
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .stats span,
  .bar-row time,
  .device-row span {
    color: var(--text-muted-warm);
    font-size: 0.78rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .stats strong {
    font-size: 1.55rem;
    font-family: 'Fraunces', Georgia, serif;
    line-height: 1.1;
  }
  .stats .small-strong {
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
  }
  .panel { padding: 1rem; }
  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .section-head h3 {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.25rem;
  }
  .section-head p,
  .muted,
  .lede { color: var(--text-muted-warm); }
  .section-head p { margin: 0; font-size: 0.9rem; max-width: 280px; }
  .bars,
  .device-list {
    display: grid;
    gap: 0.7rem;
  }
  .bar-row,
  .device-row {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 56px;
    gap: 0.75rem;
    align-items: center;
  }
  .device-row { grid-template-columns: 86px minmax(0, 1fr) 56px; }
  .bar-track {
    height: 9px;
    border: 1px solid var(--border-paper-mid);
    min-width: 0;
  }
  .bar-track span {
    display: block;
    height: 100%;
    background: var(--sunset, #E8603C);
  }
  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .event-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    border-top: 1px solid var(--paper-cream);
    padding: 0.75rem 0;
  }
  .event-list code {
    color: var(--ink-warm);
    overflow-wrap: anywhere;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em;
  }
  h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.5rem;
    margin: 0.5rem 0;
  }
  @media (prefers-color-scheme: dark) {
    .event-list li,
    .bar-track { border-color: var(--ink-warm-mid); }
  }
  @media (max-width: 820px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .two-col { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .stats { grid-template-columns: 1fr; }
    .section-head,
    .bar-row,
    .device-row { display: grid; grid-template-columns: 1fr; }
  }
</style>
