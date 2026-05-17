<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const statuses = ['reviewing', 'hidden', 'resolved', 'spam', 'open'];
</script>

<svelte:head><title>Moderation · Admin</title></svelte:head>

<header>
  <p>Admin</p>
  <h1>Moderation</h1>
  <span>{data.items.length} feedback items</span>
</header>

{#if form?.ok}<p class="ok">Moderation status updated.</p>{/if}

<section>
  {#each data.items as item (item.id)}
    <article>
      <div class="meta">
        <a href={`/apps/${item.appSlug}`}>{item.appName}</a>
        <span>{item.type}</span>
        <span>{item.status}</span>
        {#if item.rating}<strong>{item.rating}/5</strong>{/if}
      </div>
      {#if item.title}<h2>{item.title}</h2>{/if}
      {#if item.body}<p>{item.body}</p>{/if}
      {#if Array.isArray(item.metadata?.moderation_flags) && item.metadata.moderation_flags.length > 0}
        <div class="flags">
          {#each item.metadata.moderation_flags as flag}
            <span>{flag}</span>
          {/each}
        </div>
      {/if}
      <small>{item.createdAt} · maker {item.makerEmail}</small>
      <form method="POST" action="?/setStatus">
        <input type="hidden" name="id" value={item.id} />
        {#each statuses as status}
          <button type="submit" name="status" value={status}>{status}</button>
        {/each}
      </form>
    </article>
  {/each}
</section>

<style>
  header { display: flex; gap: 1rem; align-items: end; margin-bottom: 1.5rem; }
  header p, header span { margin: 0; color: #B8A88F; font-family: ui-monospace, monospace; font-size: 12px; }
  h1 { margin: 0; font-size: 2rem; }
  .ok { color: #A8C491; }
  section { border-top: 1px solid #2A251E; }
  article { padding: 1rem 0; border-bottom: 1px solid #2A251E; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; }
  .meta a { color: #E8603C; text-decoration: none; }
  .meta span, .meta strong { border: 1px solid #3A352D; padding: 2px 7px; color: #EDE4D3; }
  h2 { margin: 0.65rem 0 0.25rem; font-size: 1.1rem; }
  p { color: #B8A88F; max-width: 76ch; }
  small { color: #7A6B58; font-family: ui-monospace, monospace; font-size: 11px; }
  form { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }
  .flags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.6rem 0; }
  .flags span { border: 1px solid rgba(232,197,71,0.38); color: #E8C547; padding: 2px 7px; font-family: ui-monospace, monospace; font-size: 11px; }
  button { border: 1px solid #3A352D; background: transparent; color: #EDE4D3; padding: 0.35rem 0.6rem; cursor: pointer; }
  button:hover { border-color: #E8603C; color: #E8603C; }
</style>
