/**
 * Maker home — uses the slim layout data (recent apps + counts) plus the
 * demo-app diagnostics shown in the empty state. Diagnostics are loaded here
 * rather than in the layout so they don't run on every maker page.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { emptyDemoDiagnostics, loadDemoDiagnostics } from '$server/maker/diagnostics';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const { user } = await parent();
  if (!platform?.env.DB) {
    return { demoDiagnostics: emptyDemoDiagnostics() };
  }
  const db = getDrizzleClient(platform.env.DB);
  return { demoDiagnostics: await loadDemoDiagnostics(db, user.id) };
};
