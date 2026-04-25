import type { Metadata } from 'next';
import { loadAppProfileForOwner } from '@/lib/dashboard/profile-loader';
import { readShippieJson } from '@/lib/dashboard/shippie-json';
import { CAPABILITY_CATALOG, extractEnabledCapabilityIds } from './catalog';
import { EnhancementsClient } from './EnhancementsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Enhancements — Shippie',
};

const RULE_LABEL: Record<string, string> = {
  textures: 'Sensory textures (haptic + sound + visual)',
  wakelock: 'Keep screen awake during use',
  'share-target': 'Receive shared content from other apps',
};

interface PageProps {
  params: Promise<{ appSlug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { appSlug } = await params;
  const [{ profile }, shippieJson] = await Promise.all([
    loadAppProfileForOwner(appSlug),
    readShippieJson(appSlug),
  ]);

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Enhancements</h1>
        <p style={{ marginTop: 12, color: '#5C5751' }}>
          This app hasn&rsquo;t been analysed yet. The next deploy will populate this view.
        </p>
        <EnhancementsClient slug={appSlug} initialJson={shippieJson} />
      </main>
    );
  }

  const detected: Array<{ selector: string; rule: string }> = [];
  for (const [selector, rules] of Object.entries(profile.recommended.enhance)) {
    for (const rule of rules) detected.push({ selector, rule });
  }

  const enabled = new Set(extractEnabledCapabilityIds(shippieJson));
  const available = CAPABILITY_CATALOG.filter((c) => !enabled.has(c.id));

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Enhancements</h1>
        <p style={{ marginTop: 8, color: '#5C5751', fontSize: 15 }}>
          Shippie auto-detected the following capabilities for{' '}
          <strong>{profile.inferredName}</strong>. Override anything in{' '}
          <code>shippie.json</code> below.
        </p>
        <p style={{ marginTop: 4, color: '#8E8A86', fontSize: 13 }}>
          Inferred category:{' '}
          <strong>{profile.category.primary}</strong>
          {profile.category.confidence > 0
            ? ` (${Math.round(profile.category.confidence * 100)}% confidence)`
            : ''}
        </p>
      </header>

      <section>
        <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600 }}>
          Active (auto-detected)
        </h2>
        {detected.length === 0 ? (
          <p style={{ color: '#5C5751' }}>No enhancements active.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detected.map(({ selector, rule }) => (
              <li
                key={`${selector}::${rule}`}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#F7F4ED',
                  fontSize: 14,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <span>{RULE_LABEL[rule] ?? rule}</span>
                <code style={{ fontSize: 12, color: '#5C5751' }}>{selector}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600 }}>Available (opt-in)</h2>
        {available.length === 0 ? (
          <p style={{ color: '#5C5751' }}>You&rsquo;ve enabled every available capability.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {available.map((c) => (
              <li
                key={c.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'white',
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{c.label}</h3>
                <p style={{ margin: '6px 0 8px', color: '#5C5751', fontSize: 14 }}>{c.blurb}</p>
                <a href={c.docsHref} style={{ color: '#E8603C', fontSize: 14 }}>
                  Docs →
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EnhancementsClient slug={appSlug} initialJson={shippieJson} />
    </main>
  );
}
