// Safe Mode shell (5C).
//
// Loaded when the main container fails, when the user explicitly
// navigates to /safe, or when the bridge `safe-mode hint` fires from
// a fail-closed ledger commit.
//
// Client-only so it never touches D1, KV, or the container shell.
// The whole point is to remain navigable even if the container is
// broken.
export const ssr = false;
export const csr = true;
export const prerender = false;
