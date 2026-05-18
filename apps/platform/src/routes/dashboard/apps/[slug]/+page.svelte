<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
  import type {
    AppKind,
    AppKindProfile,
    PublicKindStatus,
  } from '$lib/types/app-kind';
  import { pwaChecklist, pwaSurfaceLabel } from '$lib/types/pwa-readiness';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const profile = $derived(data.kindProfile as AppKindProfile | null);
  const detected = $derived<AppKind | null>(profile?.detectedKind ?? null);
  const declared = $derived<AppKind | null>(profile?.declaredKind ?? null);
  const status = $derived<PublicKindStatus | null>(profile?.publicKindStatus ?? null);
  const conflict = $derived(
    profile && declared && declared !== detected ? { declared, detected } : null,
  );
  const probesText = $derived((data.workflowProbes ?? []).join('\n'));
  const pwaReasons = $derived(data.app.currentPwaReadinessReasons ?? []);
  const pwaLabel = $derived(pwaSurfaceLabel(data.app.currentPwaReadiness, pwaReasons));
  const pwaItems = $derived(pwaChecklist(pwaReasons));
</script>

<script lang="ts" module>
  function buildSdkSnippet(slug: string): string {
    return `import { shippie } from '@shippie/sdk';

shippie.feedback.submit({
  type: 'idea',
  body: 'I would love…',
});`;
  }
  function buildHtmlSnippet(slug: string): string {
    return `<button id="shippie-feedback">Share feedback</button>
<script type="module">
  import { shippie } from 'https://cdn.shippie.app/sdk/v1.latest.js';
  document.getElementById('shippie-feedback')?.addEventListener('click', () => {
    shippie.feedback.open('idea');
  });
</` + `script>`;
  }
</script>

<svelte:head><title>{data.app.name} · Dashboard</title></svelte:head>

<section class="launchpad">
  <header class="launchpad-head">
    <div>
      <p class="eyebrow"><a href="/dashboard">Dashboard</a> · {data.app.name}</p>
      <h1>{data.app.name}</h1>
      <p class="lede">{data.app.tagline ?? `Live at ${data.app.slug}.shippie.app`}</p>
    </div>
    <div class="launchpad-actions">
      <a class="primary" href={`https://${data.app.slug}.shippie.app/`} target="_blank" rel="noreferrer">Open</a>
      <a class="ghost" href={`/apps/${data.app.slug}`}>Public page →</a>
    </div>
  </header>

  <div class="launchpad-stripe" aria-label="Status at a glance">
    <span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span>
    <span class="stat">{data.app.installCount ?? 0} installs</span>
    <span class="stat">{data.app.upvoteCount ?? 0} favorites</span>
    <span class="stat">{data.app.feedbackOpenCount ?? 0} feedback</span>
  </div>

  <div class="launchpad-quick">
    <a class="quick" href={`/dashboard/apps/${data.app.slug}/analytics`}>
      <strong>Analytics</strong>
      <span>Opens, installs, latest event</span>
    </a>
    <a class="quick" href={`/dashboard/apps/${data.app.slug}/feedback`}>
      <strong>Feedback</strong>
      <span>Bugs, ideas, ratings</span>
    </a>
    <a class="quick" href={`/dashboard/apps/${data.app.slug}/profile`}>
      <strong>Profile</strong>
      <span>Source, license, remix</span>
    </a>
    <a class="quick" href={`/apps/${data.app.slug}`}>
      <strong>Trust card</strong>
      <span>What users see before install</span>
    </a>
  </div>

  <details class="snippet-card">
    <summary>Turn on feedback in your app</summary>
    <p class="hint">
      Drop one of these into your app. Submissions land in your inbox at
      <a href={`/dashboard/apps/${data.app.slug}/feedback`}>Feedback</a>. Private by
      default — only you see them unless you choose to publish.
    </p>
    <div class="snippet-tabs">
      <details open>
        <summary>SDK (npm)</summary>
        <pre>{buildSdkSnippet(data.app.slug)}</pre>
      </details>
      <details>
        <summary>Plain HTML</summary>
        <pre>{buildHtmlSnippet(data.app.slug)}</pre>
      </details>
    </div>
  </details>
</section>

