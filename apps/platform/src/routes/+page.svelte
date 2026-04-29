<script lang="ts">
  import type { PageProps } from './$types';
  import AppGrid from '$lib/components/marketplace/AppGrid.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { data }: PageProps = $props();
</script>

<section class="hero">
  <div class="wrap">
    <img
      src="/__shippie-pwa/icon.svg"
      alt=""
      width="96"
      height="96"
      class="hero-mark"
      aria-hidden="true"
    />
    <p class="badge">
      <img src="/__shippie-pwa/icon.svg" alt="" width="11" height="11" />
      Open source · Free forever
    </p>
    <h1 class="hero-heading">
      <span class="line">Ship <span class="accent">local.</span></span>
      <span class="line">Your app. Your device.</span>
      <span class="line">Your data.</span>
    </h1>
    <p class="hero-sub">
      Deploy any web app. Shippie wraps it into a phone-native experience,
      runs it on the user's device, and connects nearby phones directly
      when they're in the same room.
    </p>
    <div class="hero-ctas">
      <Button href="/new" variant="primary" size="lg">Deploy now →</Button>
      <Button href="/apps" variant="secondary" size="lg">Browse apps</Button>
    </div>
    <p class="hero-foot">
      <em>60 seconds</em> for zip uploads, MCP, and CLI deploys.
      <a href="/docs#auto-deploys">GitHub auto-deploys take 2–5 min.</a>
    </p>

    <article class="terms-card" aria-labelledby="hero-terms-title">
      <header class="terms-head">
        <p class="terms-eyebrow">The terms</p>
        <h2 id="hero-terms-title" class="terms-title">Read in 60 seconds.</h2>
        <p class="terms-meta">200 words · Plain English · v1</p>
      </header>
      <div class="terms-body">
        <p><strong>Free.</strong> Shippie is free for makers. No tiers, no caps, no "free until you succeed". Tips welcome at <span class="mono">tip.shippie.app</span>.</p>
        <p><strong>You own your code.</strong> We host it; you keep it. Open source platform. Fork it, self-host it, take it with you any time.</p>
        <p><strong>We can't see end-user data.</strong> Apps store everything in SQLite on the user's phone. Shippie's servers never touch it. There is no database to breach because there is no database.</p>
        <p><strong>We don't sell anything to advertisers.</strong> No ads, no tracking, no analytics piped to a third party. The only telemetry is per-app capability proofs the maker chooses to publish.</p>
        <p><strong>We can take down apps that break the platform.</strong> Malware, illegal content, or attempts to exfiltrate user data get removed. We post every removal publicly with the reason.</p>
        <p><strong>If we shut down, your apps still work.</strong> They're PWAs. The data is on the device. Shippie is the wrapper, not the runtime — pull the wrapper, the apps still run.</p>
        <p>That's the deal. The architecture <em>is</em> the policy.</p>
      </div>
    </article>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">Three pillars</p>
      <h2 class="section-heading">Wrap. Run. Connect.</h2>
      <p class="section-sub">
        Deploy any web app. Shippie wraps it into a phone-native experience,
        runs it on the user's device with their data on their device, and
        connects nearby phones directly when they're in the same room.
      </p>
    </header>
    <ol class="steps">
      <li>
        <span class="step-num">01</span>
        <h3>Wrap</h3>
        <p>
          Deploy your app — Shippie makes it installable, offline-capable,
          tactile, and fast. Haptics, spring transitions, install prompt,
          the Your Data panel — automatic, no SDK calls required.
        </p>
      </li>
      <li>
        <span class="step-num">02</span>
        <h3>Run</h3>
        <p>
          Local SQLite, local files, local AI on the device's NPU when
          available. Backups go to the user's own cloud. Shippie never
          holds your end users' data.
        </p>
      </li>
      <li>
        <span class="step-num">03</span>
        <h3>Connect</h3>
        <p>
          Real-time rooms, peer-to-peer over WebRTC. Pub quizzes, classroom
          tools, collaborative whiteboards. Sub-30 ms remote latency on
          local Wi-Fi — nearby phones talk directly.
        </p>
      </li>
    </ol>
  </div>
</section>

