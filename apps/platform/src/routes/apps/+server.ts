/**
 * Legacy redirect: `/apps` was the launcher; it's now at apex `/`.
 * Preserve query strings (e.g. `?q=coffee&kind=local`) so existing
 * deep links don't lose their state.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const search = url.search ?? '';
  redirect(301, `/${search}`);
};
