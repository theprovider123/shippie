<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
</script>

<svelte:head>
  <title>Why Shippie — maker economics</title>
  <meta
    name="description"
    content="App Store takes 30% and 14 days. Shippie takes 0% and 60 seconds. Here is the math, and the reasons it adds up that way."
  />
</svelte:head>

<section class="hero wrap">
  <img
    src="/__shippie-pwa/icon.svg"
    alt=""
    width="80"
    height="80"
    class="hero-mark"
    aria-hidden="true"
  />
  <p class="eyebrow">The math</p>
  <h1 class="title">Why Shippie.</h1>
  <p class="lede">
    Not an argument. Just three numbers, plainly true, and rarely stated together.
  </p>
</section>

<section class="numbers">
  <div class="wrap">
    <div class="grid">
      <article class="number-card">
        <p class="big">$3,000</p>
        <p class="kicker">out of every $10k</p>
        <p class="body">
          Apple keeps 30% of what your app earns on the App Store. Shippie takes 0%. If your app makes $10k/yr, you keep $10k/yr.
        </p>
      </article>
      <article class="number-card">
        <p class="big">14 days</p>
        <p class="kicker">vs 60 seconds</p>
        <p class="body">
          Median App Store review. Shippie median time-to-live: under a minute. That's not a small difference — it's a different job.
        </p>
      </article>
      <article class="number-card">
        <p class="big">0 rejections</p>
        <p class="kicker">by design</p>
        <p class="body">
          There's no review queue on Shippie. Your app ships when you ship it. If it violates policy you get taken down — but nothing sits for a week waiting for permission.
        </p>
      </article>
    </div>
  </div>
</section>

<section class="open-source">
  <div class="wrap">
    <p class="eyebrow">And why it's open source</p>
    <h2 class="section-heading">A platform you can leave.</h2>
    <div class="prose">
      <p>
        Platforms that host your audience have leverage over your work. We built Shippie so that leverage is always returnable.
      </p>
      <p>
        The platform is AGPL-3.0. Self-host it. Fork it. Run your own instance on any box. Your apps are yours; your users install from a URL you own.
      </p>
      <p>
        If Shippie ever does something you disagree with, the door out is short: change your DNS and keep shipping.
      </p>
    </div>
  </div>
</section>

<section class="cta wrap">
  <h2>Ship the first one.</h2>
  <p>Drop a zip. Get a URL. Install it on your phone. See the math for yourself.</p>
  <Button href="/new" variant="primary" size="lg">Try it now →</Button>
</section>

<style>
  .hero {
    padding: var(--space-3xl) 0 var(--space-2xl);
    max-width: 760px;
  }
  .hero-mark {
    display: block;
    width: 80px;
    height: 80px;
    margin-bottom: var(--space-md);
  }
  .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--small-size);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0 0 var(--space-md);
  }
  .title {
    font-family: var(--font-heading);
    font-size: var(--h1-size);
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-xl);
  }
  .lede {
    font-size: clamp(1.125rem, 2vw, 1.375rem);
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .numbers {
    border-top: 1px solid var(--border-light);
    padding: var(--section-pad) 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-xl);
  }
  .number-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0;
  }
  .number-card .big {
    font-family: var(--font-heading);
    font-size: clamp(2.5rem, 5vw, 3.5rem);
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--sunset);
    margin: 0;
  }
  .number-card .kicker {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
    margin: 0;
  }
  .number-card .body {
    color: var(--text-secondary);
    line-height: 1.7;
    font-size: var(--small-size);
    margin: 0;
  }

  .open-source {
    border-top: 1px solid var(--border-light);
    padding: var(--section-pad) 0;
  }
  .section-heading {
    font-family: var(--font-heading);
    font-size: var(--h2-size);
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0.5rem 0 var(--space-xl);
  }
  .prose {
    color: var(--text-secondary);
    line-height: 1.8;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .prose p { margin: 0; }

  .cta {
    text-align: center;
    padding: var(--section-pad) 0 var(--space-3xl);
    border-top: 1px solid var(--border-light);
  }
  .cta h2 {
    font-family: var(--font-heading);
    font-size: var(--h1-size);
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .cta p {
    color: var(--text-secondary);
    margin: var(--space-md) auto var(--space-xl);
    max-width: 480px;
  }
</style>
