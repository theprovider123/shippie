import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';

export const load: LayoutServerLoad = async (event) => {
  const admin = requireAdmin(event);
  return { admin };
};
