<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';
  import { matchesStandalone } from '$lib/util/standalone';

  let { data }: { data: PageData } = $props();

  type Status = 'preparing' | 'waiting' | 'approved' | 'expired' | 'used' | 'error';

  let status = $state<Status>('preparing');
  let userCode = $state('');
  let deviceCode = $state('');
  let errorText = $state('');
  let clientId = '';
  let intervalMs = 1000;
  let pollTimer: number | null = null;

  function browserName(): string {
    const ua = navigator.userAgent;
    if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
    if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Safari\//i.test(ua)) return 'Safari';
    return 'Browser';
  }

  function deviceName(): string {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    return 'device';
  }

  function clientSurface(): 'pwa' | 'mobile_web' | 'desktop_web' {
    if (matchesStandalone()) return 'pwa';
    return /Mobile|iPhone|iPad|Android/i.test(navigator.userAgent) ? 'mobile_web' : 'desktop_web';
  }

  function clientName(): string {
    const surface = clientSurface();
    if (surface === 'pwa') return `Shippie PWA on ${deviceName()}`;
    return `${browserName()} on ${deviceName()}`;
  }

  function getClientId(): string {
    const key = 'shippie:auth-client-id:v1';
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const next = crypto.randomUUID();
      localStorage.setItem(key, next);
      return next;
    } catch {
      return `session-${crypto.randomUUID()}`;
    }
  }

  function notifyAuthChanged() {
    const payload = JSON.stringify({ kind: 'signed-in', at: Date.now() });
    try {
      localStorage.setItem('shippie:auth-event:v1', payload);
    } catch {
      // localStorage may be blocked in private contexts.
    }
    try {
      const channel = new BroadcastChannel('shippie-auth');
      channel.postMessage({ kind: 'signed-in', at: Date.now() });
      channel.close();
    } catch {
      // BroadcastChannel is best-effort.
    }
  }

  async function start() {
    status = 'preparing';
    errorText = '';
    clientId = getClientId();
    try {
      const res = await fetch('/api/auth/web/device', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName(),
          client_surface: clientSurface(),
        }),
      });
      if (!res.ok) throw new Error('Could not create a sign-in code.');
      const payload = (await res.json()) as {
        device_code: string;
        user_code: string;
        interval?: number;
      };
      deviceCode = payload.device_code;
      userCode = payload.user_code;
      intervalMs = Math.max(1000, (payload.interval ?? 1) * 1000);
      status = 'waiting';
      schedulePoll(250);
    } catch (err) {
      status = 'error';
      errorText = err instanceof Error ? err.message : 'Could not create a sign-in code.';
    }
  }

  function schedulePoll(delay = intervalMs) {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(() => void poll(), delay);
  }

  async function poll() {
    if (!deviceCode || status !== 'waiting') return;
    try {
      const res = await fetch('/api/auth/web/poll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          device_code: deviceCode,
          client_id: clientId,
          client_name: clientName(),
          client_surface: clientSurface(),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { status?: string };
      if (payload.status === 'approved') {
        status = 'approved';
        notifyAuthChanged();
        window.location.href = data.returnTo;
        return;
      }
      if (payload.status === 'expired') {
        status = 'expired';
        return;
      }
      if (payload.status === 'already_consumed') {
        status = 'used';
        return;
      }
      if (!res.ok && payload.status !== 'pending') {
        throw new Error('Could not finish sign-in.');
      }
      schedulePoll();
    } catch (err) {
      status = 'error';
      errorText = err instanceof Error ? err.message : 'Could not finish sign-in.';
    }
  }

  onMount(() => {
    void start();
  });

  onDestroy(() => {
    if (pollTimer) window.clearTimeout(pollTimer);
  });
</script>

<svelte:head>
  <title>Receive sign-in · Shippie</title>
</svelte:head>

<main class="page">
  <section class="shell" aria-labelledby="receive-title">
    <a class="brand" href="/dock">shippie</a>

    <header class="intro">
      <p class="eyebrow">Sign in this Shippie</p>
      <h1 id="receive-title">Use a one-time code</h1>
      <p>Open a signed-in Shippie, choose approve code, and enter the code shown here.</p>
    </header>

    <section class="code-panel" aria-live="polite">
      {#if status === 'preparing'}
        <span class="status">Preparing code...</span>
      {:else if userCode}
        <span class="status">{status === 'waiting' ? 'Waiting for approval' : status}</span>
        <strong>{userCode}</strong>
      {/if}
    </section>

    {#if status === 'approved'}
      <p class="ok">Approved. Opening your Shippie...</p>
    {:else if status === 'expired'}
      <div class="error-block">
        <p>This code expired.</p>
        <button type="button" onclick={() => void start()}>Create a new code</button>
      </div>
    {:else if status === 'used'}
      <div class="error-block">
        <p>This code was already used.</p>
        <button type="button" onclick={() => void start()}>Create a new code</button>
      </div>
    {:else if status === 'error'}
      <div class="error-block">
        <p>{errorText}</p>
        <button type="button" onclick={() => void start()}>Try again</button>
      </div>
    {/if}

    <a class="secondary" href={`/auth/login?return_to=${encodeURIComponent(data.returnTo)}`}>
      Use email instead
    </a>
  </section>
</main>

<style>
  .page {
    min-height: 100dvh;
    padding: calc(var(--safe-top, 0px) + 1rem) 1rem calc(var(--safe-bottom, 0px) + 1.5rem);
    background: var(--bg, #FAF7EF);
    color: var(--text, #14120F);
  }
  .shell {
    width: min(100%, 34rem);
    margin: 0 auto;
    display: grid;
    gap: 1rem;
  }
  .brand,
  .secondary {
    min-height: var(--touch-min, 44px);
    display: inline-flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
  }
  .brand {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 1.35rem;
    font-weight: 700;
  }
  .intro {
    display: grid;
    gap: 0.7rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light, #E5DDC8);
  }
  .eyebrow,
  .status {
    margin: 0;
    color: var(--text-light, #8B847A);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: clamp(2.2rem, 9vw, 3.8rem);
    line-height: 0.98;
    letter-spacing: 0;
  }
  p {
    margin: 0;
    color: var(--text-secondary, #5C5751);
    line-height: 1.55;
  }
  .code-panel {
    min-height: 142px;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.75rem;
    border: 1px solid var(--border-light, #E5DDC8);
    background: rgba(255, 255, 255, 0.24);
  }
  .code-panel strong {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(2rem, 10vw, 3rem);
    letter-spacing: 0.12em;
  }
  .ok,
  .error-block {
    padding: 0.8rem 0.9rem;
    border: 1px solid;
  }
  .ok {
    color: var(--success, #2E7D5B);
  }
  .error-block {
    display: grid;
    gap: 0.65rem;
    color: var(--danger, #B43F2A);
  }
  button {
    min-height: var(--touch-min, 44px);
    justify-self: start;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    padding: 0 0.9rem;
    font: inherit;
    font-weight: 700;
  }
  .secondary {
    color: var(--sunset, #E8603C);
    font-weight: 700;
  }
</style>
