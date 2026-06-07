<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let joining = $state(false);
  let error = $state<string | null>(null);
  let done = $state(false);

  async function accept() {
    joining = true;
    error = null;
    try {
      const res = await fetch('/api/cloudlet/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: data.token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        error = friendly(body.error);
        return;
      }
      done = true;
      setTimeout(() => goto('/uniti'), 900);
    } catch {
      error = 'Something went wrong. Please try again.';
    } finally {
      joining = false;
    }
  }

  function friendly(code?: string): string {
    switch (code) {
      case 'invite_expired':
        return 'This invitation has expired. Ask your office manager to send a new one.';
      case 'invite_revoked':
        return 'This invitation is no longer active.';
      case 'invite_already_accepted':
        return 'This invitation has already been used.';
      default:
        return "We couldn't find that invitation. Check the link and try again.";
    }
  }
</script>

<svelte:head><title>Join your school · uniti</title></svelte:head>

<div class="wrap">
  <header class="brand">
    <span class="wordmark">uniti</span>
    <span class="subtitle">School Cloud</span>
  </header>

  <section class="card">
    {#if done}
      <h1>You're in</h1>
      <p class="muted">Taking you to your school…</p>
    {:else}
      <p class="eyebrow">You've been invited</p>
      <h1>Join your school</h1>
      <p class="muted">
        You're signed in as <strong>{data.email}</strong>. Accept to join your school's
        private cloud.
      </p>
      {#if error}<p class="error">{error}</p>{/if}
      <button class="btn primary" onclick={accept} disabled={joining}>
        {joining ? 'Joining…' : 'Accept & join'}
      </button>
    {/if}
  </section>
</div>

<style>
  .wrap {
    max-width: 520px;
    margin: 0 auto;
    padding: 48px 20px 64px;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 28px;
  }
  .wordmark {
    font-weight: 800;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--primary);
  }
  .subtitle {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 15px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 28px;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 4px;
  }
  h1 {
    font-weight: 700;
    font-size: 24px;
    letter-spacing: -0.01em;
    margin: 4px 0 8px;
  }
  .muted {
    color: var(--text-muted);
    margin: 4px 0 0;
    line-height: 1.5;
  }
  .btn {
    font-family: inherit;
    font-weight: 600;
    font-size: 15px;
    border-radius: var(--radius);
    padding: 12px 20px;
    border: 1px solid transparent;
    cursor: pointer;
    margin-top: 20px;
  }
  .btn.primary {
    background: var(--primary);
    color: #fff;
    box-shadow: var(--shadow-md);
  }
  .btn.primary:hover {
    background: var(--primary-dark);
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    color: var(--revisit);
    margin-top: 16px;
    font-weight: 500;
  }
</style>
