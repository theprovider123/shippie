/**
 * Client-side error handler. Catches:
 *  - Unhandled errors during hydration.
 *  - Unhandled promise rejections inside SvelteKit-managed code.
 *  - Errors thrown from +page.svelte / +layout.svelte at runtime.
 *
 * Returns a stable shape that +error.svelte reads via $page.error. Without
 * this hook, SvelteKit's default handler swallows the error and the user
 * sees a blank page — a "white screen that doesn't really do anything."
 *
 * Telemetry is just console for now. Wire to a real endpoint when we have
 * volume to learn from (tracked in OUTSTANDING_ACTIONS as P2 polish).
 */
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  console.error('[shippie] client error', { error, status, message, route: event?.route?.id });
  return {
    message: 'Something went wrong.',
  };
};
