<script lang="ts">
  import type { PageProps } from './$types';
  import AppGrid from '$lib/components/marketplace/AppGrid.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { data }: PageProps = $props();
</script>

<section class="hero">
  <div class="wrap">
    <p class="badge">Open source · Launched 2026</p>
    <h1 class="hero-heading">
      <span class="line">Build it with AI.</span>
      <span class="line">On your phone.</span>
      <span class="line accent">In 60 seconds.</span>
    </h1>
    <p class="hero-sub">
      No app store. No review. No 30% cut.<br />
      Your data stays on your backend. Open source.
    </p>
    <div class="hero-ctas">
      <Button href="/new" variant="primary" size="lg">Deploy now →</Button>
      <Button href="/apps" variant="secondary" size="lg">Browse apps</Button>
    </div>
    <p class="hero-foot">
      <em>60 seconds</em> for zip uploads, MCP, and CLI deploys.
      <a href="/docs#auto-deploys">GitHub auto-deploys take 2–5 min.</a>
    </p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <header class="section-intro">
      <p class="eyebrow">Three steps</p>
      <h2 class="section-heading">Install, build, ship.</h2>
    </header>
    <ol class="steps">
      <li>
        <span class="step-num">01</span>
        <h3>Install Shippie</h3>
        <p>One CLI, one MCP server, one website. Pick whichever fits how you work.</p>
      </li>
      <li>
        <span class="step-num">02</span>
        <h3>Build with AI</h3>
        <p>Claude Code, Cursor, the AI tool you already use. Your prompt → a real app.</p>
      </li>
      <li>
        <span class="step-num">03</span>
        <h3>Ship to your phone</h3>
        <p>One deploy. A URL. Install it like a real app. Share it with whoever you want.</p>
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
  }
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--marigold);
    border: 1px solid var(--marigold);
    border-radius: 100px;
    margin: 0 0 var(--space-xl);
  }
  .hero-heading {
    font-family: var(--font-heading);
    font-weight: 600;
    line-height: 1.05;
    font-size: clamp(2.4rem, 5vw + 0.4rem, 4.5rem);
    letter-spacing: -0.03em;
    margin: 0;
  }
  .hero-heading .line { display: block; }
  .hero-heading .accent { color: var(--sunset); }
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
    border-radius: 50%;
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
