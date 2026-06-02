<script lang="ts">
  // Compact launch footer: public chrome should not reintroduce retired routes.
</script>

<footer class="footer" aria-label="Shippie footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brandline" aria-label="Shippie">
        <a href="/dock" class="footer-mark">
          <img
            src="/__shippie-pwa/icon.svg"
            alt=""
            width="24"
            height="24"
            aria-hidden="true"
          />
          <span>Shippie</span>
        </a>
        <span>Open source local tools.</span>
        <a href="mailto:info@shippie.app">info@shippie.app</a>
      </div>

      <nav class="footer-links" aria-label="Product links">
        <a href="/dock">Dock</a>
        <a href="/tools">Tools</a>
        <a href="/docs">Docs</a>
        <a href="/new">Ship</a>
        <a href="/you">You</a>
      </nav>

      <nav class="footer-links" aria-label="Trust links">
        <a href="/docs/privacy">Privacy</a>
        <a href="/docs/terms">Terms</a>
        <a href="/docs/security">Security</a>
        <a href="https://github.com/theprovider123/shippie">GitHub</a>
        <span>AGPL-3.0</span>
      </nav>
    </div>
    <div class="footer-smallprint">
      <span>Everything local unless you choose otherwise.</span>
    </div>
  </div>
</footer>

<style>
  .footer {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 1.25rem 0;
    margin-top: var(--space-xl);
  }
  .footer-grid {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) auto auto;
    align-items: center;
    gap: 0.6rem 1.25rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
  }
  .footer-brandline,
  .footer-links {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem 0.75rem;
  }
  .footer-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: var(--touch-min, 44px);
    font-family: var(--font-heading);
    font-size: var(--small-size);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .footer-mark img { display: block; flex-shrink: 0; }
  .footer a {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min, 44px);
    color: inherit;
    text-decoration: none;
  }
  .footer a:hover {
    color: var(--text-secondary);
  }
  .footer-smallprint {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-light);
  }
  @media (max-width: 640px) {
    .footer {
      margin-top: var(--space-lg);
      padding: 1rem 0 calc(1rem + var(--safe-bottom));
    }
    :global(body[data-mobile-dock-chrome='true']) .footer {
      padding-bottom: calc(4.75rem + var(--safe-bottom));
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }
    .footer-brandline {
      display: flex;
      gap: 0.45rem 0.6rem;
    }
    .footer-links {
      gap: 0.4rem 0.65rem;
    }
    .footer-smallprint {
      margin-top: 0.45rem;
      padding-top: 0.45rem;
    }
  }
</style>