<section class="grid">
  <div class="card">
    <h2>App Kind</h2>
    {#if profile && detected}
      <div class="kind-row">
        <KindBadge kind={detected} {status} />
      </div>
      {#if conflict}
        <p class="conflict">
          You declared this as <strong>{conflict.declared}</strong>, but Shippie
          detected <strong>{conflict.detected}</strong>. The marketplace shows
          the detected kind.
        </p>
      {/if}
      {#if profile.reasons?.length}
        <details>
          <summary>Why this label?</summary>
          <ul class="reasons">
            {#each profile.reasons as r}<li>{r}</li>{/each}
          </ul>
        </details>
      {/if}
      {#if profile.localization?.candidate}
        <p class="localize">
          <strong>Eligible to localize:</strong>
          {profile.localization.supportedTransforms.join(', ')}.
          <a href={`/dashboard/apps/${data.app.slug}/localize`}>Run Localize →</a>
        </p>
      {:else if profile.localization?.blockers?.length}
        <p class="muted">
          Localize blockers: {profile.localization.blockers.join(', ')}.
          <a href={`/dashboard/apps/${data.app.slug}/remix`}>Try Remix →</a>
        </p>
      {/if}

      <details class="actions">
        <summary>Workflow probes</summary>
        <p class="hint">
          One path per line — the wrapper observes whether each probe completes
          while the user is offline, upgrading the kind status from
          "verifying" to "confirmed".
        </p>
        <form method="POST" action="?/saveWorkflowProbes">
          <textarea
            name="probes"
            rows="4"
            placeholder="/recipes/new
/journal"
            value={probesText}
          ></textarea>
          <button type="submit">Save probes</button>
          {#if form?.probesOk}
            <span class="success">Saved {form.probesSaved} probe{form.probesSaved === 1 ? '' : 's'}.</span>
          {/if}
        </form>
      </details>

      {#if status !== 'disputed'}
        <details class="actions">
          <summary>Dispute detection</summary>
          <p class="hint">
            If you believe the detected kind is wrong, tell us why. Reviewed
            within 48 hours.
          </p>
          <form method="POST" action="?/disputeKind">
            <textarea
              name="reason"
              rows="3"
              placeholder="Explain why this label is wrong (≥ 10 chars)"
            ></textarea>
            <button type="submit">Submit dispute</button>
            {#if form?.disputeError}
              <span class="error">{form.disputeError}</span>
            {/if}
            {#if form?.disputeOk}
              <span class="success">Dispute filed.</span>
            {/if}
          </form>
        </details>
      {:else}
        <form method="POST" action="?/clearDispute" class="actions">
          <button type="submit">Clear dispute</button>
          {#if form?.clearOk}
            <span class="success">Status reset.</span>
          {/if}
        </form>
      {/if}
    {:else}
      <p class="muted">No kind profile yet — deploy a version to classify.</p>
    {/if}
  </div>

  <div class="card">
    <h2>PWA Readiness</h2>
    <p><span class="vis">{pwaLabel}</span></p>
    <ul class="checklist">
      {#each pwaItems as item (item.id)}
        <li class:itemOk={item.ok}>
          <span>{item.ok ? '✓' : '×'}</span>
          <div>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      {/each}
    </ul>
    {#if data.app.currentPwaReadiness !== 'confirmed'}
      <details class="actions">
        <summary>Upgrade checklist snippets</summary>
        <p class="hint">Add a manifest link, app icons, theme color, and a service worker. Redeploy, then open on a real device to confirm runtime proof.</p>
        <pre>{`<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#14120F">
navigator.serviceWorker?.register('/sw.js')`}</pre>
      </details>
    {/if}
  </div>

  <div class="card">
    <h2>Visibility</h2>
    <p><span class="vis vis-{data.app.visibilityScope}">{data.app.visibilityScope}</span></p>
    <a href={`/dashboard/apps/${data.app.slug}/profile`}>Edit profile →</a>
    <a href={`/dashboard/apps/${data.app.slug}/access`}>Manage access →</a>
  </div>

  <div class="card">
    <h2>Deploys</h2>
    {#if data.deploys.length === 0}
      <p class="muted">No deploys yet.</p>
    {:else}
      <ul>
        {#each data.deploys as d (d.id)}
          <li>
            <span class="ver">v{d.version}</span>
            <span class="status status-{d.status}">{d.status}</span>
            <span class="src">{d.sourceType}</span>
            <span class="time">{d.completedAt ?? d.createdAt}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .launchpad { display: grid; gap: 1rem; margin-bottom: 1.5rem; }
  .launchpad-head { display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: end; }
  @media (max-width: 640px) {
    .launchpad-head { grid-template-columns: 1fr; }
  }
  .eyebrow { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8603C; margin: 0; }
  .eyebrow a { color: inherit; text-decoration: none; }
  .launchpad-head h1 { font-family: 'Fraunces', Georgia, serif; font-size: 2.2rem; margin: 0.25rem 0 0.15rem; letter-spacing: -0.02em; }
  .lede { color: #8B847A; margin: 0; }
  .launchpad-actions { display: flex; gap: 0.5rem; align-items: center; }
  .launchpad-actions .primary {
    background: #1a1a1a; color: #FAF5E9; padding: 0.6rem 1.1rem; font-family: ui-monospace, monospace; font-size: 13px;
    text-transform: uppercase; letter-spacing: 0.06em; min-height: var(--touch-min, 44px); display: inline-flex; align-items: center;
    text-decoration: none;
  }
  .launchpad-actions .ghost {
    background: transparent; color: inherit; padding: 0.6rem 1rem; font-family: ui-monospace, monospace; font-size: 13px;
    border: 1px solid currentColor; min-height: var(--touch-min, 44px); display: inline-flex; align-items: center;
    text-decoration: none;
  }
  .launchpad-stripe { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .launchpad-stripe .stat { font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #5C5751; padding: 4px 10px; border: 1px solid #E5DDC8; }
  .launchpad-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .quick {
    display: grid; gap: 0.2rem; padding: 0.9rem 1rem;
    background: rgba(232, 96, 60, 0.04); border: 1px solid rgba(232, 96, 60, 0.18);
    color: inherit; text-decoration: none;
    min-height: var(--touch-min, 44px);
  }
  .quick:hover { background: rgba(232, 96, 60, 0.08); border-color: #E8603C; }
  .quick strong { font-size: 14px; }
  .quick span { font-size: 12px; color: #8B847A; }
  .snippet-card { padding: 1rem 1.25rem; border: 1px dashed #C9C2B1; }
  .snippet-card > summary { cursor: pointer; font-weight: 600; color: #E8603C; min-height: var(--touch-min, 44px); display: flex; align-items: center; }
  .snippet-tabs { display: grid; gap: 0.6rem; margin-top: 0.6rem; }
  .snippet-tabs > details { padding: 0; }
  .snippet-tabs > details > summary { cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px; text-transform: uppercase; padding: 0.3rem 0; }
  @media (prefers-color-scheme: dark) {
    .launchpad-stripe .stat, .snippet-card { border-color: #2A251E; }
    .quick { background: rgba(232, 96, 60, 0.06); border-color: rgba(232, 96, 60, 0.22); }
    .lede, .quick span { color: #B8A88F; }
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { padding: 1.5rem; border: 1px solid #E5DDC8; border-radius: 0; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; margin: 0 0 0.5rem 0; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  li { display: grid; grid-template-columns: auto auto auto 1fr; gap: 0.5rem; align-items: center; font-size: 13px; }
  .ver { font-family: ui-monospace, monospace; font-weight: 700; }
  .status { font-family: ui-monospace, monospace; font-size: 11px; padding: 2px 8px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .status-success { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .status-failed { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .status-building { background: rgba(232,96,60,0.15); color: #B44820; }
  .src { font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .time { text-align: right; font-family: ui-monospace, monospace; font-size: 11px; color: #8B847A; }
  .vis { font-family: ui-monospace, monospace; font-size: 12px; padding: 4px 12px; border-radius: 0; background: rgba(0,0,0,0.05); }
  .vis-public { background: rgba(46,125,91,0.15); color: #2E7D5B; }
  .vis-private { background: rgba(180,63,42,0.15); color: #B43F2A; }
  .muted { color: #8B847A; }
  a { color: #E8603C; text-decoration: none; font-weight: 600; font-size: 14px; }
  a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .card { border-color: #2A251E; }
    .status, .vis { background: rgba(255,255,255,0.05); }
  }
  .kind-row { margin: 0.25rem 0 0.75rem 0; }
  .conflict {
    background: rgba(232,197,71,0.12);
    border-left: 3px solid #E8C547;
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  .localize {
    background: rgba(46,125,91,0.1);
    border-left: 3px solid #2E7D5B;
    padding: 0.5rem 0.75rem;
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    margin: 0.5rem 0;
  }
  details { font-size: 13px; margin-top: 0.5rem; }
  summary { cursor: pointer; color: #E8603C; font-weight: 600; }
  .reasons { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
  .reasons li { display: list-item; font-size: 12px; color: #6E665B; }
  .actions { margin-top: 0.5rem; }
  .actions textarea {
    width: 100%;
    margin: 0.5rem 0;
    padding: 0.5rem;
    font-family: ui-monospace, monospace;
    font-size: var(--type-body-mobile, 16px);
    border: 1px solid #E5DDC8;
    border-radius: 0;
    box-sizing: border-box;
  }
  .actions button {
    background: #E8603C;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 0;
    font-size: 13px;
    cursor: pointer;
  }
  .actions button:hover { background: #B44820; }
  .hint { font-size: 12px; color: #8B847A; margin: 0.25rem 0; }
  .success { color: #2E7D5B; font-size: 12px; margin-left: 0.5rem; }
  .error { color: #B43F2A; font-size: 12px; margin-left: 0.5rem; }
  .checklist { gap: 0.65rem; margin-top: 0.75rem; }
  .checklist li {
    grid-template-columns: auto 1fr;
    align-items: start;
    border-top: 1px solid #E5DDC8;
    padding-top: 0.65rem;
  }
  .checklist span {
    font-family: ui-monospace, monospace;
    color: #B43F2A;
  }
  .checklist .itemOk span { color: #2E7D5B; }
  .checklist strong { display: block; font-size: 13px; }
  .checklist p { margin: 0.15rem 0 0; color: #8B847A; font-size: 12px; }
  pre {
    white-space: pre-wrap;
    background: rgba(0,0,0,0.05);
    padding: 0.75rem;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
</style>
