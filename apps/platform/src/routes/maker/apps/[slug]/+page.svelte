<script lang="ts">
  import type { PageData } from './$types';
  import { publicUrlFor } from '$lib/maker/share';

  let { data }: { data: PageData } = $props();

  const publicUrl = $derived(publicUrlFor(data.app.slug));
  const maxOpens = $derived(Math.max(1, ...data.health.opensByDay.map((day) => day.opens)));
  const hasSource = $derived(Boolean(data.health.lineage?.sourceRepo || data.app.githubRepo));
  const sourceAndRemixReady = $derived(
    Boolean(data.health.lineage?.remixAllowed && data.health.lineage?.license && hasSource),
  );
  const checklist = $derived([
    {
      label: 'App is live',
      done: Boolean(data.app.activeDeployId || data.app.latestDeployStatus === 'success'),
      href: publicUrl,
      action: 'Open',
    },
    {
      label: 'Feedback is wired',
      done: data.health.metrics.feedbackOpen > 0,
      href: data.health.metrics.feedbackOpen > 0
        ? `/maker/apps/${data.app.slug}/feedback`
        : `/maker/apps/${data.app.slug}/settings#sdk`,
      action: data.health.metrics.feedbackOpen > 0 ? 'Inbox' : 'Add widget',
    },
    {
      label: 'Analytics has received an event',
      done: data.health.metrics.events > 0,
      href: data.health.metrics.events > 0
        ? `/maker/apps/${data.app.slug}/analytics`
        : `/maker/apps/${data.app.slug}/settings#sdk`,
      action: data.health.metrics.events > 0 ? 'View details' : 'Add SDK',
    },
    {
      label: 'Source and remix terms are published',
      done: sourceAndRemixReady,
      href: `/maker/apps/${data.app.slug}/access#listing`,
      action: sourceAndRemixReady ? 'Review' : 'Add source',
    },
    {
      label: 'GitHub is connected',
      done: Boolean(data.app.githubVerified || data.app.githubInstallationId),
      href: data.app.githubVerified ? `/maker/apps/${data.app.slug}/access#listing` : '/new#github',
      action: data.app.githubVerified ? 'Connected' : 'Connect',
    },
  ]);
  const incomplete = $derived(checklist.filter((item) => !item.done));

  function compactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact' }).format(value);
  }

  function formatDateTime(value: string | null | undefined): string {
    if (!value) return '';
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

<svelte:head><title>Home · {data.app.name}</title></svelte:head>

<section class="health-home" aria-label={`${data.app.name} health`}>
  <section class="metric-strip" aria-label="Health metrics">
    <div class="metric-grid">
      <article>
        <span>Opens</span>
        <strong>{compactNumber(data.health.metrics.opens)}</strong>
      </article>
      <article>
        <span>Favorites</span>
        <strong>{compactNumber(data.health.metrics.favorites)}</strong>
      </article>
      <article>
        <span>Feedback</span>
        <strong>{compactNumber(data.health.metrics.feedbackOpen)}</strong>
      </article>
      <article>
        <span>Events</span>
        <strong>{compactNumber(data.health.metrics.events)}</strong>
      </article>
    </div>

    <div class="sparkline" aria-label="30-day opens sparkline">
      <div class="spark-bars" aria-hidden="true">
        {#each data.health.opensByDay as day (day.date)}
          <span
            title={`${day.date}: ${day.opens} opens`}
            style:height={`${Math.max(3, Math.round((day.opens / maxOpens) * 34))}px`}
          ></span>
        {/each}
      </div>
      <p>30 days · raw open events</p>
    </div>
  </section>

  <section class="section-row">
    <div>
      <p class="eyebrow">What people say</p>
      <h2>Open feedback</h2>
    </div>
    <a href={`/maker/apps/${data.app.slug}/feedback`}>{data.health.metrics.feedbackOpen} open →</a>
  </section>

  {#if data.health.topFeedback.length > 0}
    <ol class="feedback-preview">
      {#each data.health.topFeedback as item (item.id)}
        <li>
          <span>{item.voteCount}</span>
          <strong>{item.label}</strong>
          <time datetime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
        </li>
      {/each}
    </ol>
  {:else}
    <section class="compact-prompt">
      <strong>No feedback yet</strong>
      <p>Add the feedback widget and the first open items will appear here.</p>
      <a href={`/maker/apps/${data.app.slug}/settings#sdk`}>Add widget →</a>
    </section>
  {/if}

  <section class="usage-block">
    <div class="section-row">
      <div>
        <p class="eyebrow">Usage</p>
        <h2>Recent activity</h2>
      </div>
      <a href={`/maker/apps/${data.app.slug}/analytics`}>View details →</a>
    </div>
    {#if data.health.metrics.events > 0}
      <dl>
        <div>
          <dt>Total events</dt>
          <dd>{data.health.metrics.events.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>
            {data.health.latestEvent?.eventName ?? 'event'}
            {#if data.health.latestEvent?.createdAt}
              <span>{formatDateTime(data.health.latestEvent.createdAt)}</span>
            {/if}
          </dd>
        </div>
      </dl>
    {:else}
      <section class="compact-prompt">
        <strong>No events yet</strong>
        <p>Open your live app once after adding the SDK.</p>
        <a href={`/maker/apps/${data.app.slug}/settings#sdk`}>Add SDK →</a>
      </section>
    {/if}
  </section>

  {#if data.health.proof.show}
    <section class="proof-strip">
      <div>
        <p class="eyebrow">Proof</p>
        <h2>Capability evidence</h2>
      </div>
      <a href={`/maker/apps/${data.app.slug}/proof`} aria-label="Open proof details">
        <span>{data.health.proof.glyphs}</span>
        {data.health.proof.earned} of {data.health.proof.total}
      </a>
    </section>
  {/if}

  {#if incomplete.length > 0}
    <section class="fix-list">
      <div>
        <p class="eyebrow">To fix</p>
        <h2>Incomplete launch items</h2>
      </div>
      <ol>
        {#each incomplete as item (item.label)}
          <li>
            <strong>{item.label}</strong>
            <a href={item.href}>{item.action}</a>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</section>

<style>
  .health-home {
    display: grid;
    gap: 1.25rem;
    max-width: 1040px;
  }
  .metric-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 1rem;
    align-items: stretch;
    border-block: 1px solid var(--paper-cream);
    padding: 1rem 0;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .metric-grid article {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }
  .metric-grid span,
  .eyebrow,
  dt,
  .sparkline p,
  time {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted-warm);
  }
  .metric-grid strong {
    font-size: clamp(1.55rem, 5vw, 2.35rem);
    line-height: 1;
    letter-spacing: 0;
  }
  .sparkline {
    display: grid;
    align-content: end;
    gap: 0.45rem;
    min-width: 0;
  }
  .spark-bars {
    height: 38px;
    display: flex;
    align-items: end;
    gap: 3px;
  }
  .spark-bars span {
    flex: 1;
    min-width: 2px;
    background: var(--sunset);
    opacity: 0.22;
  }
  .spark-bars span:last-child {
    opacity: 0.78;
  }
  .sparkline p,
  .eyebrow {
    margin: 0;
  }
  .section-row,
  .proof-strip {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }
  h2 {
    margin: 0.2rem 0 0;
    font-size: 1.2rem;
    letter-spacing: 0;
  }
  a {
    color: var(--sunset);
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
  }
  a:hover {
    text-decoration: underline;
  }
  .feedback-preview,
  .fix-list ol {
    list-style: none;
    display: grid;
    gap: 0;
    padding: 0;
    margin: 0;
    border-top: 1px solid var(--paper-cream);
  }
  .feedback-preview li,
  .fix-list li {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: center;
    min-height: 48px;
    border-bottom: 1px solid var(--paper-cream);
    font-size: 14px;
  }
  .feedback-preview li > span {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--sunset);
  }
  .feedback-preview strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compact-prompt {
    border: 1px dashed var(--border-paper-mid);
    padding: 0.85rem 1rem;
    display: grid;
    gap: 0.25rem;
  }
  .compact-prompt p {
    margin: 0;
    color: var(--text-muted-warm);
    font-size: 13px;
  }
  .usage-block {
    display: grid;
    gap: 0.85rem;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0;
  }
  dl div {
    border-top: 1px solid var(--paper-cream);
    padding-top: 0.75rem;
  }
  dd {
    margin: 0.25rem 0 0;
    font-size: 1rem;
    font-weight: 700;
  }
  dd span {
    display: block;
    color: var(--text-muted-warm);
    font-size: 12px;
    font-weight: 500;
    margin-top: 0.2rem;
  }
  .proof-strip {
    border-block: 1px solid var(--paper-cream);
    padding: 1rem 0;
  }
  .proof-strip a {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: var(--touch-min, 44px);
  }
  .proof-strip span {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--sunset);
    letter-spacing: 0.08em;
  }
  .fix-list {
    display: grid;
    gap: 0.85rem;
  }
  .fix-list li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  @media (prefers-color-scheme: dark) {
    .metric-strip,
    .feedback-preview,
    .feedback-preview li,
    .fix-list ol,
    .fix-list li,
    .proof-strip,
    dl div {
      border-color: var(--ink-warm);
    }
  }
  @media (max-width: 640px) {
    .metric-strip {
      grid-template-columns: 1fr;
    }
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .feedback-preview li {
      grid-template-columns: 34px minmax(0, 1fr);
    }
    .feedback-preview time {
      grid-column: 2;
      margin-top: -0.3rem;
    }
    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
