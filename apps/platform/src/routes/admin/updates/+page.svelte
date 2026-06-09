<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Updates · Admin</title></svelte:head>

<header>
  <p>Admin</p>
  <h1>Update monitoring</h1>
  <span>{data.updates.length} flagged update{data.updates.length === 1 ? '' : 's'}</span>
</header>

<p class="lede">
  Updates ship instantly — this lists versions that <em>changed behavior</em> vs the previous
  live version, ranked by app popularity. A signal to glance at, not a gate.
</p>

<div class="toggle">
  {#if data.showAll}
    <a href="?">Show high-delta only</a>
  {:else}
    <a href="?all=1">Show all changed updates</a>
  {/if}
</div>

<section>
  {#each data.updates as u (u.deployId)}
    <article class:high={u.high}>
      <div class="meta">
        <a href={`/apps/${u.slug}`}>{u.appName ?? u.slug}</a>
        <span>v{u.version}</span>
        <span class="score">delta {u.score}</span>
        {#if u.high}<strong class="hi">high</strong>{/if}
        {#if u.isArchived}<strong class="down">offline</strong>{/if}
      </div>
      <ul class="additions">
        {#each u.additions as add}<li>{add}</li>{/each}
      </ul>
      <small>
        {u.createdAt} · {u.upvoteCount} favourites · {u.activeUsers30d} active/30d ·
        <a href={`/maker/apps/${u.slug}/deploys/${u.deployId}`}>flight recorder →</a>
      </small>
    </article>
  {/each}
  {#if data.updates.length === 0}
    <article class="empty"><p>No behavior-changing updates to review.</p></article>
  {/if}
</section>

<style>
  header { display: flex; gap: 1rem; align-items: end; margin-bottom: 0.75rem; }
  header p, header span { margin: 0; color: var(--text-secondary); font-family: var(--font-mono); font-size: var(--text-caption); }
  h1 { margin: 0; font-size: var(--text-title); }
  .lede { color: var(--text-secondary); max-width: 70ch; margin: 0 0 1rem; }
  .toggle { margin-bottom: 1rem; }
  .toggle a { color: var(--sunset); text-decoration: none; font-size: var(--text-caption); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.04em; }
  section { border-top: 1px solid var(--border-light); }
  article { padding: 1rem 0; border-bottom: 1px solid var(--border-light); }
  article.high { box-shadow: inset 3px 0 0 var(--sunset); padding-left: 0.75rem; }
  article.empty { color: var(--text-secondary); padding: 2rem 0; text-align: center; border: 1px dashed var(--border-light); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-family: var(--font-mono); font-size: var(--text-caption); text-transform: uppercase; }
  .meta a { color: var(--sunset); text-decoration: none; }
  .meta span, .meta strong { border: 1px solid var(--border-light); padding: 2px 7px; color: var(--text); }
  .meta .score { color: var(--text-secondary); }
  .meta .hi { border-color: var(--sunset); color: var(--sunset); }
  .meta .down { border-color: var(--marigold); color: var(--marigold); }
  .additions { margin: 0.6rem 0 0.4rem; padding-left: 1.1rem; color: var(--text); }
  .additions li { margin: 0.15rem 0; }
  small { color: var(--text-light); font-family: var(--font-mono); font-size: var(--text-caption); }
  small a { color: var(--text-secondary); }
  small a:hover { color: var(--sunset); }
</style>
