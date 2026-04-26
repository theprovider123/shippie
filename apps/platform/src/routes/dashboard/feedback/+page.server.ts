/**
 * Cross-app feedback inbox loader. Empty in v0 — feedback ingestion
 * lands in Phase 5/6 alongside the wrapper-port. Displays an empty state.
 */
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const layout = await parent();
  return { ...layout, items: [] as Array<{ id: string }> };
};
