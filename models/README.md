# Shippie Local AI Models

`models.shippie.app` is the baseline delivery path for local AI. It is an immutable CDN, not a shared storage guarantee.

Browser storage is origin-partitioned, so Shippie apps must work even when each app downloads its own model chunks. Cross-origin reuse through browser HTTP cache or an iframe storage hub is a later measured optimization, not a product promise.

## Manifest

The CDN serves:

- `https://models.shippie.app/v1/manifest.json`
- Immutable model chunks under `https://models.shippie.app/v1/{model-id}/...`

Each manifest entry declares:

- model id, version, runtime, features, quantization, dimensions
- exact total bytes
- chunk paths, byte counts, and SRI hashes

The runtime loader in `packages/local-ai` fetches the manifest, resolves the smallest/recommended model for a requested feature, verifies chunk size/integrity, and stores chunks in the browser Cache API.

## v1 Scope

Ship in this order:

1. Embeddings, ~100MB or less.
2. Text classification and sentiment.
3. Vision labels only after WebGPU/WASM fallback is measured.

Generation and chat are out of scope for the first public local AI surface.
