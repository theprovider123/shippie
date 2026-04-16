/**
 * /auth/cli/activate
 *
 * Human-facing activation page for the CLI / MCP device authorization flow.
 * User lands here from either:
 *   - The URL printed by `shippie login` (user_code in querystring)
 *   - The URL shown in the MCP response
 *
 * If not signed in, we redirect to /auth/signin with return_to.
 * If signed in, we show a confirm button that POSTs to /api/auth/cli/approve.
 *
 * RFC 8628 step 2-3 user interface.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ActivateForm } from './activate-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Authorize a device — Shippie',
};

interface SearchParams {
  user_code?: string;
}

export default async function CliActivatePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const { user_code: userCodeParam } = await searchParams;

  if (!session?.user) {
    const returnUrl = userCodeParam
      ? `/auth/cli/activate?user_code=${encodeURIComponent(userCodeParam)}`
      : '/auth/cli/activate';
    redirect(`/auth/signin?return_to=${encodeURIComponent(returnUrl)}`);
  }

  return (
    <main className="min-h-screen grid place-items-center px-6 py-16" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--caption-size)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--sunset)',
            marginBottom: 'var(--space-md)',
          }}
        >
          <Link href="/">shippie.app</Link> · authorize device
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--h1-size)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-lg)',
          }}
        >
          Connect a device to your account.
        </h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 'var(--space-xl)' }}>
          Paste the code your CLI or MCP tool printed. After you confirm, the tool finishes
          polling and stores a bearer token locally. Signed in as{' '}
          <strong>{session.user.email ?? session.user.name ?? 'your account'}</strong>.
        </p>

        <ActivateForm initialCode={userCodeParam ?? ''} />

        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--caption-size)',
            color: 'var(--text-light)',
            marginTop: 'var(--space-xl)',
            lineHeight: 1.6,
          }}
        >
          Did not start this? Close this tab — device codes expire after 15 minutes if not approved.
        </p>
      </div>
    </main>
  );
}
