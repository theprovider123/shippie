/**
 * /admin layout — gates all admin pages behind ADMIN_EMAILS check.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-3 flex items-center gap-6 text-sm font-mono">
        <span className="font-bold text-brand-500">Admin</span>
        <Link href="/admin" className="hover:underline">Apps</Link>
        <Link href="/admin/audit" className="hover:underline">Audit Log</Link>
        <Link href="/dashboard" className="ml-auto hover:underline text-neutral-500">← Dashboard</Link>
      </nav>
      {children}
    </div>
  );
}
