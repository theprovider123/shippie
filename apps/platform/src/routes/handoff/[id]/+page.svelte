<script lang="ts">
  import { goto } from '$app/navigation';
  import { curatedApps } from '$lib/container/state';
  import { buildHandoffSnapshot } from '$lib/client/handoff-snapshot';
  import { generateHandoffKeyPair, encryptHandoffPayload } from '$lib/client/handoff-crypto';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const appName = $derived(
    data.offer?.appSlug ? curatedApps.find((a) => a.slug === data.offer!.appSlug)?.name ?? data.offer.appSlug : null,
  );
  const target = $derived(data.offer?.deviceLabel ?? 'your other device');

  let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
  let errorMessage = $state('');

  async function send() {
    if (!data.offer || status === 'sending') return;
    status = 'sending';
    try {
      const snapshot = buildHandoffSnapshot(localStorage, {
        appSlug: data.offer.appSlug ?? undefined,
        createdAt: new Date().toISOString(),
      });
      const sender = await generateHandoffKeyPair();
      const cipher = await encryptHandoffPayload(sender.privateKey, data.offer.recipientPublicKey, snapshot);
      const res = await fetch(`/api/handoff/${encodeURIComponent(data.id)}/bundle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'shippie.handoff.bundle.v1',
          alg: 'ECDH-P256-AES-256-GCM',
          senderPublicKey: sender.publicKeyB64,
          nonce: cipher.nonce,
          ciphertext: cipher.ciphertext,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        errorMessage = j.error === 'no pending' ? 'This handoff expired. Start it again on your other device.' : 'Could not send. Try again.';
        status = 'error';
        return;
      }
      status = 'sent';
    } catch {
      errorMessage = 'Could not read your tools on this device.';
      status = 'error';
    }
  }
</script>

<svelte:head><title>Continue on another device · Shippie</title></svelte:head>

<main class="handoff">
  {#if !data.offer}
    <div class="card">
      <p class="eyebrow">Handoff</p>
      <h1>Nothing to continue</h1>
      <p class="muted">This handoff link has expired or was already used. Start a new one on the device you're moving to.</p>
      <a class="ghost" href="/dock">Back to Dock</a>
    </div>
  {:else if status === 'sent'}
    <div class="card">
      <p class="eyebrow">Sent</p>
      <h1>On its way to {target}</h1>
      <p class="muted">{appName ? `${appName} and your` : 'Your'} tools are being handed over. You can close this.</p>
      <a class="ghost" href="/dock">Back to Dock</a>
    </div>
  {:else}
    <div class="card">
      <p class="eyebrow">Continue on {target}</p>
      <h1>{appName ? `Send ${appName} + your tools` : 'Send your tools'}</h1>
      <p class="muted">
        {appName
          ? `This copies ${appName}'s data on this device and your saved tools to ${target}. Your data stays end-to-end encrypted.`
          : `This copies your saved tools to ${target}. Your data stays end-to-end encrypted.`}
      </p>
      {#if status === 'error'}<p class="err">{errorMessage}</p>{/if}
      <div class="actions">
        <button class="primary" onclick={send} disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send to other device'}
        </button>
        <button class="ghost" type="button" onclick={() => goto('/dock')}>Not now</button>
      </div>
    </div>
  {/if}
</main>

<style>
  .handoff {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(env(safe-area-inset-top) + 1rem) 1rem calc(env(safe-area-inset-bottom) + 1rem);
    background: var(--bg);
  }
  .card {
    width: 100%;
    max-width: 420px;
    display: grid;
    gap: 0.85rem;
    padding: 1.5rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .eyebrow {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sunset);
  }
  h1 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    line-height: 1.1;
  }
  .muted {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
    font-size: var(--text-small);
  }
  .err {
    margin: 0;
    color: var(--danger-hover, var(--danger));
    font-size: var(--text-small);
  }
  .actions {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .primary {
    min-height: 48px;
    border: 1px solid var(--sunset);
    background: var(--sunset);
    color: var(--bg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .ghost {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }
</style>
