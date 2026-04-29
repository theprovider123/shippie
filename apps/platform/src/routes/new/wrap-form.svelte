<script lang="ts">
  type Phase =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'done'; slug: string; liveUrl: string; redirectUri: string }
    | { kind: 'error'; message: string };

  let phase = $state<Phase>({ kind: 'idle' });

  async function onSubmit(ev: SubmitEvent) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget as HTMLFormElement);
    phase = { kind: 'submitting' };

    const taglineRaw = String(form.get('tagline') ?? '');
    const body = {
      upstream_url: String(form.get('upstream_url') ?? ''),
      slug: String(form.get('slug') ?? ''),
      name: String(form.get('name') ?? ''),
      ...(taglineRaw ? { tagline: taglineRaw } : {}),
      type: String(form.get('type') ?? 'app'),
      category: String(form.get('category') ?? 'tools'),
    };

    const res = await fetch('/api/deploy/wrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      slug?: string;
      live_url?: string;
      runtime_config?: { required_redirect_uris?: string[] };
      reason?: string;
      error?: string;
    };
    if (res.ok && j.success && j.live_url && j.slug) {
      phase = {
        kind: 'done',
        slug: j.slug,
        liveUrl: j.live_url,
        redirectUri: j.runtime_config?.required_redirect_uris?.[0] ?? '',
      };
    } else {
      phase = { kind: 'error', message: j.reason ?? j.error ?? 'Wrap failed.' };
    }
  }
</script>

{#if phase.kind === 'done'}
  <div class="success">
    <p class="head">✓ Wrapped</p>
    <p>
      Live at
      <a href={phase.liveUrl} target="_blank" rel="noreferrer">{phase.liveUrl}</a>
    </p>
    {#if phase.redirectUri}
      <p class="dim">Add this redirect URI to your auth provider:</p>
      <pre>{phase.redirectUri}</pre>
    {/if}
  </div>
{:else}
  <form onsubmit={onSubmit} class="form">
    <label>
      <span>Upstream URL</span>
      <input name="upstream_url" type="url" placeholder="https://mevrouw.vercel.app" required />
    </label>
    <label>
      <span>Slug</span>
      <input name="slug" placeholder="mevrouw" required pattern="[a-z0-9][a-z0-9-]*[a-z0-9]" />
    </label>
    <label>
      <span>Name</span>
      <input name="name" placeholder="Mevrouw" required />
    </label>
    <label>
      <span>Tagline (optional)</span>
      <input name="tagline" />
    </label>
    <div class="row">
      <label>
        <span>Type</span>
        <select name="type">
          <option value="app">App</option>
          <option value="web_app">Web app</option>
          <option value="website">Website</option>
        </select>
      </label>
      <label>
        <span>Category</span>
        <input name="category" placeholder="tools" value="tools" />
      </label>
    </div>
    {#if phase.kind === 'error'}
      <p class="error">{phase.message}</p>
    {/if}
    <button type="submit" class="btn-primary" disabled={phase.kind === 'submitting'}>
      {phase.kind === 'submitting' ? 'Wrapping…' : 'Wrap URL'}
    </button>
  </form>
{/if}

<style>
  .form { display: flex; flex-direction: column; gap: 1rem; }
  .row { display: flex; gap: 1rem; }
  .row label { flex: 1; }
  label { display: flex; flex-direction: column; gap: 4px; }
  label span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: #8B847A; font-family: ui-monospace, monospace; }
  input, select { height: 44px; padding: 0 0.75rem; background: transparent; border: 1px solid #C9C2B1; font-family: ui-monospace, monospace; font-size: 14px; color: inherit; border-radius: 0; box-sizing: border-box; }
  input:focus, select:focus { border-color: #E8603C; outline: none; }
  .btn-primary {
    height: 48px;
    background: #E8603C;
    color: white;
    border: none;
    padding: 0 2rem;
    border-radius: 0;
    font-weight: 700;
    cursor: pointer;
    align-self: flex-start;
  }
  .btn-primary:disabled { opacity: 0.5; }
  .success { padding: 1rem 1.25rem; border: 1px solid rgba(46,125,91,0.4); background: rgba(46,125,91,0.05); border-radius: 0; color: #2E7D5B; }
  .head { margin: 0; font-weight: 700; }
  .dim { color: #8B847A; font-size: 12px; }
  .success a { color: inherit; font-family: ui-monospace, monospace; }
  pre { font-family: ui-monospace, monospace; font-size: 12px; padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 0; overflow: auto; }
  .error { color: #B43F2A; margin: 0; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    input, select { border-color: #3A352D; }
    pre { background: rgba(255,255,255,0.05); }
  }
</style>
