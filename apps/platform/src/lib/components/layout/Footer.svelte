<script lang="ts">
  // Three-column footer with brand attribution.
</script>

<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-mark">
          <img
            src="/__shippie-pwa/icon.svg"
            alt=""
            width="32"
            height="32"
            aria-hidden="true"
          />
          <span>shippie</span>
        </div>
        <p class="footer-tagline">No app store. Just the web, installed.</p>
        <a href="https://github.com/shippie/shippie" class="footer-link">GitHub</a>
      </div>
      <div>
        <p class="footer-heading">Product</p>
        <a href="/apps" class="footer-link">Explore</a>
        <a href="/leaderboards" class="footer-link">Leaderboards</a>
        <a href="/new" class="footer-link">Deploy</a>
        <a href="/why" class="footer-link">Why Shippie</a>
      </div>
      <div>
        <p class="footer-heading">Build</p>
        <a href="/docs" class="footer-link">Docs</a>
        <a href="/docs#sdk" class="footer-link">SDK reference</a>
        <a href="/docs#self-hosting" class="footer-link">Self-hosting</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; 2026 Shippie · AGPL-3.0 · Made with sage and sunset</span>
      <span>Privacy · Terms · Security</span>
    </div>
  </div>
</footer>

<style>
  .footer {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: var(--space-3xl) 0 var(--space-xl);
    margin-top: var(--space-3xl);
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: var(--space-xl);
  }
  @media (max-width: 640px) {
    .footer-grid { grid-template-columns: 1fr; gap: var(--space-lg); }
  }
  .footer-brand { max-width: 360px; }
  .footer-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: var(--space-sm);
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .footer-mark img { display: block; flex-shrink: 0; }
  .footer-tagline {
    font-family: var(--font-heading);
    font-style: italic;
    font-size: var(--small-size);
    color: var(--text-secondary);
    margin: 0 0 var(--space-md);
  }
  .footer-heading {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0 0 var(--space-md);
  }
  .footer-link {
    display: block;
    font-size: var(--small-size);
    color: var(--text-secondary);
    padding: 0.25rem 0;
    transition: color 0.2s;
  }
  .footer-link:hover { color: var(--text); }
  .footer-bottom {
    margin-top: var(--space-2xl);
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
  }
</style>
