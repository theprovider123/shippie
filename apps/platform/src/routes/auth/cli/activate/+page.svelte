<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Activate CLI · Shippie</title>
</svelte:head>

<main class="page">
  <div class="card">
    <a class="back" href="/">← shippie.app</a>
    <h1>Activate the CLI</h1>
    <p class="lede">
      Enter the code from your terminal. Approving links your CLI to <strong>{data.userEmail}</strong>.
    </p>

    {#if form?.error}
      <div class="error" role="alert">{form.error}</div>
    {/if}
    {#if form?.success}
      <div class="ok" role="status">
        Approved. You can return to your terminal — the CLI will pick up the token within a few seconds.
      </div>
    {/if}

    <form method="POST" use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}>
      <label class="field">
        <span class="sr-only">User code</span>
        <input
          type="text"
          name="user_code"
          required
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          autofocus
          maxlength="20"
          value={data.prefilledCode ?? ''}
          placeholder="BCDF-GHJK"
        />
      </label>
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? 'Approving…' : 'Approve CLI'}
      </button>
    </form>

    <p class="hint">Codes expire 15 minutes after the CLI requests them.</p>
  </div>
</main>

<style>
  .page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 6rem 1.5rem 3rem;
    background: #FAF7EF;
    color: #14120F;
  }
  .card {
    width: 100%;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .back {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #E8603C;
    text-decoration: none;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede { color: #5C5751; margin: 0; }
  .field { display: block; }
  input[type='text'] {
    width: 100%;
    height: 56px;
    padding: 0 1.25rem;
    background: transparent;
    border: 1px solid #C9C2B1;
    color: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 22px;
    letter-spacing: 0.15em;
    text-align: center;
    text-transform: uppercase;
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
  }
  input[type='text']:focus { border-color: #E8603C; }
  .btn-primary {
    width: 100%;
    height: 48px;
    background: #E8603C;
    color: #14120F;
    border: none;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    border-radius: 0;
    margin-top: 0.5rem;
  }
  .btn-primary:disabled { opacity: 0.6; cursor: progress; }
  .hint {
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: #8B847A;
    margin: 0;
  }
  .error, .ok {
    padding: 0.875rem 1rem;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid;
  }
  .error { border-color: #B43F2A; color: #B43F2A; background: rgba(180,63,42,0.05); }
  .ok { border-color: #2E7D5B; color: #2E7D5B; background: rgba(46,125,91,0.05); }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .lede { color: #A39A8B; }
    input[type='text'] { border-color: #3A352D; }
  }
</style>
