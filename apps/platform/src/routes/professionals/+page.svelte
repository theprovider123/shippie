<script lang="ts">
  import PricingTier from '$lib/components/marketing/PricingTier.svelte';
</script>

<svelte:head>
  <title>Shippie for Professionals — local-first tools for sensitive work</title>
  <meta
    name="description"
    content="Local-first tools for sensitive work. App data stays on the device by default; backup, sync, relay, and external services are explicit and visible."
  />
</svelte:head>

<main>
  <header class="hero">
    <h1>Local-first tools for sensitive work.</h1>
    <p class="lede">
      Built for people who need clear data boundaries, fast tools, and fewer hidden
      cloud dependencies before they trust a workflow.
    </p>
  </header>

  <section>
    <h2>Privacy by architecture, backed by disclosure</h2>
    <p>
      Shippie tools keep primary working data on the user&rsquo;s device. When local AI is
      available, inference runs in the on-device browser sandbox, using the best supported
      runtime for that browser and hardware.
    </p>
    <p>
      If a workflow needs backup, sync, relay, external AI, or another service, that movement is
      explicit, encrypted where the feature requires it, and visible in Shippie surfaces before
      users trust it with sensitive data.
    </p>
  </section>

  <section>
    <h2>Plans</h2>
    <div class="tiers">
      <PricingTier
        name="Pro"
        price="£10/month"
        audience="Indie makers"
        features={[
          'Unlimited apps',
          'Local AI inference',
          'User-controlled backup',
          'Mesh networking'
        ]}
      />
      <PricingTier
        name="Professional"
        price="£50–100/month per user"
        audience="Regulated solo practitioners"
        featured
        features={[
          'Everything in Pro',
          'Regulated-workflow review materials',
          'Local inference and connection review logs',
          'Data-residency architecture review',
          'Priority support + SLA'
        ]}
      />
      <PricingTier
        name="Enterprise"
        price="£200–500/month per workspace"
        audience="Firms + practices"
        features={[
          'Everything in Professional',
          'On-prem Shippie Hub',
          'SSO + device management',
          'Private AI deployment planning',
          'Dedicated support'
        ]}
      />
    </div>
  </section>

  <section>
    <h2>What stays local</h2>
    <ul class="checklist">
      <li>Primary app data by default.</li>
      <li>Local AI inputs and outputs when a local model/runtime is used.</li>
      <li>Offline app packages and saved launcher state on the device.</li>
      <li>Encrypted backup, sync, and relay payloads when those features are enabled.</li>
    </ul>
    <p>
      Shippie servers may still see account details, app metadata, operational logs, install or
      saved-tool signals, and encrypted backup or relay payloads when users enable those features.
      Tool content does not move to Shippie unless the user exports, backs up, syncs, relays, or
      connects a service.
    </p>
  </section>
</main>

<style>
  main {
    max-width: 880px;
    margin: 0 auto;
    padding: var(--space-2xl) clamp(1.5rem, 4vw, 3rem) var(--space-3xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
  }

  .hero h1 {
    font-family: var(--font-heading);
    font-size: clamp(2.25rem, 6vw, 3.5rem);
    line-height: 1.1;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .lede {
    margin-top: 1rem;
    font-size: 1.125rem;
    color: var(--text-secondary);
    line-height: 1.55;
    max-width: 640px;
  }

  section h2 {
    font-family: var(--font-heading);
    font-size: clamp(1.5rem, 3vw, 1.75rem);
    margin: 0 0 var(--space-md);
    letter-spacing: -0.01em;
  }
  section p {
    margin: 0 0 0.75rem;
    font-size: var(--body-size);
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .tiers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 18px;
  }

  .checklist {
    margin: 0 0 var(--space-md);
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--text-secondary);
  }
</style>
