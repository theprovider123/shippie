// Trust Ledger per-app timeline (5A).
//
// SSR returns the slug only; the client hydrates and reads IDB via
// the trust-ledger host singleton. No server-side ledger access —
// the ledger is on-device and never traverses the network.
//
// Force client-only rendering so the SSR pass doesn't try to touch
// indexedDB.

export const ssr = false;
export const csr = true;
export const prerender = false;
