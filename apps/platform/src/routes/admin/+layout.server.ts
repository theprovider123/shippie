/**
 * Admin surface auth gate. See `$server/admin/auth.ts` for the full
 * contract — non-admins get a 404 (we don't leak the surface's
 * existence), unauthenticated users get redirected to login.
 */
import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';

export const load: LayoutServerLoad = async (event) => {
  const admin = requireAdmin(event);
  return { admin };
};
