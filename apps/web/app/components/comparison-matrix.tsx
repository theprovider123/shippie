interface Row {
  label: string;
  shippie: string;
  appStore: string;
  vercel: string;
  glide: string;
}

const ROWS: Row[] = [
  { label: 'Time to live',              shippie: '60 seconds',  appStore: '14 days',      vercel: '60 seconds',  glide: 'minutes' },
  { label: 'Revenue share',             shippie: '0%',          appStore: '30%',          vercel: '0%',          glide: 'plan-tiered' },
  { label: 'Review queue',              shippie: 'none',        appStore: 'yes',          vercel: 'none',        glide: 'none' },
  { label: 'Installable on phones',     shippie: 'yes (PWA)',   appStore: 'yes (native)', vercel: 'DIY',         glide: 'partial' },
  { label: 'Your data stays yours',     shippie: 'yes',         appStore: 'no',           vercel: 'yes',         glide: 'no' },
  { label: 'Open source',               shippie: 'yes (AGPL)',  appStore: 'no',           vercel: 'no',          glide: 'no' },
  { label: 'Deploy from Claude Code',   shippie: 'native (MCP)',appStore: 'no',           vercel: 'CLI only',    glide: 'no' },
  { label: 'Self-hostable',             shippie: 'yes',         appStore: 'no',           vercel: 'no',          glide: 'no' },
];

export function ComparisonMatrix() {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--small-size)',
          minWidth: 640,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <Th />
            <Th highlight>Shippie</Th>
            <Th>App Store</Th>
            <Th>Vercel</Th>
            <Th>Glide</Th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <Td label>{row.label}</Td>
              <Td highlight>{row.shippie}</Td>
              <Td>{row.appStore}</Td>
              <Td>{row.vercel}</Td>
              <Td>{row.glide}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--caption-size)',
          color: 'var(--text-light)',
          marginTop: 'var(--space-md)',
          letterSpacing: '0.02em',
        }}
      >
        Honest on purpose. Each of these tools does something Shippie doesn&apos;t — we&apos;re not a
        native SDK, not a full-stack host, not a no-code builder. We ship your web app to phones. That&apos;s it.
      </p>
    </div>
  );
}

function Th({ children, highlight }: { children?: React.ReactNode; highlight?: boolean }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: 'var(--space-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--caption-size)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: highlight ? 'var(--sunset)' : 'var(--text-light)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  label,
  highlight,
}: {
  children: React.ReactNode;
  label?: boolean;
  highlight?: boolean;
}) {
  return (
    <td
      style={{
        padding: 'var(--space-md)',
        color: label ? 'var(--text-secondary)' : highlight ? 'var(--text)' : 'var(--text-secondary)',
        fontWeight: label ? 600 : highlight ? 600 : 400,
        fontFamily: label ? 'var(--font-body)' : 'var(--font-mono)',
        fontSize: 'var(--small-size)',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}
