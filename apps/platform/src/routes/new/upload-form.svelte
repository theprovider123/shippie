<script lang="ts" module>
  function formatBytes(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  }
</script>

<script lang="ts">
  type Result =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | {
        kind: 'success';
        slug: string;
        liveUrl: string;
        version?: number;
        files?: number;
        totalBytes?: number;
        preflightMs?: number;
      }
    | { kind: 'error'; reason: string; blockers?: Array<{ rule: string; title: string }> };

  let slug = $state('recipes');
  let file = $state<File | null>(null);
  let result = $state<Result>({ kind: 'idle' });
  let visibility = $state<'public' | 'unlisted' | 'private'>('public');
  let copied = $state(false);

  const shareUrl = $derived(
    result.kind === 'success'
      ? visibility === 'private'
        ? `(generating private invite — open the dashboard)`
        : `${typeof window !== 'undefined' ? window.location.origin : ''}/apps/${result.slug}`
      : '',
  );

  async function handleSubmit(ev: SubmitEvent) {
    ev.preventDefault();
    if (!file || !slug) return;
    result = { kind: 'submitting' };

    const fd = new FormData();
    fd.append('slug', slug);
    fd.append('zip', file);

    try {
      const res = await fetch('/api/deploy', { method: 'POST', body: fd });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && j.success) {
        result = {
          kind: 'success',
          slug: String(j.slug),
          liveUrl: String(j.live_url),
          version: typeof j.version === 'number' ? j.version : undefined,
          files: typeof j.files === 'number' ? j.files : undefined,
          totalBytes: typeof j.total_bytes === 'number' ? j.total_bytes : undefined,
          preflightMs:
            typeof (j.preflight as { duration_ms?: number })?.duration_ms === 'number'
              ? (j.preflight as { duration_ms: number }).duration_ms
              : undefined,
        };
      } else {
        result = {
          kind: 'error',
          reason: String(j.reason ?? j.error ?? 'Deploy failed.'),
          blockers: (j.preflight as { blockers?: Array<{ rule: string; title: string }> })?.blockers,
        };
      }
    } catch (err) {
      result = { kind: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  function handleFile(e: Event) {
    const t = e.target as HTMLInputElement;
    file = t.files?.[0] ?? null;
  }

  async function patchVisibility(next: 'public' | 'unlisted' | 'private') {
    if (result.kind !== 'success') return;
    const res = await fetch(`/api/apps/${encodeURIComponent(result.slug)}/visibility`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility_scope: next }),
    });
    if (res.ok) visibility = next;
  }

  async function onCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard unavailable — silent
    }
  }
</script>

