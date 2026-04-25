# ADR 002: Local AI Model Caching

**Status:** Accepted  
**Date:** 2026-04-24  
**Gate:** 2 - Model caching strategy

## Context

The vision originally described local AI models as "downloaded once and shared across all Shippie apps." Browser storage primitives do not guarantee that across `*.shippie.app` subdomains. Service workers, Cache API, IndexedDB, and OPFS are origin-scoped. Modern browser HTTP caches are also partitioned, so a shared CDN URL can help but cannot be treated as a product guarantee.

The model strategy must preserve the local-AI promise without overclaiming bandwidth reuse.

## Decision

Shippie ships model delivery in three tiers:

1. **Baseline:** `models.shippie.app` immutable CDN.
   - Models are chunked.
   - Every chunk has an SRI hash and long `Cache-Control`.
   - Each app records a per-origin `local-manifest.json` with downloaded chunks and model versions.
   - Worst case is one download per app. Best case is opportunistic browser cache reuse.
2. **Measured enhancement:** root-origin model hub.
   - `https://shippie.app/model-loader` runs in a hidden iframe.
   - It owns root-origin Cache API storage and can stream chunks to app origins over `postMessage`.
   - It is a spike until measured on iOS Safari, Android Chrome, and desktop Chromium/Firefox.
3. **Pitch upgrade only if proven.**
   - The shared-cache claim becomes marketing only if second-app install saves more than 60% bytes on real devices.

Generation and summarization are deferred. Pillar D starts with embeddings, classification, and sentiment.

## Consequences

Local AI remains viable even if shared cache fails. The product pitch becomes "local AI with explicit download UX" rather than "free shared models" until Gate 2 measurements prove otherwise.

## Go/No-Go

Go for Pillar D when:

- `models.shippie.app` chunk manifest format is specified.
- The iframe hub spike has a measured report.
- WebGPU and WASM fallback coverage are recorded per target browser.

No-go for public "download once across Shippie" language until the 60% second-app byte-savings bar is met.
