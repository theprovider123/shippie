<script lang="ts">
  import { enhance } from '$app/forms';
  import { Icon } from '$lib/uniti';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type Mode = 'sso' | 'magic' | 'quickpick';
  let mode = $state<Mode>(form?.mode === 'magic' ? 'magic' : 'sso');
  let submitting = $state<string | null>(null);

  // Quick-pick teachers mirror the prototype roster. For now each routes to the
  // demo sign-in (St Jude's) — wiring per-teacher PIN auth is a later phase.
  const teachers = [
    { name: 'Sarah Mitchell', role: 'Year 4 Teacher', initials: 'SM', color: '#2EAD73' },
    { name: 'Priya Sharma', role: 'Year 3 Teacher', initials: 'PS', color: '#3A8FCC' },
    { name: 'James Thompson', role: 'Headteacher', initials: 'JT', color: '#E8953A' },
    { name: 'Tom Bridges', role: 'Teaching Asst', initials: 'TB', color: '#8B6BD6' },
  ];

  const ssoProviders = $derived([
    {
      key: 'google',
      provider: 'Google Workspace',
      letter: 'G',
      color: '#EA4335',
      bg: '#FEF2F2',
      enabled: data.googleEnabled,
    },
    {
      key: 'microsoft',
      provider: 'Microsoft 365',
      letter: 'M',
      color: '#0078D4',
      bg: '#EFF6FF',
      enabled: data.microsoftEnabled,
    },
  ]);

  const submit = (name: string) => () => {
    submitting = name;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update({ reset: false });
      submitting = null;
    };
  };
</script>

<svelte:head>
  <title>Sign in · uniti School Cloud</title>
</svelte:head>