<form onsubmit={handleSubmit} class="form">
  <label>
    <span class="label">Slug</span>
    <div class="slug-row">
      <input bind:value={slug} pattern="[a-z0-9][a-z0-9\-]*" required class="slug-input" />
      <span class="suffix">.shippie.app</span>
    </div>
  </label>

  <label>
    <span class="label">Zip (built output)</span>
    <input type="file" accept=".zip,application/zip" onchange={handleFile} required class="file-input" />
  </label>

  <button type="submit" disabled={result.kind === 'submitting' || !file || !slug} class="btn-primary">
    {result.kind === 'submitting' ? 'Shipping…' : 'Ship it →'}
  </button>

  {#if result.kind === 'success'}
    <div class="success">
      <p class="success-head">✓ Shipped{result.version ? ` — v${result.version}` : ''}</p>
      <p>
        Live at
        <a href={result.liveUrl} target="_blank" rel="noreferrer">{result.liveUrl}</a>
      </p>

      <div class="share-card">
        <div class="share-head">
          <p>Share this app</p>
          <div class="vis-toggle" role="radiogroup" aria-label="Visibility">
            {#each ['public', 'unlisted', 'private'] as v (v)}
              <button
                type="button"
                class:active={visibility === v}
                onclick={() => patchVisibility(v as 'public' | 'unlisted' | 'private')}>{v}</button>
            {/each}
          </div>
        </div>
        <div class="share-row">
          <input type="text" readonly value={shareUrl} class="share-input" />
          <button type="button" onclick={onCopy} class="copy-btn">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      {#if result.files != null || result.totalBytes != null || result.preflightMs != null}
        <p class="meta">
          {#if result.files != null}{result.files} files · {/if}
          {#if result.totalBytes != null}{formatBytes(result.totalBytes)} · {/if}
          {#if result.preflightMs != null}preflight {result.preflightMs}ms{/if}
        </p>
      {/if}
    </div>
  {:else if result.kind === 'error'}
    <div class="error">
      <p class="error-head">✗ {result.reason}</p>
      {#if result.blockers && result.blockers.length > 0}
        <ul>
          {#each result.blockers as b (b.rule + b.title)}
            <li><strong>{b.rule}</strong>: {b.title}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</form>

<style>
  .form { display: flex; flex-direction: column; gap: 1rem; }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #8B847A;
    font-family: ui-monospace, monospace;
  }
  .slug-row { display: flex; align-items: stretch; margin-top: 0.25rem; }
  .slug-input {
    flex: 1;
    height: 44px;
    padding: 0 0.75rem;
    border: 1px solid #C9C2B1;
    background: transparent;
    font-family: ui-monospace, monospace;
    font-size: 14px;
    color: inherit;
    border-radius: 8px 0 0 8px;
    box-sizing: border-box;
  }
  .slug-input:focus { border-color: #E8603C; outline: none; }
  .suffix {
    height: 44px;
    line-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid #C9C2B1;
    border-left: none;
    background: rgba(0,0,0,0.02);
    font-family: ui-monospace, monospace;
    font-size: 14px;
    color: #8B847A;
    border-radius: 0 8px 8px 0;
  }
  .file-input { margin-top: 0.25rem; }
  .btn-primary {
    height: 48px;
    background: #E8603C;
    color: white;
    border: none;
    padding: 0 2rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    align-self: flex-start;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .success {
    padding: 1rem 1.25rem;
    border: 1px solid rgba(46,125,91,0.4);
    background: rgba(46,125,91,0.05);
    border-radius: 12px;
    color: #2E7D5B;
  }
  .success-head { font-weight: 700; margin: 0; }
  .success a { color: inherit; font-family: ui-monospace, monospace; }
  .meta { font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; margin: 0.5rem 0 0 0; }
  .share-card { margin-top: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.5); border-radius: 8px; }
  .share-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .share-head p { font-size: 12px; color: #14120F; margin: 0; font-weight: 600; }
  .vis-toggle { display: inline-flex; gap: 2px; padding: 2px; background: rgba(0,0,0,0.05); border-radius: 999px; }
  .vis-toggle button {
    background: transparent;
    border: none;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    cursor: pointer;
    color: #8B847A;
  }
  .vis-toggle button.active { background: #2E7D5B; color: white; }
  .share-row { display: flex; gap: 6px; }
  .share-input {
    flex: 1;
    height: 36px;
    padding: 0 0.625rem;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    background: white;
    border: 1px solid #C9C2B1;
    border-radius: 6px;
    box-sizing: border-box;
    color: inherit;
  }
  .copy-btn {
    height: 36px;
    padding: 0 0.875rem;
    background: transparent;
    border: 1px solid #C9C2B1;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    color: inherit;
  }
  .error {
    padding: 1rem 1.25rem;
    border: 1px solid rgba(180,63,42,0.4);
    background: rgba(180,63,42,0.05);
    border-radius: 12px;
    color: #B43F2A;
  }
  .error-head { font-weight: 700; margin: 0; }
  .error ul { margin: 0.5rem 0 0 1.25rem; padding: 0; font-family: ui-monospace, monospace; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    .slug-input, .suffix, .share-input, .copy-btn { border-color: #3A352D; }
    .suffix { background: rgba(255,255,255,0.03); }
    .share-card { background: rgba(255,255,255,0.04); }
    .share-head p { color: #EDE4D3; }
    .vis-toggle { background: rgba(255,255,255,0.05); }
    .share-input { background: #1F1B16; }
  }
</style>
