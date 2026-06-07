<script lang="ts">
  import type { PageProps } from './$types';
  import { page } from '$app/stores';
  import EntryNav from '$lib/components/layout/EntryNav.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { enhance } from '$app/forms';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);

  function claimAction(): string {
    const query = $page.url.searchParams.toString();
    return query ? `?/claim&${query}` : '?/claim';
  }
</script>

<svelte:head>
  <title>{data.invite ? `You're invited to ${data.invite.appName}` : 'Invite expired'} — Shippie</title>
</svelte:head>

<main class="invite-page">
  <div class="shell">
    <EntryNav actions={[{ href: '/tools', label: 'Browse tools' }]} />

    <section class="panel" aria-label={data.invalid ? 'Expired invite' : 'Private space invite'}>
    {#if data.invalid}
      <p class="eyebrow">Invite link</p>
      <h1 class="title">Invite expired</h1>
      <p class="body">Ask the person who shared this with you for a new link.</p>
      <a class="secondary-link" href="/dock">Return to Dock</a>
    {:else if data.invite}
      <p class="eyebrow">Private invite</p>
      <h1 class="title">{data.invite.appName}</h1>
      {#if data.invite.appTagline}
        <p class="body">{data.invite.appTagline}</p>
      {/if}
      {#if data.spaceInvite?.enabled}
        <div class:error-state={!data.spaceInvite.valid} class="space-summary">
          {#if data.spaceInvite.valid}
            <p class="summary-title">Private space invite</p>
            <p>
              Role: <strong>{data.spaceInvite.role}</strong>
              {#if data.spaceInvite.hasSealedHandoff}
                · sealed data handoff included
              {/if}
            </p>
            <p>Scoped to this link. Shippie cannot read the space.</p>
          {:else}
            <p class="summary-title">Private link needs refreshing</p>
            <p>This space invite looks changed or incomplete. Ask for a fresh link.</p>
          {/if}
        </div>
      {/if}
      <form
        method="POST"
        action={claimAction()}
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <Button variant="primary" size="lg" type="submit" disabled={submitting}>
          {submitting ? 'Joining…' : 'Join private space'}
        </Button>
      </form>
      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}
      <p class="fineprint">
        Join now without creating an account. Signing in later only helps keep access across
        devices; Shippie still cannot read the space.
      </p>
      <a class="secondary-link" href="/dock">Not now — open Dock</a>
    {/if}
    </section>
  </div>
</main>

<style>
  .invite-page {
    min-height: 100svh;
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1.25rem calc(var(--safe-bottom, 0px) + 2rem);
    background: var(--bg);
    color: var(--text);
  }
  .shell {
    width: 100%;
    max-width: 34rem;
    min-height: calc(100svh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    min-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 3rem);
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1.5rem;
  }
  .panel {
    align-self: center;
    display: grid;
    gap: var(--space-md);
    padding: 1.25rem 0 0 1.25rem;
    border-left: 2px solid var(--sunset);
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0;
  }
  .title {
    font-family: var(--font-heading);
    font-size: var(--text-display);
    line-height: 0.98;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .body { color: var(--text-secondary); line-height: 1.55; margin: 0; }
  .space-summary {
    display: grid;
    gap: 0.25rem;
    padding: 0.875rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text-secondary);
    text-align: left;
  }
  .space-summary.error-state {
    border-color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  .space-summary p {
    margin: 0;
    font-size: var(--text-small);
    line-height: 1.45;
  }
  .space-summary strong {
    color: var(--text);
  }
  .space-summary .summary-title {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  form {
    display: grid;
  }
  form :global(button) {
    width: 100%;
    min-height: var(--touch-min, 44px);
  }
  .error {
    color: var(--sunset-dim);
    font-size: var(--text-small);
    font-family: var(--font-mono);
    margin: 0;
  }
  .fineprint {
    font-size: var(--text-caption);
    color: var(--text-light);
    font-family: var(--font-mono);
    margin: 0;
  }
  .secondary-link {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }
  @media (max-width: 640px) {
    .invite-page {
      padding: calc(var(--safe-top, 0px) + 0.75rem) 1rem calc(var(--safe-bottom, 0px) + 1.25rem);
    }
    .shell {
      gap: 1.1rem;
    }
    .panel {
      align-self: start;
      margin-top: 1.5rem;
    }
  }
</style>
