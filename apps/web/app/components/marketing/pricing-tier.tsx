interface PricingTierProps {
  name: string;
  price: string;
  audience: string;
  features: string[];
  featured?: boolean;
}

export function PricingTier({ name, price, audience, features, featured }: PricingTierProps) {
  return (
    <article
      className="tier"
      data-featured={featured ? 'true' : 'false'}
      style={{
        border: featured ? '2px solid #E8603C' : '1px solid rgba(20,18,15,0.1)',
        borderRadius: 14,
        padding: '24px 22px',
        background: featured ? '#FFFAF6' : '#FFFFFF',
        boxShadow: featured ? '0 12px 40px rgba(232,96,60,0.12)' : '0 6px 20px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{name}</h3>
        <p
          style={{
            margin: '6px 0 2px',
            fontSize: 22,
            fontWeight: 700,
            color: featured ? '#E8603C' : '#14120F',
          }}
        >
          {price}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: '#5C5751' }}>{audience}</p>
      </header>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 14, lineHeight: 1.5 }}>
            {f}
          </li>
        ))}
      </ul>
    </article>
  );
}
