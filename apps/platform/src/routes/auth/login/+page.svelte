<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);

  const copy = $derived.by(() => {
    if (data.intent === 'admin') {
      return {
        eyebrow: 'Admin',
        title: 'Sign in',
        lede: 'Operator tools for reviews, moderation, audit logs, and platform health.',
        panelTitle: 'Continue to Admin',
        panelText: 'Use GitHub or a magic link. We will send you back after sign-in.',
        primary: 'Sign in to Admin',
        secondary: 'Back to Dock',
        strip: ['Protected', 'Admin only', 'Magic link'],
      };
    }
    if (data.intent === 'maker') {
      return {
        eyebrow: 'Maker',
        title: 'Sign in',
        lede: 'Manage apps, deploys, feedback, and access across phone and desktop.',
        panelTitle: 'Continue to Maker',
        panelText: 'Use GitHub or a magic link. We will send you back after sign-in.',
        primary: 'Sign in to Maker',
        secondary: 'Back to Dock',
        strip: ['Apps', 'Deploys', 'Magic link'],
      };
    }
    return {
      eyebrow: 'Account',
      title: 'Optional',
      lede: 'Shippie works locally without an account. Sign in for sync, recovery, or builder tools.',
      panelTitle: 'Sign in when you need it',
      panelText: 'Use a magic link. No password to remember.',
      primary: 'Continue without account',
      secondary: 'Browse tools',
      strip: ['Local first', 'No password', 'Magic link'],
    };
  });
</script>

<svelte:head>
  <title>Sign in · Shippie</title>
</svelte:head>

