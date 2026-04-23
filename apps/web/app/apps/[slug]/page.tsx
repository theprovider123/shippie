/**
 * /apps/[slug] — App detail / listing page.
 *
 * Flat hero (no gradients). Square icon. Sunset only on primary CTA.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { eq, desc } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { checkAccess } from '@/lib/access/check';
import { verifyInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';
import { getInviteSecret } from '@/lib/env';
import {
  queryRatingSummary,
  queryLatestReviews,
  queryUserRating,
} from '@/lib/shippie/ratings';
import { queryCoInstalls } from '@/lib/shippie/co-installs';
import { RatingsSummary } from '@/app/components/ratings-summary';
import { CoInstallWidget } from '@/app/components/co-install-widget';
import { InstallButton } from './install-button';
import { RateWidget } from './rate-widget';
import { inArray } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function devInstallUrl(slug: string): string {
  return `http://${slug}.localhost:4200/`;
}

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();

  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, slug) });
  if (!app) notFound();

  // Private-app gate. For 'private' visibility, only viewers with an access
  // grant (owner, app_access row, or valid invite cookie) see the page;
  // others get 404 — no "this app exists" leak.
  if (app.visibilityScope === 'private') {
    const session = await auth();
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === 'production';
    const cookieName = inviteCookieName(slug, { secure: isProd });
    const raw = cookieStore.get(cookieName)?.value;
    let inviteCookie;
    if (raw) {
      const verified = await verifyInviteGrant(raw, getInviteSecret());
      if (verified) {
        inviteCookie = {
          sub: verified.sub,
          app: verified.app,
          tok: verified.tok,
          src: verified.src,
        };
      }
    }
    const access = await checkAccess({
      appId: app.id,
      slug,
      viewer: {
        userId: session?.user?.id,
        email: session?.user?.email ?? undefined,
        inviteCookie,
      },
    });
    if (access === 'denied') notFound();
  }

  const [latestDeploy] = await db.select().from(schema.deploys)
    .where(eq(schema.deploys.appId, app.id)).orderBy(desc(schema.deploys.version)).limit(1);

  const permissions = await db.query.appPermissions.findFirst({
    where: eq(schema.appPermissions.appId, app.id),
  });

  const autopack = (latestDeploy?.autopackagingReport ?? null) as {
    compat?: { score: number; findings: Array<{ severity: string; message: string }> };
    changelog?: { source: string; entries: string[]; summary: string };
  } | null;

  const externalDomains = latestDeploy
    ? await db.query.appExternalDomains.findMany({ where: eq(schema.appExternalDomains.deployId, latestDeploy.id) })
    : [];

  const compatScore = autopack?.compat?.score ?? app.compatibilityScore ?? 0;

  const [ratingSummary, latestReviews, session, coInstallPairs] = await Promise.all([
    queryRatingSummary(db, slug),
    queryLatestReviews(db, slug, 5),
    auth(),
    queryCoInstalls(db, slug, 6),
  ]);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const userRating = userId ? await queryUserRating(db, slug, userId) : null;

  // Hydrate co-install slugs into full app cards, filtered to public + live.
  const coInstallSlugs = coInstallPairs.map((c) => c.appId);
  const coInstallApps = coInstallSlugs.length
    ? await db
        .select({
          slug: schema.apps.slug,
          name: schema.apps.name,
          tagline: schema.apps.tagline,
          description: schema.apps.description,
          iconUrl: schema.apps.iconUrl,
          isArchived: schema.apps.isArchived,
          visibilityScope: schema.apps.visibilityScope,
          activeDeployId: schema.apps.activeDeployId,
        })
        .from(schema.apps)
        .where(inArray(schema.apps.slug, coInstallSlugs))
    : [];
  const coInstallCards = coInstallPairs
    .map((p) => {
      const a = coInstallApps.find((x) => x.slug === p.appId);
      if (!a) return null;
      if (a.isArchived || a.visibilityScope !== 'public' || !a.activeDeployId) return null;
      return {
        slug: a.slug,
        name: a.name,
        taglineOrDesc: a.tagline ?? a.description ?? null,
        icon: a.iconUrl ?? null,
        score: p.score,
      };
    })
    .filter(<T,>(x: T | null): x is T => x !== null);

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="px-6 py-20" style={{ background: app.themeColor, color: '#EDE4D3' }}>
        <div className="max-w-4xl mx-auto">
          <Link href="/apps" className="text-xs font-mono opacity-80 hover:opacity-100 uppercase" style={{ letterSpacing: '0.2em' }}>
            ← All apps
          </Link>
          <div className="mt-6 flex items-start gap-6">
            <div className="w-24 h-24 shippie-icon flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} aria-hidden />
            <div>
              <h1 className="text-display text-4xl md:text-5xl">{app.name}</h1>
              <p className="mt-2 text-lg opacity-90">{app.tagline ?? app.description ?? ''}</p>
              <p className="mt-3 text-xs font-mono opacity-75 uppercase" style={{ letterSpacing: '0.1em' }}>
                {app.type} · {app.category} · v{latestDeploy?.version ?? '?'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={devInstallUrl(app.slug)} target="_blank" rel="noopener"
                  className="inline-block h-12 px-6 font-medium leading-[48px] transition-colors"
                  style={{ background: 'var(--action-primary)', color: '#14120F' }}>
                  Open app
                </a>
                <InstallButton url={devInstallUrl(app.slug)} name={app.name} slug={app.slug} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Compatibility</h2>
          <div className="flex items-center gap-3">
            <span className="text-3xl" style={{ color: 'var(--green-leaf)' }}>{'★'.repeat(compatScore)}{'☆'.repeat(5 - compatScore)}</span>
            <span style={{ color: 'var(--text-muted)' }}>{compatScore}/5</span>
          </div>
          {autopack?.compat?.findings && autopack.compat.findings.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {autopack.compat.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span style={{ color: f.severity === 'match' ? 'var(--semantic-success)' : f.severity === 'violation' ? 'var(--semantic-error)' : 'var(--semantic-warning)' }}>
                    {f.severity === 'match' ? '✓' : f.severity === 'violation' ? '✗' : '⚠'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Permissions</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <PermRow label="Sign in" on={permissions?.auth ?? false} />
            <PermRow label="User storage" on={(permissions?.storage ?? 'none') !== 'none'} />
            <PermRow label="File uploads" on={permissions?.files ?? false} />
            <PermRow label="Notifications" on={permissions?.notifications ?? false} />
            <PermRow label="Analytics" on={permissions?.analytics ?? true} />
            <PermRow label="External network" on={permissions?.externalNetwork ?? false} />
          </ul>
        </section>

        {externalDomains.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">External domains</h2>
            <ul className="text-sm font-mono space-y-1">
              {externalDomains.map((d: { domain: string; source: string; allowed: boolean }) => (
                <li key={d.domain} className="flex items-center gap-2">
                  <span style={{ color: d.allowed ? 'var(--semantic-success)' : 'var(--semantic-warning)' }}>{d.allowed ? '✓' : '⚠'}</span>
                  <span>{d.domain}</span>
                  <span style={{ color: 'var(--text-muted)' }}>({d.source})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {autopack?.changelog && (
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Latest changes</h2>
            <p className="font-medium">{autopack.changelog.summary}</p>
            {autopack.changelog.entries.length > 0 && (
              <ul className="text-sm space-y-1 ml-4" style={{ color: 'var(--text-secondary)' }}>
                {autopack.changelog.entries.map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            )}
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>source: {autopack.changelog.source}</p>
          </section>
        )}

        <section style={{ marginTop: 'var(--space-2xl, 4rem)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 16 }}>
            Ratings &amp; reviews
          </h2>
          <RatingsSummary summary={ratingSummary} latest={latestReviews} />
          {userId && <RateWidget slug={slug} initial={userRating} />}
        </section>

        {coInstallCards.length > 0 && (
          <section style={{ marginTop: 'var(--space-2xl, 4rem)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 4 }}>
              Users also installed
            </h2>
            <p style={{ color: 'var(--text-light, #7A6B58)', fontSize: 13, margin: '0 0 16px' }}>
              Based on overlap with other Shippie apps.
            </p>
            <CoInstallWidget entries={coInstallCards} />
          </section>
        )}
      </div>
    </main>
  );
}

function PermRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span style={{ color: on ? 'var(--semantic-success)' : 'var(--text-muted)' }}>{on ? '✓' : '—'}</span>
      <span style={{ color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
    </li>
  );
}
