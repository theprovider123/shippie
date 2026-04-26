<script lang="ts">
  import PricingTier from '$lib/components/marketing/PricingTier.svelte';
</script>

<svelte:head>
  <title>Shippie for Professionals — AI that never sees your data</title>
  <meta
    name="description"
    content="Compliance-grade local-first apps for solicitors, therapists, financial advisors, and teachers. AI inference runs on the device. Data never leaves the device."
  />
</svelte:head>

<main>
  <header class="hero">
    <h1>AI that never sees your data.</h1>
    <p class="lede">
      Built for solicitors, therapists, financial advisors, and teachers — everyone
      who can&rsquo;t send client data to American clouds.
    </p>
  </header>

  <section>
    <h2>Compliant by architecture, not by policy</h2>
    <p>
      Shippie&rsquo;s local AI runs in a sandboxed iframe on the user&rsquo;s device,
      on the device&rsquo;s own neural processor. Data goes in. Inference happens.
      Result comes out. Nothing leaves.
    </p>
    <p>
      That&rsquo;s not a privacy promise — it&rsquo;s a network architecture. Your
      firm&rsquo;s compliance team can audit the egress logs and see the same thing
      every time: nothing.
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
          'GDPR + HIPAA compatibility statement',
          'On-device inference audit log (exportable)',
          'Architectural data-residency guarantee',
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
          'Custom fine-tuned models in the AI app',
          'Dedicated support'
        ]}
      />
    </div>
  </section>

  <section>
    <h2>What stays local</h2>
    <ul class="checklist">
      <li>Every AI inference call.</li>
      <li>Every database row.</li>
      <li>Every backup (encrypted to your own Drive — Shippie cannot read it).</li>
      <li>Every cross-device sync (peer-to-peer, end-to-end encrypted).</li>
    </ul>
    <p>
      The only thing Shippie&rsquo;s servers ever see is which apps you&rsquo;ve
      installed and the encrypted blobs they relay between your devices. We
      can&rsquo;t read those blobs because we don&rsquo;t have the keys.
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
