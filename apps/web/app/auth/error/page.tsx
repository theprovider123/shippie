/**
 * /auth/error — generic Auth.js error surface.
 *
 * Auth.js sets an `error` search param on redirect. We surface it with a
 * link back to sign-in so the user isn't stranded.
 */
import Link from 'next/link';

type AuthErrorParams = {
  error?: string;
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<AuthErrorParams>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-bold">Sign-in error</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {error ?? 'Something went wrong while signing in.'}
        </p>
        <Link
          href="/auth/signin"
          className="inline-flex h-11 items-center rounded-full bg-brand-500 px-6 text-white font-medium hover:bg-brand-600 transition-colors"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
