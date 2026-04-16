/**
 * /orgs/invite/[token] — accept an org invite.
 *
 * Server-side lookup by hashed token. If the signed-in user's email
 * matches the invite, the page shows a single "Accept" button that
 * POSTs back to /api/orgs/[slug]/invites/[token]/accept.
 *
 * Spec v6 §15.1.
 */
import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/auth/signin?return_to=/orgs/invite/${token}`);
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = await getDb();

  const invite = await db.query.organizationInvites.findFirst({
    where: and(
      eq(schema.organizationInvites.tokenHash, tokenHash),
      isNull(schema.organizationInvites.acceptedAt),
    ),
  });

  if (!invite) {
    return <InviteError message="Invite not found, already accepted, or expired." />;
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return <InviteError message="This invite has expired." />;
  }
  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return (
      <InviteError
        message={`This invite is for ${invite.email} but you're signed in as ${session.user.email}.`}
      />
    );
  }

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, invite.orgId),
  });
  if (!org) return <InviteError message="Organization no longer exists." />;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full space-y-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Join {org.name}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          You&apos;ve been invited to join <strong>{org.name}</strong> as a{' '}
          <strong>{invite.role}</strong>.
        </p>
        <form action={`/api/orgs/invite/${token}/accept`} method="POST">
          <button
            type="submit"
            className="w-full h-12 rounded-full bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors"
          >
            Accept invite
          </button>
        </form>
      </div>
    </main>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Can&apos;t accept invite</h1>
        <p className="text-neutral-600 dark:text-neutral-400">{message}</p>
      </div>
    </main>
  );
}
