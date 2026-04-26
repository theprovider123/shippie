/**
 * Session helpers for SvelteKit route handlers.
 *
 * `getSession(event)` — returns the current user/session if any (already
 *   resolved by hooks.server.ts). Routes call this when they want to render
 *   differently based on auth state but don't require a user.
 *
 * `requireUser(event)` — throws a redirect to /auth/login if no session.
 *   Used by dashboard/admin loaders.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppUser } from './lucia';

export interface SessionInfo {
  user: AppUser | null;
  sessionId: string | null;
}

export function getSession(event: RequestEvent): SessionInfo {
  return {
    user: event.locals.user,
    sessionId: event.locals.session?.id ?? null,
  };
}

export function requireUser(event: RequestEvent, returnTo?: string): AppUser {
  if (!event.locals.user) {
    const dest = returnTo ?? event.url.pathname + event.url.search;
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(dest)}`);
  }
  return event.locals.user;
}
