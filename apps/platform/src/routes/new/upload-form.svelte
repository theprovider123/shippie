<script lang="ts" module>
  function formatBytes(n: number): string {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  }
</script>

<script lang="ts">
  import { qrSvg } from '@shippie/qr';

  type Result =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | {
        kind: 'success';
        slug: string;
        liveUrl: string;
        claimUrl?: string;
        expiresAt?: string;
        deployId?: string;
        reportUrl?: string;
        reportJsonUrl?: string;
        version?: number;
        files?: number;
        totalBytes?: number;
        preflightMs?: number;
      }
    | { kind: 'error'; reason: string; blockers?: Array<{ rule: string; title: string; detail?: string }> };

  interface Props {
    trialMode?: boolean;
  }

  let { trialMode = false }: Props = $props();
  let slug = $state('recipes');
  let file = $state<File | null>(null);
  let result = $state<Result>({ kind: 'idle' });
  let visibility = $state<'public' | 'unlisted' | 'private'>('public');
  let copied = $state(false);
  let liveQrMarkup = $state<string | null>(null);

  const shareUrl = $derived(
    result.kind === 'success'
      ? visibility === 'private'
        ? `(generating private invite — open the dashboard)`
        : `${typeof window !== 'undefined' ? window.location.origin : ''}/apps/${result.slug}`
      : '',
  );

  async function handleSubmit(ev: SubmitEvent) {
    ev.preventDefault();
    if (!file || (!trialMode && !slug)) return;
    result = { kind: 'submitting' };

    const fd = new FormData();
    if (!trialMode) fd.append('slug', slug);
    fd.append('zip', file);

    try {
      const res = await fetch(trialMode ? '/api/deploy/trial' : '/api/deploy', {
        method: 'POST',
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && j.success) {
        result = {
          kind: 'success',
          slug: String(j.slug),
          liveUrl: String(j.live_url),
          claimUrl: typeof j.claim_url === 'string' ? j.claim_url : undefined,
          expiresAt: typeof j.expires_at === 'string' ? j.expires_at : undefined,
          deployId: typeof j.deploy_id === 'string' ? j.deploy_id : undefined,
          reportUrl: typeof j.report_url === 'string' ? j.report_url : undefined,
          reportJsonUrl: typeof j.report_json_url === 'string' ? j.report_json_url : undefined,
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
          blockers: (
            j.preflight as { blockers?: Array<{ rule: string; title: string; detail?: string }> } | undefined
          )?.blockers,
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

  function absoluteUrl(pathOrUrl: string | undefined): string {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  $effect(() => {
    if (result.kind !== 'success') {
      liveQrMarkup = null;
      return;
    }
    let cancelled = false;
    void qrSvg(result.liveUrl, { ecc: 'M', size: 176 })
      .then((svg) => {
        if (!cancelled) liveQrMarkup = svg;
      })
      .catch(() => {
        if (!cancelled) liveQrMarkup = null;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<form onsubmit={handleSubmit} class="form">
  {#if !trialMode}
    <label>
      <span class="label">Slug</span>
      <div class="slug-row">
        <input bind:value={slug} pattern="[a-z0-9][a-z0-9\-]*" required class="slug-input" />
        <span class="suffix">.shippie.app</span>
      </div>
    </label>
  {:else}
    <div class="trial-note">
      <span class="label">Trial URL</span>
      <p>
        Shippie will choose a temporary <code>trial-*</code> slug and publish it unlisted.
      </p>
    </div>
  {/if}

  <label>
    <span class="label">Zip (built output)</span>
    <input type="file" accept=".zip,application/zip" onchange={handleFile} required class="file-input" />
  </label>

  <button
    type="submit"
    disabled={result.kind === 'submitting' || !file || (!trialMode && !slug)}
    class="btn-primary"
  >
    {result.kind === 'submitting' ? 'Shipping…' : trialMode ? 'Ship trial →' : 'Ship it →'}
  </button>

  {#if result.kind === 'success'}
    <div class="success">
      <div class="success-grid">
        <div>
          <p class="success-head">
            ✓ {trialMode ? 'Trial shipped' : 'Shipped'}{result.version ? ` — v${result.version}` : ''}
          </p>
          <p class="live-line">
            Live at
            <a href={result.liveUrl} target="_blank" rel="noreferrer">{result.liveUrl}</a>
          </p>
          <div class="action-row" aria-label="Next actions">
            <a href={result.liveUrl} target="_blank" rel="noreferrer">Open app</a>
            {#if result.reportUrl || result.deployId}
              <a href={absoluteUrl(result.reportUrl ?? `/dashboard/apps/${result.slug}/deploys/${result.deployId}`)}>
                Flight Recorder
              </a>
            {/if}
            {#if result.reportJsonUrl}
              <a href={absoluteUrl(result.reportJsonUrl)} target="_blank" rel="noreferrer">Export JSON</a>
            {/if}
          </div>
        </div>
        <div class="qr-panel" aria-label="Install on phone">
          {#if liveQrMarkup}
            <div class="qr">{@html liveQrMarkup}</div>
          {:else}
            <div class="qr-placeholder">QR</div>
          {/if}
          <span>Scan to open on phone</span>
        </div>
      </div>
      {#if result.expiresAt}
        <p>This trial stays live until {new Date(result.expiresAt).toLocaleString()}.</p>
      {/if}
      {#if result.deployId}
        <p>
          Review the App Flight Recorder for policy, package, privacy, security, and proof evidence.
        </p>
      {/if}

      <div class="share-card">
        <div class="share-head">
          <p>{trialMode ? 'Keep this app' : 'Share this app'}</p>
          {#if !trialMode}
            <div class="vis-toggle" role="radiogroup" aria-label="Visibility">
              {#each ['public', 'unlisted', 'private'] as v (v)}
                <button
                  type="button"
                  class:active={visibility === v}
                  onclick={() => patchVisibility(v as 'public' | 'unlisted' | 'private')}>{v}</button>
              {/each}
            </div>
          {/if}
        </div>
        {#if trialMode && result.claimUrl}
          <a class="claim-link" href={result.claimUrl}>Sign in to claim it</a>
        {:else}
          <div class="share-row">
            <input type="text" readonly value={shareUrl} class="share-input" />
            <button type="button" onclick={onCopy} class="copy-btn">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        {/if}
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
            <li>
              <strong>{b.title}</strong>
              {#if b.detail}
                <span>{b.detail}</span>
              {/if}
            </li>
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
    border-radius: 0;
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
  .trial-note {
    border-left: 2px solid #E8603C;
    padding-left: 0.75rem;
  }
  .trial-note p {
    margin: 0.25rem 0 0;
    color: #6F675E;
    font-size: 13px;
    line-height: 1.45;
  }
  .btn-primary {
    height: 48px;
    background: #E8603C;
    color: white;
    border: none;
    padding: 0 2rem;
    border-radius: 0;
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
    border-radius: 0;
    color: #2E7D5B;
  }
  .success-head { font-weight: 700; margin: 0; }
  .success-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: start;
  }
  .live-line { margin-bottom: 0.75rem; }
  .success a { color: inherit; font-family: ui-monospace, monospace; }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .action-row a {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    padding: 0 0.75rem;
    border: 1px solid rgba(46,125,91,0.35);
    background: rgba(255,255,255,0.52);
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
  }
  .qr-panel {
    width: 176px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    color: #6F675E;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    text-align: center;
  }
  .qr,
  .qr-placeholder {
    width: 176px;
    height: 176px;
    background: #FAF7EF;
    padding: 8px;
    border: 1px solid rgba(46,125,91,0.25);
    box-sizing: border-box;
  }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .qr-placeholder {
    display: grid;
    place-items: center;
    color: #8B847A;
  }
  .meta { font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; margin: 0.5rem 0 0 0; }
  .share-card { margin-top: 0.75rem; padding: 0.75rem; background: rgba(255,255,255,0.5); border-radius: 0; }
  .share-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .share-head p { font-size: 12px; color: #14120F; margin: 0; font-weight: 600; }
  .vis-toggle { display: inline-flex; gap: 2px; padding: 2px; background: rgba(0,0,0,0.05); border-radius: 0; }
  .vis-toggle button {
    background: transparent;
    border: none;
    padding: 4px 10px;
    border-radius: 0;
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
    border-radius: 0;
    box-sizing: border-box;
    color: inherit;
  }
  .copy-btn {
    height: 36px;
    padding: 0 0.875rem;
    background: transparent;
    border: 1px solid #C9C2B1;
    border-radius: 0;
    font-size: 12px;
    cursor: pointer;
    color: inherit;
  }
  .claim-link {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    padding: 0 0.75rem;
    background: #2E7D5B;
    color: white !important;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
  }
  .error {
    padding: 1rem 1.25rem;
    border: 1px solid rgba(180,63,42,0.4);
    background: rgba(180,63,42,0.05);
    border-radius: 0;
    color: #B43F2A;
  }
  .error-head { font-weight: 700; margin: 0; }
  .error ul { margin: 0.5rem 0 0 1.25rem; padding: 0; font-family: ui-monospace, monospace; font-size: 12px; }
  .error li + li { margin-top: 0.375rem; }
  .error li span { display: block; margin-top: 0.125rem; color: rgba(180,63,42,0.78); }
  @media (prefers-color-scheme: dark) {
    .slug-input, .suffix, .share-input, .copy-btn { border-color: #3A352D; }
    .suffix { background: rgba(255,255,255,0.03); }
    .share-card { background: rgba(255,255,255,0.04); }
    .share-head p { color: #EDE4D3; }
    .vis-toggle { background: rgba(255,255,255,0.05); }
    .share-input { background: #1F1B16; }
    .trial-note p { color: #AFA693; }
    .action-row a { background: rgba(255,255,255,0.04); }
    .qr, .qr-placeholder { background: #FAF7EF; }
  }
  @media (max-width: 640px) {
    .success-grid { grid-template-columns: 1fr; }
    .qr-panel { width: min(176px, 100%); }
  }
</style>
