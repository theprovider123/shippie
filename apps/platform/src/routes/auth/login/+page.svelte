<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);

  const copy = $derived.by(() => {
    if (data.intent === 'admin') {
      return {
        eyebrow: 'Admin',
        lede: 'Operator tools for reviews, moderation, audit logs, and platform health.',
        panelTitle: 'Continue to Admin',
        strip: ['Protected', 'Admin only', 'Magic link'],
      };
    }
    if (data.intent === 'maker') {
      return {
        eyebrow: 'Maker',
        lede: 'Manage apps, deploys, feedback, and access across phone and desktop.',
        panelTitle: 'Continue to Maker',
        strip: ['Apps', 'Deploys', 'Magic link'],
      };
    }
    return {
      eyebrow: 'Account',
      lede: 'Shippie works locally without an account. Sign in for sync, recovery, or builder tools.',
      panelTitle: 'Sign in when you need it',
      strip: ['Local first', 'No password', 'Magic link'],
    };
  });
</script>

<svelte:head>
  <title>Sign in · Shippie</title>
</svelte:head>

<main class="page">
  <header class="topbar" aria-label="Shippie sign in">
    <a href="/dock" class="brand" aria-label="Open Shippie Dock">
      <img src="/__shippie-pwa/icon.svg" alt="" width="24" height="24" aria-hidden="true" />
      <span>shippie</span>
    </a>
    <a class="skip-top" href="/dock">{data.requiresAccount ? 'Back to Dock' : 'Skip'}</a>
  </header>

  <div class="card-wrap">
    <section class="card" aria-labelledby="login-title">
      <p class="eyebrow">{copy.eyebrow}</p>
      <h1 id="login-title">{copy.panelTitle}</h1>
      <p class="lede">{copy.lede}</p>

      {#if form?.error}
        <div class="error" role="alert">{form.error}</div>
      {/if}
      {#if form?.success}
        <div class="ok" role="status">
          Check your email — we sent a magic link to <strong>{form.email}</strong>.
          {#if data.devMode}<br /><span class="dim">Dev mode: the link also printed to your terminal.</span>{/if}
        </div>
      {/if}

      {#if data.demoEnabled}
        <form method="POST" action="?/demo" class="oauth" use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}>
          <button type="submit" class="btn-demo" disabled={submitting}>
            {submitting ? 'Starting demo…' : 'Demo: sign in as Sarah Mitchell'}
          </button>
        </form>
        <p class="demo-note">
          Provisions the seeded demo school <strong>St Jude&rsquo;s &amp; St Paul&rsquo;s</strong> and lands on Today. Dev only.
        </p>
        <div class="divider"><span>or</span></div>
      {/if}

      {#if data.googleEnabled}
        <form method="POST" action="?/google" class="oauth">
          <button type="submit" class="btn-oauth">Continue with Google Workspace</button>
        </form>
      {/if}
      {#if data.microsoftEnabled}
        <form method="POST" action="?/microsoft" class="oauth">
          <button type="submit" class="btn-oauth">Continue with Microsoft 365</button>
        </form>
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
      {/if}
      {#if data.githubEnabled || data.googleEnabled || data.microsoftEnabled}
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
          <span>Email</span>
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
          />
        </label>
        <button type="submit" class="btn--primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      <a class="code-link" href={`/auth/receive?return_to=${encodeURIComponent(data.returnTo)}`}>
        Use a one-time code instead
      </a>
      {#if !data.requiresAccount}
        <a class="continue-without" href={data.continueTo}>Continue without an account</a>
      {/if}
    </section>

    <div class="local-strip" aria-label="Local-first account summary">
      {#each copy.strip as label}
        <span>{label}</span>
      {/each}
    </div>
  </div>
</main>

<style>
  .page {
    min-height: 100svh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top, 0px) + 1rem) calc(1.25rem + var(--safe-right, 0px))
      calc(var(--safe-bottom, 0px) + 1.5rem) calc(1.25rem + var(--safe-left, 0px));
    background: var(--bg);
    color: var(--text);
  }
  .topbar {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .brand,
  .skip-top,
  .code-link,
  .continue-without {
    text-decoration: none;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--touch-min, 44px);
    color: inherit;
  }
  .brand img {
    display: block;
    flex-shrink: 0;
  }
  .brand span {
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    font-weight: 700;
    letter-spacing: 0;
  }
  .skip-top {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    color: var(--text-light);
    font-size: var(--text-body);
  }
  .skip-top:hover {
    color: var(--text);
  }

  /* One centered, app-like card. */
  .card-wrap {
    flex: 1;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.25rem;
    padding: 1.5rem 0;
  }
  .card {
    display: grid;
    gap: 0.85rem;
  }
  .eyebrow {
    margin: 0;
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-title);
    line-height: 1.05;
    letter-spacing: 0;
  }
  .lede {
    margin: 0 0 0.35rem;
    color: var(--text-secondary);
    font-size: var(--text-body);
    line-height: 1.5;
  }
  .oauth {
    margin: 0;
  }
  .btn-oauth {
    width: 100%;
    min-height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-light);
    border-radius: 0;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-oauth:hover {
    background: var(--surface-alt);
    border-color: var(--sunset);
  }
  .btn-demo {
    width: 100%;
    min-height: var(--touch-min, 48px);
    background: #1B9B7A;
    color: #fff;
    border: none;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-shadow: inset 0 -3px 0 0 #E8953A;
  }
  .btn-demo:hover { filter: brightness(1.05); }
  .btn-demo:disabled { opacity: 0.6; cursor: progress; }
  .demo-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #8B847A;
  }
  .demo-note strong { color: #1B9B7A; }
  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--border-light);
  }
  .divider span {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  form {
    display: grid;
    gap: 0.6rem;
    margin: 0;
  }
  .field {
    display: grid;
    gap: 0.4rem;
  }
  .field span {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  input[type='email'] {
    width: 100%;
    height: 50px;
    padding: 0 1rem;
    background: var(--surface);
    border: 1px solid var(--border-light);
    color: var(--text);
    font-size: var(--text-body);
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
  }
  input[type='email']:focus {
    border-color: var(--sunset);
  }
  .btn--primary {
    min-height: 50px;
    width: 100%;
    border: 0;
    background: var(--sunset);
    color: var(--bg);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0;
  }
  .btn--primary:hover {
    filter: brightness(1.06);
  }
  .btn--primary:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .code-link,
  .continue-without {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-body);
  }
  .code-link {
    color: var(--sunset);
    font-weight: 600;
  }
  .continue-without {
    color: var(--text-light);
  }
  .continue-without:hover {
    color: var(--text);
  }
  .error,
  .ok {
    padding: 0.8rem 1rem;
    font-size: var(--text-small);
    line-height: 1.4;
    border: 1px solid;
  }
  .error {
    border-color: var(--danger);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
  }
  .ok {
    border-color: var(--sage-leaf);
    color: var(--sage-leaf);
    background: color-mix(in srgb, var(--sage-leaf) 8%, transparent);
  }
  .dim {
    color: var(--text-secondary);
    font-size: var(--text-caption);
  }
  .local-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .local-strip span {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    padding: 0 0.6rem;
    border: 1px solid var(--border-light);
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  @media (max-width: 640px) {
    h1 {
      font-size: var(--text-title);
    }
  }
</style>
