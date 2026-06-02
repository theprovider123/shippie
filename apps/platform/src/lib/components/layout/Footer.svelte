<script lang="ts">
  // Compact launch footer: public chrome should not reintroduce retired routes.
</script>

<footer class="footer">
  <div class="wrap">
    <div class="footer-lines">
      <div class="footer-brandline">
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
        <span>open source</span>
        <span>AGPL-3.0</span>
        <a href="https://github.com/theprovider123/shippie">GitHub</a>
      </div>
      <div class="footer-links" aria-label="Legal and trust links">
        <a href="/docs/privacy">Privacy</a>
        <a href="/docs/terms">Terms</a>
        <a href="/docs/security">Security</a>
      </div>
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
  .footer-lines {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-md) var(--space-xl);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
  }
  .footer-brandline,
  .footer-links {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .footer-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-heading);
    font-size: var(--small-size);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .footer-mark img { display: block; flex-shrink: 0; }
  .footer a {
    color: inherit;
    text-decoration: none;
  }
  .footer a:hover {
    color: var(--text-secondary);
  }
  @media (max-width: 640px) {
    .footer {
      padding-bottom: calc(var(--space-3xl) + var(--safe-bottom));
    }
    .footer-lines {
      display: grid;
      gap: var(--space-md);
    }
  }
</style>
