<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import KindBadge from '$lib/components/marketplace/KindBadge.svelte';
  import type { AppKind, AppKindProfile, PublicKindStatus } from '$lib/types/app-kind';
  import { pwaChecklist, pwaSurfaceLabel } from '$lib/types/pwa-readiness';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const profile = $derived(data.kindProfile as AppKindProfile | null);
  const detected = $derived<AppKind | null>(profile?.detectedKind ?? null);
  const declared = $derived<AppKind | null>(profile?.declaredKind ?? null);
  const status = $derived<PublicKindStatus | null>(profile?.publicKindStatus ?? null);
  const conflict = $derived(profile && declared && declared !== detected ? { declared, detected } : null);
  const probesText = $derived((data.workflowProbes ?? []).join('\n'));
  const pwaReasons = $derived(data.app.currentPwaReadinessReasons ?? []);
  const pwaLabel = $derived(pwaSurfaceLabel(data.app.currentPwaReadiness, pwaReasons));
  const pwaItems = $derived(pwaChecklist(pwaReasons));
</script>

<script lang="ts" module>
  function buildFeedbackSnippet(): string {
    return `import { shippie } from '@shippie/sdk';

shippie.feedback.submit({
  type: 'idea',
  body: 'I would love...',
});`;
  }

  function buildHtmlSnippet(): string {
    return `<button id="shippie-feedback">Share feedback</button>
<script type="module">
  import { shippie } from 'https://cdn.shippie.app/sdk/v1.latest.js';
  document.getElementById('shippie-feedback')?.addEventListener('click', () => {
    shippie.feedback.open('idea');
  });
</` + `script>`;
  }
</script>

<svelte:head><title>Settings · {data.app.name}</title></svelte:head>

