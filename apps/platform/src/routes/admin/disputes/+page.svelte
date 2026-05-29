<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Disputes · Admin</title></svelte:head>

<header>
  <p>Admin</p>
  <h1>App Kind disputes</h1>
  <span>{data.items.length} open disputes</span>
</header>

{#if form?.ok}<p class="ok">Dispute {form.decision}.</p>{/if}

{#if data.items.length === 0}
  <section class="empty">
    <h2>No open disputes</h2>
    <p>When a maker disputes the detected App Kind from their dashboard, the case lands here.</p>
  </section>
{:else}
  <section class="list">
    {#each data.items as item (item.id)}
      <article>
        <div class="meta">
          <a href={`/apps/${item.slug}`}>{item.name ?? item.slug}</a>
          <span>detected: {item.detectedKind ?? '—'}</span>
          {#if item.declaredKind}
            <span class="declared">declared: {item.declaredKind}</span>
          {/if}
          <span>{item.makerEmail}</span>
        </div>
        {#if item.disputeReason}
          <p class="reason">{item.disputeReason}</p>
        {:else}
          <p class="muted">Maker didn't include a reason. Encourage them to add one before acting.</p>
        {/if}
        <small>{item.updatedAt}</small>
        <form method="POST" action="?/decide">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="slug" value={item.slug} />
          <button type="submit" name="decision" value="accept">Accept claim</button>
          <button type="submit" name="decision" value="reject">Reject (keep detected)</button>
          <button type="submit" name="decision" value="dismiss">Dismiss (back to estimated)</button>
        </form>
      </article>
    {/each}
  </section>
{/if}

<style>
  header { display: flex; gap: 1rem; align-items: end; margin-bottom: 1.5rem; }
  header p, header span { margin: 0; color: var(--text-secondary); font-family: ui-monospace, monospace; font-size: 12px; }
  h1 { margin: 0; font-size: 2rem; }
  .ok { color: var(--sage-highlight); }
  .empty { padding: 4rem 2rem; text-align: center; border: 1px dashed var(--ink-warm-mid); }
  h2 { font-family: 'Fraunces', Georgia, serif; }
  .list { display: grid; gap: 0; border-top: 1px solid var(--ink-warm); }
  article { padding: 1rem 0; border-bottom: 1px solid var(--ink-warm); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; }
  .meta a { color: var(--sunset); text-decoration: none; }
  .meta span { border: 1px solid var(--ink-warm-mid); padding: 2px 7px; color: var(--text); }
  .meta .declared { border-color: rgba(232, 197, 71, 0.45); color: var(--marigold); }
  .reason { color: var(--text); max-width: 76ch; margin: 0.7rem 0 0; padding: 0.6rem 0.8rem; background: rgba(232, 96, 60, 0.06); border-left: 3px solid var(--sunset); }
  .muted { color: var(--text-muted-warm); margin: 0.5rem 0 0; }
  small { color: var(--text-light); font-family: ui-monospace, monospace; font-size: 11px; display: block; margin-top: 0.5rem; }
  form { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }
  button { border: 1px solid var(--ink-warm-mid); background: transparent; color: var(--text); padding: 0.45rem 0.8rem; cursor: pointer; min-height: var(--touch-min, 44px); }
  button:hover { border-color: var(--sunset); color: var(--sunset); }
</style>
