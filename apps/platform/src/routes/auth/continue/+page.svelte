<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const receiveHref = $derived(`/auth/receive?return_to=${encodeURIComponent(data.returnTo)}`);
</script>

<svelte:head>
  <title>Continue sign-in · Shippie</title>
</svelte:head>

<main class="page">
  <section class="shell" aria-labelledby="continue-title">
    <a class="brand" href="/dock">shippie</a>

    <header class="intro">
      <p class="eyebrow">Signed in</p>
      <h1 id="continue-title">Choose where this login goes</h1>
      <p>
        This browser is signed in as <strong>{data.userEmail}</strong>. Continue here, or approve a
        one-time code from another open Shippie.
      </p>
    </header>

    <div class="actions">
      <a class="primary" href={data.returnTo}>Continue in this browser</a>
      <a href={receiveHref}>Get a code for this Shippie</a>
    </div>

    <section class="approve" aria-labelledby="approve-title">
      <div>
        <p class="eyebrow">Another Shippie</p>
        <h2 id="approve-title">Approve a sign-in code</h2>
        <p>Use this when your email link opened here, but the Safari PWA or another tab is waiting.</p>
      </div>

      {#if form?.error}
        <p class="error" role="alert">{form.error}</p>
      {/if}
      {#if form?.ok}
        <p class="ok" role="status">
          Approved {form.clientName}. Return to that Shippie to finish.
        </p>
      {/if}

      <form method="POST" action="?/approveCode">
        <label>
          <span>Sign-in code</span>
          <input
            name="user_code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="20"
            placeholder="BCDF-GHJK"
          />
        </label>
        <button type="submit">Approve code</button>
      </form>
    </section>
  </section>
</main>

<style>
  .page {
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1rem calc(var(--safe-bottom, 0px) + 1.5rem);
    background: var(--bg, #FAF7EF);
    color: var(--text, #14120F);
  }
  .shell {
    width: min(100%, 38rem);
    margin: 0 auto;
    display: grid;
    gap: 1.2rem;
  }
  .brand {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 1.35rem;
    font-weight: 700;
  }
  .intro,
  .approve {
    display: grid;
    gap: 0.65rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light, #E5DDC8);
  }
  .eyebrow,
  label span {
    margin: 0;
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.7rem;
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
    font-size: clamp(2.2rem, 9vw, 3.8rem);
    line-height: 0.98;
  }
  h2 {
    font-size: 1.45rem;
    line-height: 1.08;
  }
  p {
    margin: 0;
    color: var(--text-secondary, #5C5751);
    line-height: 1.55;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .actions a,
  form button {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.95rem;
    border: 1px solid var(--border-light, #E5DDC8);
    color: inherit;
    background: transparent;
    text-decoration: none;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .actions .primary,
  form button {
    border-color: var(--sunset, #E8603C);
    background: var(--sunset, #E8603C);
    color: white;
  }
  form {
    display: grid;
    gap: 0.65rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
  }
  input {
    min-height: 52px;
    padding: 0 1rem;
    border: 1px solid var(--border-paper-mid, #D7C8B1);
    background: transparent;
    color: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 20px;
    letter-spacing: 0.12em;
    text-align: center;
    text-transform: uppercase;
  }
  .error,
  .ok {
    padding: 0.75rem 0.9rem;
    border: 1px solid;
    font-size: 14px;
  }
  .error { color: var(--danger, #B43F2A); border-color: currentColor; }
  .ok { color: var(--success, #2E7D5B); border-color: currentColor; }
</style>