<main class="page">
  <div class="shell">
    <header class="topbar" aria-label="Shippie sign in">
      <a href="/dock" class="brand" aria-label="Open Shippie Dock">
        <img
          src="/__shippie-pwa/icon.svg"
          alt=""
          width="26"
          height="26"
          aria-hidden="true"
        />
        <span>shippie</span>
      </a>
      <a class="skip-top" href="/dock">{data.requiresAccount ? 'Back to Dock' : 'Skip sign in'}</a>
    </header>

    <section class="intro" aria-labelledby="login-title">
      <p class="eyebrow">{copy.eyebrow}</p>
      <h1 id="login-title">{copy.title}</h1>
      <p class="lede">{copy.lede}</p>

      <div class="hero-actions">
        {#if data.requiresAccount}
          <a class="continue-primary" href="#signin-panel-title">{copy.primary}</a>
        {:else}
          <a class="continue-primary" href={data.continueTo}>{copy.primary}</a>
          <a class="browse-link" href="/tools">{copy.secondary}</a>
        {/if}
      </div>

      <div class="local-strip" aria-label="Local-first account summary">
        {#each copy.strip as label}
          <span>{label}</span>
        {/each}
      </div>
    </section>

    <section class="panel" aria-labelledby="signin-panel-title">
      <div class="panel-head">
        <p class="eyebrow">Sign in</p>
        <h2 id="signin-panel-title">{copy.panelTitle}</h2>
        <p>{copy.panelText}</p>
      </div>

      {#if form?.error}
        <div class="error" role="alert">{form.error}</div>
      {/if}
      {#if form?.success}
        <div class="ok" role="status">
          Check your email. We sent a magic link to <strong>{form.email}</strong>.
          {#if data.devMode}
            <br />
            <span class="dim">Dev mode: the link also printed to your terminal.</span>
          {/if}
        </div>
      {/if}

      {#if data.githubEnabled}
        <form method="POST" action="?/github" class="oauth">
          <button type="submit" class="btn-oauth">
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.6.8.6 1.6V15.4c0 .2.1.5.5.4A8 8 0 0 0 8 .2Z"/>
            </svg>
            Sign in with GitHub
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
          {submitting ? 'Sending...' : 'Send magic link'}
        </button>
      </form>

      <a class="code-link" href={`/auth/receive?return_to=${encodeURIComponent(data.returnTo)}`}>
        Use a one-time code instead
      </a>

      <p class="hint">
        {data.devMode ? 'Dev mode: link prints to your terminal.' : 'Magic link sent by email.'}
      </p>
    </section>
  </div>
</main>

<style>
  .page {
    min-height: 100svh;
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1.25rem calc(var(--safe-bottom, 0px) + 1.5rem);
    background: var(--bg, #FAF7EF);
    color: var(--text, #14120F);
  }
  .shell {
    width: 100%;
    max-width: 880px;
    min-height: calc(100svh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 2.5rem);
    min-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 2.5rem);
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto auto;
    gap: 1.25rem;
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
  .continue-primary,
  .browse-link {
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
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0;
  }
  .skip-top {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    color: var(--text-light, #8B847A);
    font-size: 0.95rem;
  }
  .skip-top:hover {
    color: var(--text, #14120F);
  }
  .intro {
    display: grid;
    align-content: center;
    gap: 0.85rem;
    padding: 1rem 0 0.5rem;
  }
  .eyebrow {
    margin: 0;
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: var(--caption-size, 0.72rem);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h1,
  h2 {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    letter-spacing: 0;
    margin: 0;
  }
  h1 {
    max-width: 11ch;
    font-size: 2.75rem;
    line-height: 1;
  }
  h2 {
    font-size: 1.6rem;
    line-height: 1.08;
  }
  .lede,
  .panel-head p {
    max-width: 31rem;
    color: var(--text-secondary, #5C5751);
    font-size: 1.05rem;
    line-height: 1.55;
    margin: 0;
  }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    margin-top: 0.1rem;
  }
  .continue-primary {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 1rem;
    background: var(--sunset, #E8603C);
    color: var(--bg-pure, #fffaf0);
    font-weight: 700;
  }
  .continue-primary:hover {
    background: var(--sunset-hover, #D95634);
  }
  .browse-link {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    color: var(--text-secondary, #5C5751);
  }
  .browse-link:hover {
    color: var(--text, #14120F);
  }
  .local-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .local-strip span {
    min-height: 30px;
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
    display: grid;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light, #E5DDC8);
  }
  .panel-head {
    display: grid;
    gap: 0.45rem;
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
    padding: 0 1rem;
    background: transparent;
    border: 1px solid var(--border-light);
    color: inherit;
    font-size: 16px;
    outline: none;
    border-radius: 0;
    box-sizing: border-box;
  }
  input[type='email']:focus {
    border-color: var(--sunset);
  }
  form button.btn {
    margin-top: 0.5rem;
  }
  .btn-oauth {
    width: 100%;
    min-height: var(--touch-min, 48px);
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-light);
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    border-radius: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .btn-oauth:hover {
    background: rgba(255, 255, 255, 0.05);
  }
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
  .divider span,
  .hint {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    color: var(--text-secondary);
  }
  .divider span {
    font-size: 12px;
  }
  .hint {
    text-align: center;
    font-size: 11px;
    margin: 0;
  }
  .code-link {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sunset, #E8603C);
    font-weight: 700;
    text-decoration: none;
  }
  .error,
  .ok {
    padding: 0.875rem 1rem;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid;
  }
  .error {
    border-color: var(--danger);
    color: var(--danger);
    background: rgba(180, 63, 42, 0.05);
  }
  .ok {
    border-color: var(--success);
    color: var(--success);
    background: rgba(46, 125, 91, 0.05);
  }
  .dim {
    color: var(--text-secondary);
    font-size: 12px;
  }
  @media (min-width: 760px) {
    .shell {
      grid-template-columns: minmax(0, 0.95fr) minmax(20rem, 23rem);
      grid-template-rows: 1fr;
      column-gap: 3rem;
      padding-top: var(--nav-height, 72px);
    }
    .topbar {
      display: none;
    }
    .intro {
      min-height: 28rem;
      padding: 2rem 0;
    }
    h1 {
      font-size: 4rem;
    }
    .panel {
      align-self: center;
      padding-top: 0;
      padding-left: 1.25rem;
      border-top: 0;
      border-left: 1px solid var(--border-light, #E5DDC8);
    }
  }
  @media (max-width: 520px) {
    .page {
      padding-left: calc(1rem + var(--safe-left, 0px));
      padding-right: calc(1rem + var(--safe-right, 0px));
    }
    h1 {
      font-size: 2.55rem;
    }
    h2 {
      font-size: 1.4rem;
    }
    .hero-actions {
      display: grid;
      gap: 0.4rem;
    }
    .continue-primary,
    .browse-link {
      width: 100%;
    }
    .browse-link {
      justify-content: center;
    }
  }
  @media (prefers-color-scheme: dark) {
    .page {
      background: var(--bg, #0D0C0A);
      color: var(--text, #F3EEE2);
    }
    .lede,
    .panel-head p {
      color: var(--text-secondary, #B8AA94);
    }
    .browse-link,
    .skip-top {
      color: var(--text-light, #9A8F7E);
    }
    .browse-link:hover,
    .skip-top:hover {
      color: var(--text, #F3EEE2);
    }
    .local-strip span {
      border-color: var(--border, #3D352F);
    }
    .btn-oauth:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }
</style>
