<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Sign in to Shippie</title>
</svelte:head>

<main class="page">
  <div class="card">
    <a class="back" href="/">← shippie.app</a>
    <img
      src="/__shippie-pwa/icon.svg"
      alt=""
      width="64"
      height="64"
      class="login-mark"
      aria-hidden="true"
    />
    <h1>Sign in to Shippie</h1>
    <p class="lede">We'll send you a magic link. No password.</p>

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
        <span class="sr-only">Email address</span>
        <input
          type="email"
          name="email"
          required
          autocomplete="email"
          placeholder="you@example.com"
          autofocus
        />
      </label>
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send magic link'}
      </button>
    </form>

    <p class="hint">
      {data.devMode ? 'dev mode · link prints to your terminal' : 'magic link sent by email'}
    </p>
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
  .login-mark {
    display: block;
    width: 64px;
    height: 64px;
    margin-bottom: 0.25rem;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lede {
    color: #5C5751;
    margin: 0 0 0.25rem 0;
  }
  .field {
    display: block;
  }
  input[type='email'] {
    width: 100%;
    height: 48px;
    padding: 0 1.25rem;
    background: transparent;
    border: 1px solid #C9C2B1;
    color: inherit;
    font-size: 15px;
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
  }
  input[type='email']:focus {
    border-color: #E8603C;
  }
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
  .btn-primary:hover { filter: brightness(1.05); }
  .btn-primary:disabled { opacity: 0.6; cursor: progress; }
  .btn-oauth {
    width: 100%;
    height: 48px;
    background: transparent;
    color: inherit;
    border: 1px solid #C9C2B1;
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
    border-top: 1px solid #E5DDC8;
  }
  .divider span {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #8B847A;
  }
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
  .dim { color: #8B847A; font-size: 12px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  @media (prefers-color-scheme: dark) {
    .page { background: #14120F; color: #EDE4D3; }
    .lede { color: #A39A8B; }
    input[type='email'] { border-color: #3A352D; }
    .btn-oauth { border-color: #3A352D; color: #EDE4D3; }
    .btn-oauth:hover { background: rgba(255,255,255,0.04); }
    .divider::before, .divider::after { border-color: #2A251E; }
  }
</style>
