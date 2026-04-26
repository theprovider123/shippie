<script lang="ts">
  import type { PageProps } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import { enhance } from '$app/forms';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{data.invite ? `You're invited to ${data.invite.appName}` : 'Invite expired'} — Shippie</title>
</svelte:head>

<main class="invite-page">
  <div class="card">
    {#if data.invalid}
      <h1 class="title">Invite expired</h1>
      <p class="body">Ask the person who shared this with you for a new link.</p>
      <p class="footer-link">
        <a href="/">← shippie.app</a>
      </p>
    {:else if data.invite}
      <p class="eyebrow">You're invited to</p>
      <h1 class="title">{data.invite.appName}</h1>
      {#if data.invite.appTagline}
        <p class="body">{data.invite.appTagline}</p>
      {/if}
      <form
        method="POST"
        action="?/claim"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <Button variant="primary" size="lg" type="submit" disabled={submitting}>
          {submitting ? 'Claiming…' : 'Accept invite →'}
        </Button>
      </form>
      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}
      <p class="fineprint">
        This invite gives you access for 30 days. Sign in to make it permanent.
      </p>
    {/if}
  </div>
</main>

<style>
  .invite-page {
    min-height: 60vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl) var(--space-md);
  }
  .card {
    width: 100%;
    max-width: 420px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0;
  }
  .title {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .body { color: var(--text-secondary); margin: 0; }
  form { display: flex; justify-content: center; }
  .error {
    color: var(--sunset-dim);
    font-size: var(--small-size);
    font-family: var(--font-mono);
    margin: 0;
  }
  .fineprint {
    font-size: 12px;
    color: var(--text-light);
    font-family: var(--font-mono);
    margin: 0;
  }
  .footer-link {
    margin: 0;
  }
  .footer-link a {
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--small-size);
  }
</style>
