# ADR 005: SDK Split

**Status:** Accepted  
**Date:** 2026-04-24  
**Gate:** SDK split

## Context

`@shippie/sdk` currently contains wrapper controls, analytics, feedback, install helpers, native-adjacent helpers, and BYO backend adapters. Its `db` API delegates to maker-provided backends such as Supabase/Firebase.

Layer 3 local-first APIs are a different product surface. Retrofitting SQLite/OPFS/local AI into `packages/sdk/src/db.ts` would conflate BYO cloud storage with local runtime storage and make the base SDK too heavy.

## Decision

Keep the split:

- `@shippie/sdk` remains the tiny wrapper and BYO-backend SDK.
- `shippie.local.*` is loaded lazily from `/__shippie/local.js`.
- `packages/local-runtime-contract` defines the stable TypeScript surface.
- Implementations live in separate packages such as `packages/local-db`, `packages/local-files`, and `packages/local-ai`.
- The wrapper attaches implementations to `window.shippie.local` only when configured or requested.

The current `shippie.db` namespace remains BYO backend. The local database is `shippie.local.db`.

## Consequences

Static and BYO-backend apps keep a small SDK. Local-first apps pay the WASM/runtime cost only when they opt in. Docs must be explicit that `shippie.db` and `shippie.local.db` are intentionally different.

## Go/No-Go

Go for Layer 3 when:

- The local runtime contract package exists and typechecks.
- The base SDK does not import SQLite, OPFS wrappers, AI model loaders, or CRDT engines.
- `/__shippie/local.js` is the lazy-loading boundary.

No-go if any local runtime implementation is bundled into the base `/__shippie/sdk.js`.
