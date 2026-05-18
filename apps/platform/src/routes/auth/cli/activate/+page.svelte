<script lang="ts">
  import { enhance } from '$app/forms';
  import EntryNav from '$lib/components/layout/EntryNav.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Activate CLI · Shippie</title>
</svelte:head>

<main class="page">
  <div class="shell">
    <EntryNav actions={[{ href: '/new', label: 'Ship app' }]} />

    <section class="intro" aria-labelledby="cli-title">
      <p class="eyebrow">Device approval</p>
      <h1 id="cli-title">Activate the CLI</h1>
      <p class="lede">
        Enter the code from your terminal. Approving links your CLI to
        <strong>{data.userEmail}</strong>.
      </p>
    </section>

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
    <a class="continue-link" href="/">Return to the tool launcher</a>
  </div>
</main>

<style>
  .page {
    min-height: 100svh;
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1.25rem calc(var(--safe-bottom, 0px) + 2rem);
    background: var(--bg, #FAF7EF);
    color: var(--text, #14120F);
  }
  .shell {
    width: 100%;
    max-width: 30rem;
    min-height: calc(100svh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    min-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    margin: 0 auto;
    display: grid;
    align-content: start;
    gap: 1.1rem;
  }
  .intro {
    display: grid;
    gap: 0.8rem;
    margin-top: clamp(2rem, 14vh, 6rem);
    padding-top: 1rem;
    border-top: 2px solid var(--sunset, #E8603C);
  }
  .eyebrow {
    margin: 0;
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: var(--caption-size, 0.72rem);
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  h1 {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: clamp(2.25rem, 9vw, 3.6rem);
    line-height: 0.98;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede { color: var(--text-secondary, #5C5751); line-height: 1.55; margin: 0; }
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
    min-height: var(--touch-min, 48px);
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
  .continue-link {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sunset, #E8603C);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
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
  @media (max-width: 640px) {
    .page {
      padding: calc(var(--safe-top, 0px) + 0.75rem) 1rem calc(var(--safe-bottom, 0px) + 1.25rem);
    }
    .intro {
      margin-top: 1.5rem;
    }
  }
  @media (prefers-color-scheme: dark) {
    .page { background: var(--bg, #14120F); color: var(--text, #EDE4D3); }
    .lede { color: #A39A8B; }
    input[type='text'] { border-color: #3A352D; }
  }
</style>
