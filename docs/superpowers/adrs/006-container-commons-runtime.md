# ADR 006: Container Commons Runtime

**Status:** Proposed  
**Date:** 2026-04-27  
**Gate:** Container app / open app commons

## Context

The current Shippie model supports standalone app URLs such as `slug.shippie.app` and custom domains. That keeps distribution simple, but it leaves users with a browser-tab feeling: apps are visited, not owned. Installing every individual app as a PWA creates the opposite problem: app-icon clutter, duplicated model caches, per-origin storage silos, and a fragmented "Your Data" story.

The product vision now points at a larger shape:

> One open-source app where people discover, run, own, remix, move, and trust local-first apps.

This should not become a closed super-app. Shippie is open source and should behave more like a public app commons: apps can be inspected, versioned, forked, packaged, hosted, mirrored, installed into a Hub, and served from custom domains. The container is the best user experience, not the only place an app can exist.

## Decision

Adopt three governing principles:

1. **Container-first experience.** The installed Shippie PWA is the preferred home for users. It contains Home, Discover, Create, and Your Data. Apps open inside the container for shared AI, shared local storage management, unified backup/transfer, trusted updates, and instant switching.
2. **URL-first ownership.** Every app still has its own URL and may have custom domains. Maker identity, source links, changelog, license, roadmap, and custom branding remain first-class. The maker owns the app identity; Shippie provides the runtime.
3. **Package-first portability.** Every app version can be exported as a portable `.shippie` package. The same package can run standalone, inside the container, on a Hub, or later inside a federated/self-hosted Shippie instance.

The container runtime loads third-party apps in sandboxed iframes by default. Apps do not receive raw access to shared origin storage, shared SQLite, OPFS, AI models, or other app namespaces. Apps receive a capability-based SDK bridge. Every bridge call is scoped by app identity, permission grants, and namespace.

Same-document rendering is allowed only later for first-party or deeply trusted apps. It is a performance optimization, not the base security model.

## Runtime modes

Every Shippie app should target the same SDK surface in all modes:

- **Standalone mode:** app runs at `slug.shippie.app` or a custom domain with the wrapper SDK.
- **Container mode:** app runs inside the Shippie container through a sandboxed iframe and capability bridge.
- **Hub mode:** app package runs from `hub.local` with the same runtime contract.

Container mode must be additive. A maker should not need to maintain a container-only fork.

## Container eligibility

Container distribution is earned progressively:

```ts
type ContainerEligibility =
  | 'first_party'
  | 'curated'
  | 'compatible'
  | 'standalone_only'
  | 'blocked';
```

Initial policy:

- First-party showcase apps are allowed.
- Manually curated apps are allowed.
- Unknown apps are standalone-only until compatibility checks mature.
- Unsafe apps are blocked or standalone-only depending severity.

Later policy:

- Deploy Truth, trust reports, permissions, runtime proof, and compatibility smoke tests determine automatic eligibility.

## Capability bridge

The container owns privileged resources:

- local DB / OPFS / files
- AI model cache and inference workers
- backup / export / transfer
- analytics / feedback / Whispers
- app lifecycle and app switching
- permissions and app receipts

Apps receive scoped capabilities:

```json
{
  "permissions": {
    "localDb": true,
    "localFiles": true,
    "localAi": ["classify", "summarize"],
    "network": ["world.openfoodfacts.org"],
    "crossAppIntents": ["shopping-list.write"]
  }
}
```

The bridge enforces:

- app identity
- table/file namespace
- allowed domains
- permission grants
- rate limits
- trust posture changes across updates

## Consequences

Positive:

- One install can run unlimited Shippie apps.
- AI models are cached once per user, not once per app origin.
- The Your Data panel becomes coherent across all apps.
- Apps can be forked, remixed, packaged, moved, mirrored, and self-hosted.
- Custom domains and standalone URLs remain intact.
- Hub and federation work can consume the same package/runtime contract.

Tradeoffs:

- The container becomes a trusted runtime and must be held to a higher security bar.
- The SDK bridge must be treated as a real security boundary, not just convenience RPC.
- Some apps will need compatibility fixes to behave well in iframes.
- Browser URL handler support is uneven; "Open in Shippie" is progressive enhancement.
- Maker ownership must be surfaced deliberately so Shippie does not absorb app identity.

## Go/No-Go

Go for container implementation when:

- Real `/__shippie/sdk.js` runtime is shipping, not just the dev stub.
- A `.shippie` package spec exists.
- Standalone and container modes share the same SDK contract.
- The capability bridge has permission enforcement from day one.
- Container MVP starts with first-party or curated apps only.

No-go if:

- Third-party apps receive raw shared-origin access to Shippie's DB/files/models.
- The container becomes mandatory for app ownership.
- Custom domains or standalone URLs are treated as legacy.
- `.shippie` packages cannot be installed into a Hub later.
