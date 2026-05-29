<script lang="ts">
  import { enhance } from '$app/forms';
  import EntryNav from '$lib/components/layout/EntryNav.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Sign in to Shippie</title>
</svelte:head>

<main class="page">
  <div class="shell">
    <EntryNav actions={[{ href: '/you', label: 'Your data' }]} />

    <section class="intro" aria-labelledby="login-title">
      <p class="eyebrow">Account optional</p>
      <h1 id="login-title">Sign in when you need sync.</h1>
      <p class="lede">
        The tool launcher works without an account. Sign in for builder tools,
        recovery, and keeping access tidy across devices.
      </p>
      <div class="local-strip" aria-label="Local-first account summary">
        <span>No password</span>
        <span>Magic link</span>
        <span>Keep browsing</span>
      </div>
    </section>

    <section class="panel" aria-label="Sign in options">
      {#if form?.error}
        <div class="error" role="alert">{form.error}</div>
      {/if}
      {#if form?.success}
        <div class="ok" role="status">
          Check your email — we sent a magic link to <strong>{form.email}</strong>.
          {#if data.devMode}
            <br />
            <span class="dim">(dev mode — link also printed to your terminal)</span>
          {/if}
        </div>
      {/if}

      {#if data.githubEnabled}
        <form method="POST" action="?/github" class="oauth">
          <button type="submit" class="btn-oauth">
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.6.8.6 1.6V15.4c0 .2.1.5.5.4A8 8 0 0 0 8 .2Z"/>
            </svg>
            Continue with GitHub
          </button>
        </form>
        <div class="divider"><span>or</span></div>
      {/if}

      <form method="POST" action="?/email" use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}>
        <label class="field">
          <span>Email address</span>
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
          />
        </label>
        <button type="submit" class="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <p class="hint">
        {data.devMode ? 'dev mode · link prints to your terminal' : 'magic link sent by email'}
      </p>
      <a class="continue-link" href="/">Continue to the tool launcher</a>
    </section>
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
    max-width: 920px;
    min-height: calc(100svh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    min-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 2rem;
  }
  .intro {
    display: grid;
    align-content: end;
    gap: 1rem;
    padding: 2rem 0;
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
    max-width: 11ch;
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: clamp(2.25rem, 8vw, 4.75rem);
    line-height: 0.98;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede {
    max-width: 34rem;
    color: var(--text-secondary, #5C5751);
    font-size: clamp(1rem, 2.2vw, 1.15rem);
    line-height: 1.55;
    margin: 0;
  }
  .local-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .local-strip span {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    padding: 0 0.7rem;
    border: 1px solid var(--border-light, #E5DDC8);
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 0.67rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .panel {
    width: 100%;
    max-width: 27rem;
    align-self: center;
    justify-self: end;
    display: grid;
    gap: 1rem;
    padding: 1.25rem 0 0 1.25rem;
    border-left: 2px solid var(--sunset, #E8603C);
  }
  .field {
    display: grid;
    gap: 0.5rem;
  }
  .field span {
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  input[type='email'] {
    width: 100%;
    height: 48px;
    padding: 0 1.25rem;
    background: transparent;
    border: 1px solid var(--border-paper-mid);
    color: inherit;
    font-size: var(--type-body-mobile, 16px);
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
  }
  input[type='email']:focus {
    border-color: var(--sunset);
  }
  /* Submit button uses the canonical `.btn .btn--primary .btn--block`
     primitives from tokens.css. Only spacing override stays local. */
  form button.btn { margin-top: 0.5rem; }
  .btn-oauth {
    width: 100%;
    min-height: var(--touch-min, 48px);
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-paper-mid);
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .btn-oauth:hover { background: rgba(0,0,0,0.04); }
  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--paper-cream);
  }
  .divider span {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--text-muted-warm);
  }
  .hint {
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--text-muted-warm);
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
  .error { border-color: var(--danger); color: var(--danger); background: rgba(180,63,42,0.05); }
  .ok { border-color: var(--success); color: var(--success); background: rgba(46,125,91,0.05); }
  .dim { color: var(--text-muted-warm); font-size: 12px; }
  @media (min-width: 641px) {
    .shell {
      grid-template-columns: minmax(0, 1fr) minmax(19rem, 27rem);
    }
    .shell :global(.entry-nav) {
      grid-column: 1 / -1;
    }
    .intro {
      min-height: 28rem;
    }
  }
  @media (max-width: 640px) {
    .page {
      padding: calc(var(--safe-top, 0px) + 0.75rem) 1rem calc(var(--safe-bottom, 0px) + 1.25rem);
    }
    .shell {
      gap: 1.25rem;
    }
    .intro {
      padding: 0.75rem 0 0.5rem;
      gap: 0.85rem;
    }
    h1 {
      max-width: 10ch;
      font-size: clamp(2.25rem, 14vw, 3.4rem);
    }
    .panel {
      max-width: none;
      justify-self: stretch;
      align-self: start;
    }
  }
  @media (prefers-color-scheme: dark) {
    .page { background: var(--bg, #14120F); color: var(--text, #EDE4D3); }
    .lede { color: var(--text-muted-cool); }
    input[type='email'] { border-color: var(--ink-warm-mid); }
    .btn-oauth { border-color: var(--ink-warm-mid); color: var(--text); }
    .btn-oauth:hover { background: rgba(255,255,255,0.04); }
    .divider::before, .divider::after { border-color: var(--ink-warm); }
  }
</style>
