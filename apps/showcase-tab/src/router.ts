/**
 * Tab uses a flat set of three routes. The literal tuple drives both the
 * exported `Route` union and the runtime `ROUTES` array so that adding a
 * route in one place will fail typecheck if the other isn't updated.
 *
 * `satisfies readonly Route[]` keeps the literal tuple as the source of
 * truth (vs `as readonly Route[]` which widens) and surfaces routing
 * mismatches at compile time.
 */
export const ROUTES = ['tab', 'settle', 'members'] as const satisfies readonly string[];

export type Route = typeof ROUTES[number];
