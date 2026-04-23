// apps/web/app/invite/[token]/page.tsx
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { SiteNav } from '@/app/components/site-nav';
import { ClaimButton } from './claim-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadInvite(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.appInvites.id,
      revokedAt: schema.appInvites.revokedAt,
      expiresAt: schema.appInvites.expiresAt,
      maxUses: schema.appInvites.maxUses,
      usedCount: schema.appInvites.usedCount,
      appName: schema.apps.name,
      appSlug: schema.apps.slug,
      appTagline: schema.apps.tagline,
    })
    .from(schema.appInvites)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.appInvites.appId))
    .where(eq(schema.appInvites.token, token))
    .limit(1);
  return row;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await loadInvite(token);
  const invalid =
    !inv ||
    inv.revokedAt != null ||
    (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) ||
    (inv.maxUses != null && inv.usedCount >= inv.maxUses);

  return (
    <>
      <SiteNav />
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{
          paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))',
        }}
      >
        <div
          className="w-full max-w-md"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xl)',
            textAlign: 'center',
          }}
        >
          {invalid ? (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>
                Invite expired
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Ask the person who shared this with you for a new link.
              </p>
              <Link
                href="/"
                style={{ color: 'var(--sunset)', fontFamily: 'var(--font-mono)' }}
              >
                ← shippie.app
              </Link>
            </>
          ) : (
            <>
              <p className="eyebrow">You&apos;re invited to</p>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '2.5rem',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {inv!.appName}
              </h1>
              {inv!.appTagline && (
                <p style={{ color: 'var(--text-secondary)' }}>{inv!.appTagline}</p>
              )}
              <ClaimButton token={token} />
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-light)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                This invite gives you access for 30 days. Sign in to make it permanent.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
