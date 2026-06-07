<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  type WorkspaceEventRow = {
    clientEventId: string;
    type: string;
    createdOfflineAt: string;
    receivedAt: number;
  };

  let events: WorkspaceEventRow[] = [];
  let loading = false;
  let recording = false;
  let error: string | null = null;
  let loaded = false;

  const slug = data.instance?.slug ?? null;

  async function loadEvents() {
    if (!slug) return;
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/events`);
      if (!res.ok) {
        error = `Could not load events (${res.status}).`;
        return;
      }
      const body = (await res.json()) as { events?: WorkspaceEventRow[] };
      events = body.events ?? [];
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load events.';
    } finally {
      loading = false;
    }
  }

  async function recordTestEvent() {
    if (!slug) return;
    recording = true;
    error = null;
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientEventId: `web-${Date.now()}`,
          type: 'feedback.created',
          deviceId: 'web',
          createdOfflineAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: { source: 'office-manager-test' },
        }),
      });
      if (!res.ok) {
        error = `Could not record event (${res.status}).`;
        return;
      }
      await loadEvents();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not record event.';
    } finally {
      recording = false;
    }
  }

  function fmt(ms: number): string {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(ms);
    }
  }
</script>

<svelte:head>
  <title>uniti · School Cloud</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
  />
</svelte:head>

<div class="uniti">
  <header class="brand">
    <span class="wordmark">uniti</span>
    <span class="subtitle">School Cloud</span>
  </header>

  {#if !data.instance}
    <section class="card empty">
      <h1>No school yet</h1>
      <p>Ask your administrator to provision your school's private cloud.</p>
    </section>
  {:else}
    <section class="card">
      <p class="eyebrow">Your school</p>
      <h1>{data.instance.displayName}</h1>
      <p class="muted">Private school cloud · UK data · Works offline</p>

      <div class="actions">
        <button class="btn primary" on:click={recordTestEvent} disabled={recording}>
          {recording ? 'Recording…' : 'Record a test event'}
        </button>
        <button class="btn ghost" on:click={loadEvents} disabled={loading}>
          {loading ? 'Loading…' : loaded ? 'Refresh' : 'Load events'}
        </button>
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}
    </section>

    <section class="card">
      <p class="eyebrow">Workspace events</p>
      {#if !loaded}
        <p class="muted">Load events to see what's in your school's workspace.</p>
      {:else if events.length === 0}
        <p class="muted">No events yet. Record a test event to get started.</p>
      {:else}
        <ul class="events">
          {#each events as ev (ev.clientEventId)}
            <li>
              <span class="pill">{ev.type}</span>
              <span class="evid">{ev.clientEventId}</span>
              <span class="when">{fmt(ev.receivedAt)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  /* Uniti design tokens (Phase 0 lock) — teal/marigold, calm cards. */
  .uniti {
    --bg: #f8f7f4;
    --surface: #ffffff;
    --border: #e8e6e3;
    --text: #1a1917;
    --text-muted: #6b6864;
    --primary: #1b9b7a;
    --primary-dark: #137a60;
    --primary-light: #e4f5f0;
    --accent: #e8953a;
    --accent-light: #fef0dc;
    --radius: 12px;
    --radius-lg: 20px;
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.04);
    --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.1);

    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 32px 20px 64px;
    max-width: 720px;
    margin: 0 auto;
    box-sizing: border-box;
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
    padding: 24px;
    margin-bottom: 20px;
  }

  h1 {
    font-weight: 700;
    font-size: 24px;
    letter-spacing: -0.01em;
    margin: 4px 0 8px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 4px;
  }
  .muted {
    color: var(--text-muted);
    margin: 4px 0 0;
  }

  .actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
  }

  .btn {
    font-family: inherit;
    font-weight: 600;
    font-size: 15px;
    border-radius: var(--radius);
    padding: 12px 20px;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      transform 0.05s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn:not(:disabled):active {
    transform: translateY(1px);
  }
  .btn.primary {
    background: var(--primary);
    color: #fff;
    box-shadow: var(--shadow-md);
  }
  .btn.primary:not(:disabled):hover {
    background: var(--primary-dark);
  }
  .btn.ghost {
    background: var(--primary-light);
    color: var(--primary-dark);
    border-color: transparent;
  }

  .error {
    color: #d95a57;
    margin-top: 16px;
    font-weight: 500;
  }

  .events {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .events li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    flex-wrap: wrap;
  }
  .pill {
    background: var(--primary-light);
    color: var(--primary-dark);
    font-weight: 600;
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .evid {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    color: var(--text-muted);
  }
  .when {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