<section class="settings">
  <section id="sdk" class="block">
    <div class="block-head">
      <p class="eyebrow">SDK setup</p>
      <h2>Feedback and analytics</h2>
      <p>Use these snippets to send aggregate health signals into Maker.</p>
    </div>
    <div class="snippet-grid">
      <details open>
        <summary>Feedback widget</summary>
        <pre>{buildFeedbackSnippet()}</pre>
      </details>
      <details>
        <summary>Plain HTML feedback</summary>
        <pre>{buildHtmlSnippet()}</pre>
      </details>
      <details open>
        <summary>Analytics event</summary>
        <pre>{`import { shippie } from '@shippie/sdk';

shippie.analytics.track('opened');`}</pre>
      </details>
    </div>
  </section>

  <section class="block">
    <div class="block-head row-head">
      <div>
        <p class="eyebrow">Deploys</p>
        <h2>Recent deploy history</h2>
      </div>
      <a href={`/maker/apps/${data.app.slug}/enhancements`}>Enhancements →</a>
    </div>
    {#if data.deploys.length === 0}
      <p class="muted">No deploys yet.</p>
    {:else}
      <ul class="deploy-list">
        {#each data.deploys as d (d.id)}
          <li>
            <a href={`/maker/apps/${data.app.slug}/deploys/${d.id}`} class="ver">v{d.version}</a>
            <span class="status status-{d.status}">{d.status}</span>
            <span class="src">{d.sourceType}</span>
            <time datetime={d.completedAt ?? d.createdAt}>{d.completedAt ?? d.createdAt}</time>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="block">
    <div class="block-head">
      <p class="eyebrow">App Kind</p>
      <h2>Connection status</h2>
    </div>
    {#if profile && detected}
      {#if detected === 'local'}
        <p class="muted">No external connections detected in the latest app profile.</p>
      {:else}
        <div class="kind-row">
          <KindBadge kind={detected} {status} />
        </div>
      {/if}
      {#if conflict}
        <p class="conflict">
          You declared this as <strong>{conflict.declared}</strong>, but Shippie detected
          <strong>{conflict.detected}</strong>.
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
          <a href={`/maker/apps/${data.app.slug}/localize`}>Run Localize →</a>
        </p>
      {:else if profile.localization?.blockers?.length}
        <p class="muted">
          Localize blockers: {profile.localization.blockers.join(', ')}.
          <a href={`/maker/apps/${data.app.slug}/remix`}>Try Remix →</a>
        </p>
      {/if}

      <details class="actions">
        <summary>Workflow probes</summary>
        <p class="hint">
          One path per line. The wrapper observes whether each probe completes while the user is offline.
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
          <p class="hint">If you believe the detected kind is wrong, tell us why. Reviewed within 48 hours.</p>
          <form method="POST" action="?/disputeKind">
            <textarea name="reason" rows="3" placeholder="Explain why this label is wrong (at least 10 chars)"></textarea>
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
      <p class="muted">No kind profile yet. Deploy a version to classify.</p>
    {/if}
  </section>

  <section class="block">
    <div class="block-head">
      <p class="eyebrow">PWA readiness</p>
      <h2>{pwaLabel}</h2>
    </div>
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
        <pre>{`<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#14120F">
navigator.serviceWorker?.register('/sw.js')`}</pre>
      </details>
    {/if}
  </section>

  <section class="block">
    <div class="block-head row-head">
      <div>
        <p class="eyebrow">Advanced</p>
        <h2>Operational tools</h2>
      </div>
      <a href={`/maker/apps/${data.app.slug}/enhancements`}>Open enhancements →</a>
    </div>
    <p class="muted">Kind disputes, PWA proof, workflow probes, and deploy history live here so Home stays focused.</p>
  </section>
</section>

<style>
  .settings {
    display: grid;
    gap: var(--space-lg);
    max-width: 980px;
  }
  .block {
    border-top: 1px solid var(--paper-cream);
    padding-top: 1rem;
  }
  .block-head {
    margin-bottom: 0.85rem;
  }
  .row-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }
  .eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--sunset);
    margin: 0;
  }
  h2 {
    margin: 0.2rem 0 0;
    font-size: 1.25rem;
    letter-spacing: 0;
  }
  .muted,
  .hint,
  .block-head p:not(.eyebrow) {
    color: var(--text-muted-warm);
  }
  .snippet-grid {
    display: grid;
    gap: 0.75rem;
  }
  details {
    font-size: 13px;
  }
  summary {
    cursor: pointer;
    color: var(--sunset);
    font-weight: 700;
    min-height: var(--touch-min, 44px);
    display: flex;
    align-items: center;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: rgba(0, 0, 0, 0.05);
    padding: 0.75rem;
    font-size: 12px;
  }
  a {
    color: var(--sunset);
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
  }
  a:hover {
    text-decoration: underline;
  }
  .deploy-list,
  .reasons,
  .checklist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .deploy-list li {
    display: grid;
    grid-template-columns: 72px auto auto minmax(0, 1fr);
    gap: 0.55rem;
    align-items: center;
    min-height: 42px;
    border-bottom: 1px solid var(--paper-cream);
    font-size: 13px;
  }
  .ver,
  .status,
  .src,
  time {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  .status {
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.05);
  }
  .status-success { background: rgba(46,125,91,0.15); color: var(--success); }
  .status-failed { background: rgba(180,63,42,0.15); color: var(--danger); }
  .status-building { background: rgba(232,96,60,0.15); color: var(--danger-hover); }
  .src,
  time {
    color: var(--text-muted-warm);
  }
  time {
    text-align: right;
  }
  .kind-row {
    margin-bottom: 0.75rem;
  }
  .conflict,
  .localize {
    border-left: 3px solid var(--sunset);
    padding: 0.55rem 0.75rem;
    margin: 0.6rem 0;
    background: rgba(232, 96, 60, 0.08);
    font-size: 13px;
  }
  .localize {
    border-left-color: var(--success);
    background: rgba(46, 125, 91, 0.1);
  }
  .reasons {
    list-style: disc;
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  .actions {
    margin-top: 0.6rem;
  }
  textarea {
    width: 100%;
    margin: 0.5rem 0;
    padding: 0.6rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--type-body-mobile, 16px);
    border: 1px solid var(--paper-cream);
    background: transparent;
    color: inherit;
    box-sizing: border-box;
  }
  button {
    min-height: var(--touch-min, 44px);
    background: var(--sunset);
    color: white;
    border: 0;
    padding: 0 0.85rem;
    cursor: pointer;
  }
  .success,
  .error {
    font-size: 12px;
    margin-left: 0.5rem;
  }
  .success { color: var(--success); }
  .error { color: var(--danger); }
  .checklist {
    gap: 0.65rem;
  }
  .checklist li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.55rem;
    align-items: start;
    border-top: 1px solid var(--paper-cream);
    padding-top: 0.65rem;
  }
  .checklist span {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--danger);
  }
  .checklist .itemOk span {
    color: var(--success);
  }
  .checklist p {
    margin: 0.15rem 0 0;
    color: var(--text-muted-warm);
    font-size: 12px;
  }
  @media (prefers-color-scheme: dark) {
    .block,
    .deploy-list li,
    .checklist li,
    textarea {
      border-color: var(--ink-warm);
    }
    .status,
    pre {
      background: rgba(255, 255, 255, 0.05);
    }
  }
  @media (max-width: 720px) {
    .row-head {
      align-items: start;
      flex-direction: column;
    }
    .deploy-list li {
      grid-template-columns: 58px auto 1fr;
    }
    .deploy-list time {
      grid-column: 1 / -1;
      text-align: left;
    }
  }
</style>
