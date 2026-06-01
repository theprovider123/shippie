/**
 * Legacy redirect: `/apps` was the launcher, then the apex `/`; the catalog
 * now lives at `/tools`. Preserve query strings (e.g. `?q=coffee&kind=local`)
 * so existing deep links keep their state.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const search = url.search ?? '';
  redirect(301, `/tools${search}`);
};