<section class="section featured">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">Featured apps</p>
      <h2 class="section-heading">What's been shipped.</h2>
      <p class="section-sub">
        {#if data.featured.length === 0}
          The marketplace is just getting started. Be the first to launch one.
        {:else}
          Real apps, made with AI, deployed in seconds, installed on real phones.
        {/if}
      </p>
    </header>
    <AppGrid
      apps={data.featured}
      emptyLabel="No apps deployed yet — be the first to launch one."
    />
    {#if data.featured.length > 0}
      <p class="see-all">
        <a href="/apps">See all apps →</a>
      </p>
    {/if}
  </div>
</section>

<section class="section cta">
  <div class="wrap">
    <h2 class="cta-heading">Your first app is 60 seconds away.</h2>
    <p class="cta-sub">
      No review. No credit card. No one telling you it isn't ready.
    </p>
    <Button href="/new" variant="primary" size="lg">Deploy now →</Button>
  </div>
</section>

<style>
  .hero {
    padding: var(--space-3xl) 0 var(--space-2xl);
    border-bottom: 1px solid var(--border-light);
    position: relative;
    overflow: hidden;
  }
  .hero::after {
    content: "";
    position: absolute;
    top: -120px;
    right: -120px;
    width: 360px;
    height: 360px;
    background: radial-gradient(circle, rgba(232, 96, 60, 0.08), transparent 70%);
    pointer-events: none;
  }
  .hero > .wrap { position: relative; z-index: 1; }
  .hero-mark {
    display: block;
    width: 96px;
    height: 96px;
    margin: 0 0 var(--space-lg);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.75rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--marigold);
    border: 1px solid var(--marigold);
    margin: 0 0 var(--space-xl);
  }
  .badge img { display: block; }
  .hero-heading {
    font-family: var(--font-heading);
    font-weight: 600;
    line-height: 1;
    font-size: clamp(2.4rem, 5vw + 0.4rem, 4.5rem);
    letter-spacing: -0.035em;
    margin: 0;
  }
  .hero-heading .line { display: block; }
  .hero-heading .accent { color: var(--sunset); font-style: italic; }
  .hero-sub {
    margin-top: var(--space-xl);
    max-width: 560px;
    color: var(--text-secondary);
    font-size: clamp(1rem, 1.8vw, 1.25rem);
    line-height: 1.6;
  }
  .hero-ctas {
    margin-top: var(--space-xl);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .hero-foot {
    margin-top: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
  }
  .hero-foot em { font-style: normal; color: var(--text); }
  .hero-foot a { color: var(--sunset); text-decoration: underline; }

  .terms-card {
    margin-top: var(--space-2xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--sunset);
    padding: var(--space-xl);
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }
  @media (min-width: 768px) {
    .terms-card {
      grid-template-columns: 220px 1fr;
      gap: var(--space-xl);
    }
  }
  .terms-eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sunset);
    margin: 0;
  }
  .terms-title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    letter-spacing: -0.015em;
    margin: var(--space-xs) 0 var(--space-sm);
  }
  .terms-meta {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    margin: 0;
  }
  .terms-body {
    font-family: var(--font-heading);
    font-size: 1.0625rem;
    line-height: 1.65;
    color: var(--text);
    column-count: 1;
  }
  @media (min-width: 1100px) {
    .terms-body { column-count: 2; column-gap: var(--space-xl); }
  }
  .terms-body p {
    margin: 0 0 var(--space-md);
    break-inside: avoid;
  }
  .terms-body p:first-child { font-weight: 500; }
  .terms-body strong { color: var(--sunset); font-weight: 600; }
  .terms-body em { font-style: italic; color: var(--text); }
  .terms-body .mono { font-family: var(--font-mono); font-size: 0.95em; }

  .section { padding: var(--section-pad) 0; }
  .section-intro { margin-bottom: var(--space-2xl); max-width: 640px; }
  .section-heading {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0.25rem 0 var(--space-md);
  }
  .section-sub {
    color: var(--text-secondary);
    font-size: var(--body-size);
    line-height: 1.6;
    margin: 0;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-xl);
  }
  .steps li { display: flex; flex-direction: column; gap: var(--space-sm); }
  .steps h3 { font-family: var(--font-heading); font-size: 1.25rem; margin: 0; }
  .steps p { color: var(--text-secondary); font-size: var(--small-size); line-height: 1.6; margin: 0; }
  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 0;
    background: var(--sunset);
    color: var(--bg-pure);
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--small-size);
  }
  .steps li:nth-child(2) .step-num { background: var(--sage-moss); }
  .steps li:nth-child(3) .step-num { background: var(--marigold); color: var(--bg-pure); }

  .featured { background: var(--bg-pure); border-top: 1px solid var(--border-light); }
  .see-all {
    margin-top: var(--space-xl);
    font-family: var(--font-mono);
    font-size: var(--small-size);
  }
  .see-all a { color: var(--sunset); text-decoration: underline; }

  .cta {
    text-align: center;
    border-top: 1px solid var(--border-light);
  }
  .cta-heading {
    font-family: var(--font-heading);
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .cta-sub {
    color: var(--text-secondary);
    margin: var(--space-md) auto var(--space-xl);
    max-width: 480px;
  }
</style>
