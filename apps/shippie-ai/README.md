# @shippie/shippie-ai

Installable PWA at **`ai.shippie.app`** holding the shared on-device micro-models. Serves inference to other Shippie apps via a cross-origin iframe + `postMessage` protocol.

- `index.html`  — user-facing PWA dashboard (model install, usage log)
- `inference.html` — hidden cross-origin iframe target embedded by other `*.shippie.app` apps. Validates origin, dispatches to a dedicated Worker, posts result back.
- `src/sw.ts` — service worker, caches model files in Cache Storage so a downloaded model serves every Shippie app on the device.

The security boundary is the `^https://[a-z0-9-]+\.shippie\.app$` allowlist enforced inside `src/inference/router.ts`. Adversarial inputs (e.g. `https://shippie.app.evil.com`, `http://recipe.shippie.app`) are dropped silently.

## Local development

```bash
bun install
bun run dev          # vite at http://localhost:5180
```

Run inside the Cloudflare Worker emulator (matches production):

```bash
bun run build
bun run wrangler:dev # wrangler dev at http://127.0.0.1:8787
```

## Production deploy (Cloudflare Workers Static Assets)

This app is a **separate** Cloudflare Worker — distinct from `apps/platform`. It owns the route `ai.shippie.app/*`. The platform Worker keeps `*.shippie.app/*`; Cloudflare's longest-match routing sends `ai.*` traffic here automatically.

### One-time DNS setup

`ai.shippie.app` must resolve to Cloudflare's edge so the route in `wrangler.toml` can claim traffic.

1. Open the Cloudflare dashboard for the `shippie.app` zone.
2. Add a **CNAME** record:
   - Name: `ai`
   - Target: any proxied hostname (e.g. `shippie-ai.<account>.workers.dev` after first deploy, or `shippie.app`)
   - **Proxy status: Proxied (orange cloud).** Required — the route attaches via the Cloudflare proxy.

If you prefer not to add a CNAME, you can set up a [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) on the Worker after the first deploy — that auto-creates the proxied DNS record for you.

### First deploy

```bash
cd apps/shippie-ai
bun run deploy        # runs `vite build` then `wrangler deploy`
```

Or step by step:

```bash
bun run build
bunx wrangler deploy
```

After the first deploy, `wrangler` will print the workers.dev hostname (`shippie-ai.<account>.workers.dev`). Keep it noted — you can use it as the CNAME target above.

### Embedder URL

Other Shippie apps must iframe the **canonical clean URL**:

```html
<iframe src="https://ai.shippie.app/inference" sandbox="allow-scripts" hidden></iframe>
```

Workers Static Assets canonicalises `/inference.html` → `/inference` with a 307. Always use `/inference` directly to skip the redirect.

## Acceptance checklist

- [x] `bun run build` produces `dist/` with `index.html`, `inference.html`, `sw.js`, `manifest.webmanifest`, and hashed assets (~256 KB total).
- [x] `wrangler.toml` declares route `ai.shippie.app/*` and `[assets] directory = "./dist"` with `not_found_handling = "404-page"` (NOT spa — two distinct entry HTMLs).
- [x] `wrangler dev` serves `/`, `/inference`, `/sw.js`, `/manifest.webmanifest`; unknown paths return 404.
- [x] Origin allowlist regex in `src/inference/router.ts` is `^https://[a-z0-9-]+\.shippie\.app$`.

## Architecture notes

- `not_found_handling = "404-page"` is intentional. Two top-level entries (dashboard + inference iframe) — SPA fallback would silently route unknown paths to `index.html` and corrupt the security boundary by serving a non-iframe page where embedders expect inference.
- `@huggingface/transformers` is loaded dynamically at runtime from the model CDN (see `src/inference/models/transformers-host.ts`). The specifier is built indirectly so neither Vite nor Rollup attempt to resolve it at build time.
- `wrangler.toml` does **not** set an `[assets] binding` — this is an assets-only Worker (no `main` script). Wrangler 3.x rejects a binding without `main`.
- Models are NOT bundled into `dist/`. They stream from the Hugging Face CDN on first use and the SW caches them in `shippie-ai-models` (90-day TTL, 200-entry cap).
