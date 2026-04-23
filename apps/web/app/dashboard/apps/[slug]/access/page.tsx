import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { SiteNav } from '@/app/components/site-nav';
import { CreateInviteForm } from './create-invite-form';
import { InviteRow } from './invite-row';
import { VisibilityPicker } from './visibility-picker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();

  const db = await getDb();
  const [app] = await db.select().from(schema.apps).where(eq(schema.apps.slug, slug)).limit(1);
  if (!app || app.makerId !== session.user.id) notFound();

  const invites = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.appId, app.id))
    .orderBy(schema.appInvites.createdAt);

  const access = await db
    .select()
    .from(schema.appAccess)
    .where(eq(schema.appAccess.appId, app.id));

  const activeInvites = invites.filter((i) => i.revokedAt == null);

  return (
    <>
      <SiteNav />
      <main
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: 'var(--space-xl)',
          paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))',
        }}
      >
        <header style={{ marginBottom: 'var(--space-xl)' }}>
          <p className="eyebrow">Access · {app.name}</p>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '2rem',
              letterSpacing: '-0.02em',
              margin: '0.25rem 0 var(--space-sm)',
            }}
          >
            Who can see this app
          </h1>
        </header>

        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.25rem',
              marginBottom: 'var(--space-md)',
            }}
          >
            Visibility
          </h2>
          <VisibilityPicker
            slug={slug}
            initial={app.visibilityScope as 'public' | 'unlisted' | 'private'}
          />
        </section>

        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.25rem',
              marginBottom: 'var(--space-md)',
            }}
          >
            Create invite link
          </h2>
          <CreateInviteForm slug={slug} />
        </section>

        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.25rem',
              marginBottom: 'var(--space-md)',
            }}
          >
            Active invites
          </h2>
          {activeInvites.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>No invites yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {activeInvites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  slug={slug}
                  invite={{
                    id: inv.id,
                    token: inv.token,
                    kind: inv.kind,
                    maxUses: inv.maxUses,
                    usedCount: inv.usedCount,
                    expiresAt: inv.expiresAt,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.25rem',
              marginBottom: 'var(--space-md)',
            }}
          >
            Access list
          </h2>
          {access.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>Nobody has claimed yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {access.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: 'var(--space-sm) 0',
                    borderBottom: '1px solid var(--border-light)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {a.userId ?? a.email ?? '—'} · {a.source} · {a.grantedAt.toISOString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
