export function Manifesto() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'left' }}>
      <p
        className="section-label"
        style={{ color: 'var(--cream-muted)', marginBottom: 'var(--space-lg)' }}
      >
        Manifesto
      </p>
      <h2
        className="section-heading"
        style={{
          fontSize: 'var(--h2-size)',
          color: 'var(--cream-text)',
          marginBottom: 'var(--space-xl)',
        }}
      >
        The web was supposed to be open.
      </h2>

      <div
        style={{
          color: 'var(--cream-secondary)',
          lineHeight: 1.8,
          fontSize: 'var(--body-size)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-md)',
        }}
      >
        <p>
          An app shouldn&apos;t take two weeks to reach a user. It shouldn&apos;t cost 30% of every dollar it earns.
          It shouldn&apos;t require a company to review it. It shouldn&apos;t die when one corporation decides it should.
        </p>
        <p>
          Web apps already run on every phone. PWAs already install. The plumbing is there. What&apos;s missing is
          the ritual — the one-minute path from &ldquo;I built this with AI&rdquo; to &ldquo;someone installed it
          on their phone.&rdquo;
        </p>
        <p>
          That&apos;s Shippie. We host your frontend at a real URL, make it installable, and never touch your data.
          Your backend is yours. Your code is yours. Our code is open source (AGPL). Fork it. Self-host it. Leave
          when you want.
        </p>
        <p style={{ fontWeight: 600, color: 'var(--cream-text)' }}>
          No app store. No review. No 30% cut. No gatekeeper.
        </p>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-heading)',
          fontStyle: 'italic',
          fontSize: 'var(--small-size)',
          color: 'var(--cream-muted)',
          marginTop: 'var(--space-2xl)',
        }}
      >
        — the Shippie makers
      </p>
    </div>
  );
}
