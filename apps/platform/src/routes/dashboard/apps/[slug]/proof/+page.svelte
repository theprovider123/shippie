<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<header class="proof-header">
  <p class="eyebrow">Proof</p>
  <h1>Runtime evidence</h1>
  <p class="lede">
    Capability Proof Badges aren't marketing claims. Each one is awarded
    only after the wrapper has observed the matching event from at least
    {data.badges[0]?.threshold ?? 3} distinct devices in real use.
  </p>
</header>

<section class="badges">
  {#each data.badges as b (b.badge)}
    <article class="badge-card" class:earned={b.earned}>
      <header>
        <h2>{b.badge}</h2>
        {#if b.earned}
          <span class="pill earned">earned</span>
        {:else}
          <span class="pill pending">pending</span>
        {/if}
      </header>
      <p class="desc">{b.description}</p>

      <ul class="event-progress">
        {#each b.events as ev (ev.eventType)}
          <li>
            <span class="event-name"><code>{ev.eventType}</code></span>
            <div class="bar-track">
              <div class="bar" style:width="{Math.round(ev.pct * 100)}%"></div>
            </div>
            <span class="event-count">
              {ev.distinctDevices}<span class="of">/{b.threshold}</span>
            </span>
          </li>
        {/each}
      </ul>

      <footer class="meta">
        <span>{b.windowDays}-day window</span>
        {#if b.earned && b.awardedAt}
          <span>· awarded {new Date(b.awardedAt).toLocaleDateString()}</span>
        {/if}
      </footer>
    </article>
  {/each}
</section>

<style>
  .proof-header {
    margin-bottom: 1.5rem;
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--marigold);
    margin: 0 0 0.25rem;
  }
  .proof-header h1 {
    font-family: var(--font-heading);
    margin: 0;
    font-size: 2rem;
  }
  .lede {
    color: var(--text-secondary);
    max-width: 680px;
    margin: 0.5rem 0 0;
  }

  .badges {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--space-lg);
  }

  .badge-card {
    border: 1px solid var(--border-light);
    border-radius: 0;
    padding: var(--space-lg);
    background: var(--bg-pure);
  }
  .badge-card.earned {
    border-color: var(--sage-moss);
    background: color-mix(in srgb, var(--sage-moss) 4%, var(--bg-pure));
  }
  .badge-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .badge-card h2 {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .pill {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.5rem;
    border-radius: 0;
    border: 1px solid;
  }
  .pill.earned {
    color: var(--sage-moss);
    border-color: var(--sage-moss);
  }
  .pill.pending {
    color: var(--text-light);
    border-color: var(--border-light);
  }

  .desc {
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.55;
    margin: 0 0 0.75rem;
  }

  .event-progress {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .event-progress li {
    display: grid;
    grid-template-columns: 1fr 80px 50px;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }
  .event-progress code {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text);
  }
  .bar-track {
    height: 6px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    border-radius: 0;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: var(--sunset);
    border-radius: 0;
    transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .badge-card.earned .bar {
    background: var(--sage-moss);
  }
  .event-count {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-align: right;
    color: var(--text-secondary);
  }
  .event-count .of {
    color: var(--text-light);
  }

  .meta {
    margin-top: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-light);
    display: flex;
    gap: 0.4rem;
  }
</style>
