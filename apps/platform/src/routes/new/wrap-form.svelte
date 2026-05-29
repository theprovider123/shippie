<div class="retired" role="note" aria-label="URL wrap retired">
  <p class="head">Hosted URL wraps are retired.</p>
  <p>
    Shippie now accepts local tools only: upload a built zip, deploy from the CLI, or use MCP
    from your editor. If the app currently depends on Supabase, Firebase, Auth0, analytics, or
    another hosted backend, convert that user data path to Shippie local primitives first.
  </p>
  <pre><code>shippie deploy ./dist</code></pre>
  <a href="/docs#local-runtime">Read the local tool guide</a>
</div>

<style>
  .retired {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
    max-width: 100%;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(232, 96, 60, 0.4);
    background: rgba(232, 96, 60, 0.06);
    color: var(--bg);
  }
  .head {
    margin: 0;
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    font-size: 1.15rem;
    font-weight: 700;
  }
  p {
    margin: 0;
    color: var(--ink-muted-warm);
    line-height: 1.55;
  }
  pre {
    max-width: 100%;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid rgba(20, 18, 15, 0.12);
    background: rgba(20, 18, 15, 0.04);
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  code {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
  a {
    color: var(--danger);
    font-weight: 700;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
</style>
