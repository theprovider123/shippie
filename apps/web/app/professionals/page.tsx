import type { Metadata } from 'next';
import { SiteNav } from '@/app/components/site-nav';
import { PricingTier } from '@/app/components/marketing/pricing-tier';

export const metadata: Metadata = {
  title: 'Shippie for Professionals — AI that never sees your data',
  description:
    'Compliance-grade local-first apps for solicitors, therapists, financial advisors, and teachers. ' +
    'AI inference runs on the device. Data never leaves the device.',
};

export const runtime = 'nodejs';

export default function Page() {
  return (
    <>
      <SiteNav />
      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '40px 24px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.1, fontWeight: 700 }}>
            AI that never sees your data.
          </h1>
          <p style={{ marginTop: 16, fontSize: 18, color: '#5C5751', lineHeight: 1.5, maxWidth: 640 }}>
            Built for solicitors, therapists, financial advisors, and teachers — everyone who can&rsquo;t
            send client data to American clouds.
          </p>
        </header>

        <section>
          <h2 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 600 }}>
            Compliant by architecture, not by policy
          </h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
            Shippie&rsquo;s local AI runs in a sandboxed iframe on the user&rsquo;s device, on the
            device&rsquo;s own neural processor. Data goes in. Inference happens. Result comes out.
            Nothing leaves.
          </p>
          <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6 }}>
            That&rsquo;s not a privacy promise — it&rsquo;s a network architecture. Your firm&rsquo;s
            compliance team can audit the egress logs and see the same thing every time: nothing.
          </p>
        </section>

        <section>
          <h2 style={{ margin: '0 0 16px', fontSize: 26, fontWeight: 600 }}>Plans</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 18,
            }}
          >
            <PricingTier
              name="Pro"
              price="£10/month"
              audience="Indie makers"
              features={[
                'Unlimited apps',
                'Local AI inference',
                'User-controlled backup',
                'Mesh networking',
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
                'Priority support + SLA',
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
                'Dedicated support',
              ]}
            />
          </div>
        </section>

        <section>
          <h2 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 600 }}>What stays local</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Every AI inference call.</li>
            <li>Every database row.</li>
            <li>Every backup (encrypted to your own Drive — Shippie cannot read it).</li>
            <li>Every cross-device sync (peer-to-peer, end-to-end encrypted).</li>
          </ul>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
            The only thing Shippie&rsquo;s servers ever see is which apps you&rsquo;ve installed and
            the encrypted blobs they relay between your devices. We can&rsquo;t read those blobs
            because we don&rsquo;t have the keys.
          </p>
        </section>
      </main>
    </>
  );
}
