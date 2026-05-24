<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Admin · Parade Route Pack · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow">Admin · Parade Companion</p>
  <h1>Live route pack</h1>
  <p class="lede">
    Publish route, transport, safety, POI, chant, and poll updates without touching anyone's saved group plan,
    local taps, names, or Banter votes. Phones accept only newer packs that pass client validation.
  </p>
</header>

{#if !data.available}
  <section class="notice error">KV cache unavailable in this environment.</section>
{/if}
{#if form?.ok}
  <section class="notice ok">{form.message}</section>
{/if}
{#if form?.error}
  <section class="notice error">{form.error}</section>
{/if}

<div class="layout">
  <form method="POST" action="?/publish" class="panel">
    <section class="status">
      <div>
        <p class="eyebrow">Current live pack</p>
        {#if data.current}
          <h2>{data.current.packVersion}</h2>
          <p>
            {data.current.title} · {data.current.status} · {data.current.poiCount} POIs ·
            {data.current.scheduleCount} schedule rows
          </p>
        {:else}
          <h2>No live override</h2>
          <p>Fans are using the baked offline pack until you publish one here.</p>
        {/if}
      </div>
      <a href="/__shippie/parade/route-pack" target="_blank" rel="noreferrer">Open public JSON</a>
    </section>

    <label>
      Route-pack JSON
      <textarea
        name="routePack"
        rows="24"
        spellcheck="false"
        placeholder="Paste the full route-pack JSON here"
      >{data.currentJson}</textarea>
    </label>

    <div class="actions">
      <button type="submit" formaction="?/validate">Validate only</button>
      <button type="submit">Publish live pack</button>
    </div>
  </form>

  <aside class="notes">
    <h2>Rules</h2>
    <ul>
      <li>Bump <code>packVersion</code> for every correction.</li>
      <li>Coordinates must stay inside the parade corridor.</li>
      <li>The app fetches this only when online.</li>
      <li>If this is invalid or older, phones keep their current pack.</li>
      <li>User setup lives in separate local stores and is never rewritten by this.</li>
    </ul>

    <form method="POST" action="?/clear" class="clear-form">
      <button type="submit">Clear live override</button>
    </form>
  </aside>
</div>

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
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
  h1 { font-size: 2.25rem; margin: 0.25rem 0 0.5rem; }
  h2 { margin: 0 0 0.5rem; }
  .lede,
  .status p,
  .notes li { color: var(--text-secondary, #B8A88F); }
  .notice,
  .panel,
  .notes {
    border: 1px solid var(--border-light, #2A251E);
    background: rgba(255,255,255,0.02);
  }
  .notice { padding: 0.75rem 1rem; margin-bottom: 1rem; }
  .notice.ok { border-color: rgba(122, 154, 110, 0.55); color: var(--sage-highlight, #A8C491); }
  .notice.error { border-color: rgba(232, 96, 60, 0.6); color: var(--sunset, #E8603C); }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    gap: 1rem;
    align-items: start;
  }
  .panel,
  .notes { padding: 1.25rem; }
  .status {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
    border-bottom: 1px solid var(--border-light, #2A251E);
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }
  .status a {
    color: var(--marigold, #E8C547);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-decoration: none;
    white-space: nowrap;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text-secondary, #B8A88F);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border-light, #2A251E);
    background: rgba(0,0,0,0.22);
    color: var(--text, #EDE4D3);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.55;
    padding: 0.9rem;
    border-radius: 0;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }
  button {
    border: 1px solid var(--border-light, #2A251E);
    background: var(--sunset, #E8603C);
    color: white;
    border-radius: 0;
    padding: 0.7rem 1rem;
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  button[formaction],
  .clear-form button {
    background: transparent;
    color: var(--text, #EDE4D3);
  }
  .notes ul { padding-left: 1.1rem; }
  .notes li { margin: 0.65rem 0; }
  code {
    color: var(--marigold, #E8C547);
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .clear-form {
    border-top: 1px solid var(--border-light, #2A251E);
    padding-top: 1rem;
    margin-top: 1rem;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .status { flex-direction: column; }
  }
</style>
