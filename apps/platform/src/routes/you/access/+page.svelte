<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  function formatDate(value: string | null): string {
    if (!value) return 'unknown';
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
      ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function surfaceLabel(value: string | null): string {
    switch (value) {
      case 'pwa':
        return 'PWA';
      case 'mobile_web':
        return 'Mobile browser';
      case 'desktop_web':
        return 'Desktop browser';
      case 'web':
        return 'Web';
      default:
        return 'Browser';
    }
  }
</script>

<svelte:head>
  <title>Access · Shippie</title>
</svelte:head>

<main class="access-page">
  <header class="head">
    <a href="/you" class="back">You</a>
    <p class="eyebrow">Account access</p>
    <h1>Signed-in places</h1>
    <p>Manage browsers, PWAs, tabs, and CLI tokens connected to <strong>{data.userEmail}</strong>.</p>
    <div class="head-actions">
      <a class="primary" href="/auth/receive?return_to=%2Fyou%2Faccess">Sign in another Shippie</a>
      <a href="/auth/continue?return_to=%2Fyou%2Faccess">Approve a code</a>
    </div>
  </header>

  {#if form?.error}
    <p class="error" role="alert">{form.error}</p>
  {/if}
  {#if form?.ok}
    <p class="ok" role="status">Access updated.</p>
  {/if}

  <section class="block" aria-labelledby="web-title">
    <div class="section-head">
      <div>
        <p class="eyebrow">Web</p>
        <h2 id="web-title">Browsers and PWAs</h2>
      </div>
      <span>{data.sessions.length}</span>
    </div>

    {#if data.sessions.length === 0}
      <p class="empty">No active web sessions were found.</p>
    {:else}
      <div class="session-list">
        {#each data.sessions as session (session.id)}
          <article class="session-row">
            <div>
              <div class="row-title">
                <strong>{session.client_name ?? 'Shippie browser'}</strong>
                {#if session.id === data.currentSessionId}<span>current</span>{/if}
              </div>
              <p>
                {surfaceLabel(session.client_surface)} · last seen {formatDate(session.last_seen_at)}
                · expires {formatDate(session.expires_at)}
              </p>
            </div>
            <form method="POST" action="?/revokeSession">
              <input type="hidden" name="session_id" value={session.id} />
              <button type="submit">
                {session.id === data.currentSessionId ? 'Sign out here' : 'Revoke'}
              </button>
            </form>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="block" aria-labelledby="cli-title">
    <div class="section-head">
      <div>
        <p class="eyebrow">Developer</p>
        <h2 id="cli-title">CLI tokens</h2>
      </div>
      <span>{data.cliTokens.length}</span>
    </div>

    {#if data.cliTokens.length === 0}
      <p class="empty">No active CLI tokens.</p>
    {:else}
      <div class="session-list">
        {#each data.cliTokens as token (token.id)}
          <article class="session-row">
            <div>
              <strong>{token.client_name}</strong>
              <p>
                Last used {formatDate(token.last_used_at)} · created {formatDate(token.created_at)}
                {#if token.expires_at} · expires {formatDate(token.expires_at)}{/if}
              </p>
            </div>
            <form method="POST" action="?/revokeCli">
              <input type="hidden" name="token_id" value={token.id} />
              <button type="submit">Revoke</button>
            </form>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .access-page {
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) clamp(1rem, 4vw, 2.5rem) calc(var(--safe-bottom, 0px) + 2rem);
    background: var(--bg);
    color: var(--text);
  }
  .head,
  .block {
    width: min(100%, 58rem);
    margin: 0 auto;
  }
  .head {
    display: grid;
    gap: 0.7rem;
    padding-top: 1rem;
  }
  .back {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-self: start;
    color: var(--sunset, #E8603C);
    text-decoration: none;
    font-weight: 700;
  }
  .eyebrow {
    margin: 0;
    color: var(--sunset, #E8603C);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h1,
  h2 {
    margin: 0;
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    letter-spacing: 0;
  }
  h1 {
    font-size: var(--text-display);
    line-height: 0.98;
  }
  h2 {
    font-size: var(--text-subhead);
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 0.3rem;
  }
  .head-actions a,
  button {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.9rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: inherit;
    text-decoration: none;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .head-actions a:hover,
  button:hover {
    border-color: var(--border);
    background: var(--surface-alt);
  }
  .head-actions .primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: var(--bg);
  }
  .head-actions .primary:hover {
    border-color: var(--sunset);
    background: color-mix(in srgb, var(--sunset) 88%, white);
  }
  .block {
    display: grid;
    gap: 0.75rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }
  .section-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }
  .section-head > span,
  .row-title span {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--text-caption);
    color: var(--text-light);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .row-title span {
    color: var(--sunset);
    border: 1px solid color-mix(in srgb, var(--sunset) 40%, var(--border-light));
    padding: 0.05rem 0.35rem;
  }
  .session-list {
    display: grid;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .session-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    padding: 0.85rem;
    border-top: 1px solid var(--border-light);
  }
  .session-row:first-child {
    border-top: 0;
  }
  .row-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }
  .session-row strong {
    display: block;
  }
  .session-row p {
    margin-top: 0.2rem;
    font-size: var(--text-body);
  }
  .empty {
    padding: 1rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text-light);
  }
  .error,
  .ok {
    width: min(100%, 58rem);
    margin: 1rem auto 0;
    padding: 0.75rem 0.9rem;
    border: 1px solid;
  }
  .error { color: var(--danger, #B43F2A); }
  .ok { color: var(--success, #2E7D5B); }
  @media (max-width: 640px) {
    .session-row {
      grid-template-columns: 1fr;
    }
    .session-row form,
    .session-row button {
      width: 100%;
    }
  }
</style>
