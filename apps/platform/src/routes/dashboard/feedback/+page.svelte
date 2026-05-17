<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Feedback · Dashboard</title></svelte:head>

<header>
  <p class="eyebrow"><a href="/dashboard">Dashboard</a> · feedback</p>
  <h1>Feedback inbox</h1>
  <p class="lede">{data.myApps.length} apps · {data.items.length} items</p>
</header>

{#if data.items.length === 0}
  <section class="empty">
    <h2>No feedback yet</h2>
    <p>Once visitors send feedback or rate an app, it lands here.</p>
  </section>
{:else}
  <section class="feedback-list" aria-label="Feedback inbox">
    {#each data.items as item (item.id)}
      <article>
        <div class="row">
          <a href={`/dashboard/apps/${item.appSlug}`}>{item.appName}</a>
          <span>{item.type}</span>
          <span class:open={item.status === 'open'}>{item.status}</span>
          {#if item.rating}<strong>{item.rating}/5</strong>{/if}
        </div>
        {#if item.title}<h2>{item.title}</h2>{/if}
        {#if item.body}<p>{item.body}</p>{/if}
        <small>{item.createdAt} · {item.voteCount} votes</small>
      </article>
    {/each}
  </section>
{/if}

<style>
  header { margin-bottom: 1.5rem; }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8603C; margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2rem; margin: 0.25rem 0; letter-spacing: -0.02em; }
  .lede { color: #8B847A; margin: 0; }
  .empty { padding: 4rem 2rem; text-align: center; border: 1px dashed #C9C2B1; border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.5rem; margin: 0.5rem 0; }
  .feedback-list { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #E5DDC8; }
  article { padding: 1rem 0; border-bottom: 1px solid #E5DDC8; }
  article h2 { font-size: 1.1rem; margin: 0.65rem 0 0.25rem; }
  article p { margin: 0; color: #5C5751; max-width: 72ch; }
  small { display: block; margin-top: 0.55rem; color: #8B847A; font-family: ui-monospace, monospace; font-size: 11px; }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .row a { color: #E8603C; text-decoration: none; }
  .row span, .row strong { border: 1px solid #E5DDC8; padding: 2px 7px; font-weight: 600; }
  .row .open { border-color: rgba(46,125,91,0.35); color: #2E7D5B; }
  @media (prefers-color-scheme: dark) {
    .empty { border-color: #3A352D; }
    .feedback-list, article { border-color: #2A251E; }
    article p { color: #B8A88F; }
    .row span, .row strong { border-color: #3A352D; }
  }
</style>
