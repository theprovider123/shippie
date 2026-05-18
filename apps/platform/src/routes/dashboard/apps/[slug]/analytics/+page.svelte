<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const statusCopy = {
    receiving: 'Receiving events',
    waiting: 'Waiting for first event',
    unavailable: 'Analytics unavailable',
  } as const;
</script>

<svelte:head><title>Analytics · {data.app.name}</title></svelte:head>

<section class="analytics">
  <aside class="privacy-band" aria-labelledby="privacy-band-title">
    <p id="privacy-band-title">
      <strong>Basic usage only.</strong>
      No raw app data. No personal data unless you explicitly declare identifiable analytics.
    </p>
    <details>
      <summary>What gets recorded</summary>
      <ul>
        <li><strong>✓ Recorded:</strong> event names, app slug, install/open counts, aggregate timings.</li>
        <li><strong>✓ Recorded:</strong> coarse referrer (where someone came from) only when present.</li>
        <li><strong>✖ Never:</strong> form contents, file contents, photos, voice memos, anything the user typed inside the app.</li>
        <li><strong>✖ Never:</strong> user identity across apps. Each app sees its own usage only.</li>
        <li><strong>✖ Never:</strong> IP addresses, device fingerprints, or third-party tracking IDs.</li>
        <li>
          Failed SDK batches stay on the user's device and retry — they don't disappear and they
          don't get exfiltrated by another route.
        </li>
      </ul>
    </details>
  </aside>

  <div class="health">
    <p class="eyebrow">Analytics health</p>
    <h2>{statusCopy[data.analytics.health]}</h2>
    <p class="lede">
      Events post to <code>/__shippie/analytics</code>. Failed SDK batches stay on-device and retry
      instead of disappearing silently.
    </p>
  </div>

  <div class="stats">
    <article>
      <span>Total events</span>
      <strong>{data.analytics.total}</strong>
    </article>
    <article>
      <span>Last event</span>
      <strong>{data.analytics.latest?.eventName ?? 'None yet'}</strong>
    </article>
  </div>

  {#if data.analytics.recent.length > 0}
    <div class="recent">
      <h3>Recent events</h3>
      {#each data.analytics.recent as event}
        <div class="event-row">
          <div>
            <strong>{event.eventName}</strong>
            <span>{event.url ?? 'No URL recorded'}</span>
          </div>
          <time>{event.createdAt}</time>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <p class="emoji">📊</p>
      <h3>No usage yet</h3>
      <p class="lede">
        Once visitors install or open <strong>{data.app.slug}.shippie.app</strong>, accepted
        aggregate events will land here.
      </p>
    </div>
  {/if}
</section>

<style>
  .analytics { display: grid; gap: 1.25rem; }
  .privacy-band {
    border: 1px solid #C9C2B1;
    background: rgba(250, 247, 239, 0.72);
    padding: 1rem 1.25rem;
    display: grid;
    gap: 0.6rem;
  }
  .privacy-band p { margin: 0; font-size: var(--small-size, 0.9rem); line-height: 1.55; }
  .privacy-band strong { color: #2a2a2a; }
  .privacy-band details summary {
    cursor: pointer;
    font-size: var(--small-size, 0.9rem);
    color: #5C544A;
  }
  .privacy-band details ul {
    margin: 0.6rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    font-size: var(--small-size, 0.9rem);
    line-height: 1.55;
    color: #3F3A33;
  }
  .health,
  .stats article,
  .recent,
  .empty {
    border: 1px solid #C9C2B1;
    background: rgba(250, 247, 239, 0.72);
  }
  .health { padding: 1.5rem; }
  .eyebrow {
    margin: 0 0 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #8B847A;
    font-size: 0.72rem;
  }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .stats article { padding: 1rem; display: grid; gap: 0.35rem; }
  .stats span,
  .event-row span,
  .event-row time { color: #8B847A; font-size: 0.9rem; }
  .stats strong { font-size: 1.35rem; font-family: 'Fraunces', Georgia, serif; }
  .recent { padding: 1rem; }
  .recent h3 { margin-top: 0; }
  .event-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 0;
    border-top: 1px solid #E5DDCF;
  }
  .event-row div { display: grid; gap: 0.2rem; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em;
  }
  .empty { padding: 4rem 2rem; text-align: center; border-style: dashed; }
  .emoji { font-size: 48px; margin: 0; }
  h2,
  h3 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  .lede { color: #8B847A; }
  @media (prefers-color-scheme: dark) {
    .health,
    .stats article,
    .recent,
    .empty {
      border-color: #3A352D;
      background: rgba(20, 18, 15, 0.45);
    }
    .event-row { border-color: #3A352D; }
  }
  @media (max-width: 640px) {
    .stats { grid-template-columns: 1fr; }
    .event-row { display: grid; }
  }
</style>