<div class="login">
  <!-- Left brand panel -->
  <aside class="brand">
    <svg class="dotgrid" aria-hidden="true" width="100%" height="100%">
      <defs>
        <pattern id="dotgrid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="2" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
    </svg>

    <div class="brand-top">
      <div class="wordmark">uniti</div>
      <div class="subtitle">School Cloud</div>
    </div>

    <div class="brand-school">
      <div class="badge">{data.branding.badge}</div>
      <div class="school-name">{data.branding.schoolName}</div>
      <div class="school-meta">{data.branding.meta}</div>
      <div class="school-term">{data.branding.term}</div>
    </div>

    <div class="trust">
      {#each ['Private school cloud', 'GDPR compliant · UK data', 'Works offline · Wonde MIS sync'] as cue (cue)}
        <div class="trust-row">
          <span class="trust-check"><Icon name="check" size={10} color="white" /></span>
          {cue}
        </div>
      {/each}
    </div>
  </aside>

  <!-- Right form panel -->
  <main class="form-panel">
    <div class="form-inner">
      {#if form?.error}
        <div class="alert error" role="alert">{form.error}</div>
      {/if}

      {#if mode === 'sso'}
        {#if form?.success}
          <div class="alert ok" role="status">
            Check your email — we sent a magic link to <strong>{form.email}</strong>.
          </div>
        {/if}

        <h1>Welcome back</h1>
        <p class="lede">Sign in to your school workspace</p>

        <div class="sso-stack">
          {#each ssoProviders as p (p.key)}
            {#if p.enabled}
              <form method="POST" action="?/{p.key}" use:enhance={submit(p.key)}>
                <button type="submit" class="sso-btn" disabled={submitting === p.key}>
                  <span class="sso-glyph" style="background:{p.bg};color:{p.color}">{p.letter}</span>
                  <span>Continue with {p.provider}</span>
                </button>
              </form>
            {:else}
              <button type="button" class="sso-btn" disabled aria-disabled="true">
                <span class="sso-glyph" style="background:{p.bg};color:{p.color}">{p.letter}</span>
                <span class="sso-label">
                  Continue with {p.provider}
                  <small>Ask your admin to enable</small>
                </span>
              </button>
            {/if}
          {/each}
        </div>

        <div class="divider"><span>or</span></div>

        <button type="button" class="quiet-btn" onclick={() => (mode = 'magic')}>
          Sign in with magic link
        </button>

        <form method="POST" action="?/demo" use:enhance={submit('quickpick')}>
          <input type="hidden" name="quickpick" value="shared-device" />
          <button type="submit" class="quiet-btn with-icon" disabled={submitting === 'quickpick'}>
            <Icon name="pupils" size={14} />
            {submitting === 'quickpick' ? 'Opening…' : 'Shared device — quick pick teacher'}
          </button>
        </form>

        {#if data.demoEnabled}
          <div class="demo-link">
            <form method="POST" action="?/demo" use:enhance={submit('demo')}>
              <button type="submit" class="link" disabled={submitting === 'demo'}>
                {submitting === 'demo' ? 'Starting demo…' : 'Demo: sign in as Sarah Mitchell →'}
              </button>
            </form>
          </div>
        {/if}

        <div class="privacy-pill">
          <Icon name="shield" size={13} color="var(--text-subtle)" />
          <span>Your data stays within your school's private cloud</span>
        </div>
      {/if}

      {#if mode === 'magic'}
        <button type="button" class="back" onclick={() => (mode = 'sso')}>
          <Icon name="back" size={14} /> Back
        </button>
        <h1 class="h1-sm">Magic link</h1>
        <p class="lede">We'll send you a secure sign-in link</p>

        {#if form?.success}
          <div class="alert ok" role="status">
            Check your email — we sent a magic link to <strong>{form.email}</strong>.
            {#if data.devMode}<br /><span class="dim">(dev mode — link also printed to your terminal)</span>{/if}
          </div>
        {:else}
          <form method="POST" action="?/email" use:enhance={submit('email')}>
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              placeholder="your@school.sch.uk"
              class="email-input"
            />
            <button type="submit" class="primary-btn" disabled={submitting === 'email'}>
              {submitting === 'email' ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        {/if}
      {/if}

      {#if mode === 'quickpick'}
        <button type="button" class="back" onclick={() => (mode = 'sso')}>
          <Icon name="back" size={14} /> Back
        </button>
        <h1 class="h1-sm">Who's teaching?</h1>
        <p class="lede">Tap your name to open your workspace</p>
        <div class="teacher-stack">
          {#each teachers as t (t.name)}
            <form method="POST" action="?/demo" use:enhance={submit('teacher-' + t.name)}>
              <button type="submit" class="teacher-btn" disabled={submitting === 'teacher-' + t.name}>
                <span class="teacher-avatar" style="background:{t.color}22;color:{t.color};border-color:{t.color}55">{t.initials}</span>
                <span class="teacher-text">
                  <span class="teacher-name">{t.name}</span>
                  <span class="teacher-role">{t.role}</span>
                </span>
              </button>
            </form>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  .login {
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  }

  /* ── Left brand panel ───────────────────────────────────────────── */
  .brand {
    position: relative;
    width: 400px;
    flex-shrink: 0;
    background: var(--primary);
    color: #fff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 44px 40px;
    overflow: hidden;
  }
  .dotgrid {
    position: absolute;
    inset: 0;
    opacity: 0.07;
    pointer-events: none;
  }
  .brand-top,
  .brand-school,
  .trust {
    position: relative;
  }
  .wordmark {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .subtitle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
    font-weight: 500;
    letter-spacing: 0.04em;
    margin-top: 2px;
  }
  .badge {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    margin-bottom: 20px;
    background: rgba(255, 255, 255, 0.18);
    border: 2px solid rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
  }
  .school-name {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
    margin-bottom: 8px;
    letter-spacing: -0.01em;
  }
  .school-meta {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
  }
  .school-term {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 4px;
  }
  .trust {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .trust-row {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.78);
  }
  .trust-check {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── Right form panel ───────────────────────────────────────────── */
  .form-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: var(--bg);
  }
  .form-inner {
    width: 100%;
    max-width: 360px;
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .h1-sm {
    font-size: 22px;
  }
  .lede {
    color: var(--text-muted);
    font-size: 14px;
    margin: 0 0 28px;
  }

  .sso-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  .sso-stack form {
    margin: 0;
  }
  .sso-btn {
    width: 100%;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: var(--surface);
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    text-align: left;
    transition: background 0.14s;
    box-shadow: var(--shadow);
  }
  .sso-btn:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .sso-btn:disabled {
    cursor: not-allowed;
    opacity: 0.72;
    box-shadow: none;
  }
  .sso-glyph {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .sso-label {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .sso-label small {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-subtle);
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .divider span {
    font-size: 12px;
    color: var(--text-subtle);
  }

  .quiet-btn {
    width: 100%;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    margin-bottom: 12px;
  }
  .quiet-btn:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .quiet-btn.with-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
  }
  .quiet-btn:disabled {
    cursor: progress;
    opacity: 0.7;
  }
  form {
    margin: 0;
  }

  .demo-link {
    text-align: center;
  }
  .link {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--primary);
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .privacy-pill {
    margin-top: 20px;
    padding: 11px 13px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .privacy-pill span {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* ── Magic-link mode ────────────────────────────────────────────── */
  .back {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--primary);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    padding: 0 0 20px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .email-input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: inherit;
    margin-bottom: 12px;
    outline: none;
    box-sizing: border-box;
    color: var(--text);
    background: var(--surface);
  }
  .email-input:focus {
    border-color: var(--primary);
  }
  .primary-btn {
    width: 100%;
    padding: 11px 16px;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--primary);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .primary-btn:hover:not(:disabled) {
    background: var(--primary-dark);
  }
  .primary-btn:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  /* ── Quick-pick mode ────────────────────────────────────────────── */
  .teacher-stack {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .teacher-stack form {
    margin: 0;
  }
  .teacher-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    font-family: inherit;
    box-shadow: var(--shadow);
    transition: background 0.12s;
  }
  .teacher-btn:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .teacher-btn:disabled {
    cursor: progress;
    opacity: 0.7;
  }
  .teacher-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .teacher-text {
    display: flex;
    flex-direction: column;
    text-align: left;
  }
  .teacher-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .teacher-role {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ── Alerts ─────────────────────────────────────────────────────── */
  .alert {
    padding: 11px 13px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 18px;
  }
  .alert.error {
    background: var(--revisit-bg, #fdeceb);
    color: var(--revisit, #d95a57);
  }
  .alert.ok {
    background: var(--got-it-bg, #e8f6ef);
    color: var(--got-it, #2ead73);
  }
  .dim {
    color: var(--text-subtle);
    font-size: 12px;
  }

  /* ── Responsive: teal header band on top, form below ────────────── */
  @media (max-width: 760px) {
    .login {
      flex-direction: column;
    }
    .brand {
      width: 100%;
      flex-shrink: 1;
      padding: 28px 28px 24px;
      gap: 22px;
    }
    .badge {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      margin-bottom: 14px;
    }
    .school-name {
      font-size: 19px;
    }
    .form-panel {
      flex: 1;
      align-items: flex-start;
      padding: 32px 24px 48px;
    }
    .form-inner {
      max-width: 420px;
      margin: 0 auto;
    }
  }
</style>
