<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { qrSvg } from '@shippie/qr';
  import { curatedApps } from '$lib/container/state';
  import { generateHandoffKeyPair, decryptHandoffPayload } from '$lib/client/handoff-crypto';
  import { applyHandoffSnapshot, isHandoffSnapshot } from '$lib/client/handoff-snapshot';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const appName = $derived(
    data.appSlug ? curatedApps.find((a) => a.slug === data.appSlug)?.name ?? data.appSlug : null,
  );

  type Phase = 'starting' | 'waiting' | 'received' | 'error' | 'expired';
  let phase = $state<Phase>('starting');
  let errorMessage = $state('');
  let qrMarkup = $state<string | null>(null);
  let handoffUrl = $state('');

  let privateKey: CryptoKey | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let deadline = 0;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function deviceLabel(): string {
    if (typeof navigator === 'undefined') return 'This device';
    const ua = navigator.userAgent;
    const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    const os = /Mac/.test(ua) ? 'Mac' : /Win/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'this device';
    return `${os} · ${browser}`;
  }

  async function start() {
    phase = 'starting';
    try {
      const recipient = await generateHandoffKeyPair();
      privateKey = recipient.privateKey;
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipientPublicKey: recipient.publicKeyB64,
          appSlug: data.appSlug ?? undefined,
          deviceLabel: deviceLabel(),
        }),
      });
      if (!res.ok) {
        errorMessage = res.status === 401 ? 'Sign in on both devices first.' : 'Could not start a handoff.';
        phase = 'error';
        return;
      }
      const { id, expiresIn } = (await res.json()) as { id: string; expiresIn: number };
      handoffUrl = new URL(`/handoff/${id}`, window.location.origin).toString();
      qrMarkup = await qrSvg(handoffUrl, { ecc: 'M', size: 220 }).catch(() => null);
      deadline = Date.now() + Math.min(expiresIn, 290) * 1000;
      phase = 'waiting';
      poll(id);
    } catch {
      errorMessage = 'Could not start a handoff.';
      phase = 'error';
    }
  }

  function poll(id: string) {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPolling();
        phase = 'expired';
        return;
      }
      try {
        const res = await fetch(`/api/handoff/${encodeURIComponent(id)}/bundle`);
        if (res.status === 202) return; // still waiting
        if (!res.ok) return;
        const bundle = (await res.json()) as { senderPublicKey: string; nonce: string; ciphertext: string };
        stopPolling();
        await receive(bundle);
      } catch {
        // transient — keep polling until the deadline.
      }
    }, 2000);
  }

  async function receive(bundle: { senderPublicKey: string; nonce: string; ciphertext: string }) {
    if (!privateKey) return;
    try {
      const snapshot = await decryptHandoffPayload(privateKey, bundle.senderPublicKey, bundle);
      if (!isHandoffSnapshot(snapshot)) {
        errorMessage = 'The handoff was malformed.';
        phase = 'error';
        return;
      }
      const result = applyHandoffSnapshot(localStorage, snapshot);
      phase = 'received';
      // Re-enter the Dock so the container re-hydrates from the updated
      // blobs; open the continued app if one came across.
      const dest = result.appRestored
        ? `/dock?app=${encodeURIComponent(result.appRestored)}&focused=1`
        : '/dock';
      setTimeout(() => goto(dest, { invalidateAll: true }), 900);
    } catch {
      errorMessage = 'Could not open the handoff on this device.';
      phase = 'error';
    }
  }

  onMount(start);
  onDestroy(stopPolling);
</script>

<svelte:head><title>Continue from your phone · Shippie</title></svelte:head>

<main class="handoff">
  <div class="card">
    {#if phase === 'received'}
      <p class="eyebrow">Continued</p>
      <h1>{appName ? `${appName} is here` : 'Your tools are here'}</h1>
      <p class="muted">Opening on this device…</p>
    {:else if phase === 'error'}
      <p class="eyebrow">Handoff</p>
      <h1>Something went wrong</h1>
      <p class="err">{errorMessage}</p>
      <div class="actions"><button class="primary" onclick={start}>Try again</button><a class="ghost" href="/dock">Back to Dock</a></div>
    {:else if phase === 'expired'}
      <p class="eyebrow">Handoff</p>
      <h1>This code expired</h1>
      <p class="muted">Codes last five minutes. Start a fresh one when you're ready.</p>
      <div class="actions"><button class="primary" onclick={start}>New code</button><a class="ghost" href="/dock">Back to Dock</a></div>
    {:else}
      <p class="eyebrow">Continue from your phone</p>
      <h1>{appName ? `Bring ${appName} here` : 'Bring your tools here'}</h1>
      <p class="muted">On your phone, open Shippie and scan this with the camera — or open the link below. Everything stays end-to-end encrypted.</p>
      <div class="qr" aria-label="Scan to continue from your phone">
        {#if qrMarkup}{@html qrMarkup}{:else}<span class="qr-pending">Preparing…</span>{/if}
      </div>
      {#if handoffUrl}
        <a class="link" href={handoffUrl}>{handoffUrl.replace(/^https?:\/\//, '')}</a>
      {/if}
      <p class="status" role="status">{phase === 'waiting' ? 'Waiting for your phone…' : 'Starting…'}</p>
      <a class="ghost" href="/dock">Cancel</a>
    {/if}
  </div>
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
    text-align: center;
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
  .qr {
    justify-self: center;
    width: 220px;
    height: 220px;
    display: grid;
    place-items: center;
    padding: 10px;
    background: #fff;
    border: 1px solid var(--border-light);
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .qr-pending {
    color: #555;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
  }
  .link {
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    overflow-wrap: anywhere;
    text-decoration: none;
  }
  .status {
    margin: 0;
    color: var(--text-secondary);
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
