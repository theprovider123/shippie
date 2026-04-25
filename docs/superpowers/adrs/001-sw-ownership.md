# ADR 001: Service Worker Ownership

**Status:** Accepted  
**Date:** 2026-04-24  
**Gate:** 1 - Service-worker ownership

## Context

Shippie needs a root-scoped service worker to deliver the wrapper promise: installability, offline bootstrap, update handling, asset caching, background delivery, and later local runtime coordination. The current runtime serves `/__shippie/sw.js` with `Service-Worker-Allowed: /`, and the injector registers it at scope `/`.

That is the right shape for Shippie-hosted apps, but it collides with maker service workers that also try to own `/`. A browser registration is keyed by scope. If a maker bundle ships and registers `/sw.js` at root, Shippie and the maker are trying to control the same navigation and fetch surface.

## Decision

For Shippie-hosted apps on `{slug}.shippie.app`, Shippie owns the root service worker.

The default compatibility mode is **A1 - Disable**:

- Preflight blocks root-level maker service worker files such as `sw.js`, `service-worker.js`, `firebase-messaging-sw.js`, `ngsw-worker.js`, and `workbox-*.js`.
- The blocker explains that Shippie owns root scope and that maker worker support requires an explicit compatibility mode.
- Shippie continues to own `__shippie/*` routes and root-scope runtime registration.

Two future modes remain open:

- **A2 - Import:** maker worker code is imported into the Shippie worker behind a controlled fetch/message adapter.
- **A3 - Limited wrapper mode:** URL-wrap or advanced apps opt out of Shippie root SW ownership and accept best-effort wrapper behavior without full offline/local-runtime guarantees.

## Consequences

This protects the local-first and installability promises. It also means some existing PWA bundles will fail preflight until A2 or A3 exists. That tradeoff is intentional: silently allowing a competing service worker would create worse user-visible failures later.

## Go/No-Go

Go for Pillar A when:

- The ADR exists.
- A preflight rule detects root service-worker conflicts.
- The default deploy path blocks conflicting root worker files.

No-go for Layer 3 if Shippie cannot own a root service worker on hosted apps.
