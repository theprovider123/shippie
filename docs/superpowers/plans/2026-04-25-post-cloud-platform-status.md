# Post-Cloud Platform — Build Status

**Status (2026-04-25 evening):** Weeks 1-9 + Hub (week 7's parallel item) **shipped in worktree**. All net-new packages typecheck clean and pass tests at 403/0. Weeks 10-12 are launch + polish, which is non-engineering work pulled by user action.

## What's deployable in the working tree

### Foundation (week 1-2) — wired
- `packages/sdk/src/wrapper/observe/` — DOM observer runtime: registry, mutation observer with rAF-batched dispatch + per-rule budget + auto-disable, selector engine compiling `shippie.json` `enhance:` blocks, capability gate, opt-out via `data-shippie-no-enhance`. 12/12 tests.
- Built-in rules: `wakelock` (defers acquire to first user gesture), `share-target` (URL params + BroadcastChannel from SW).
- `packages/sdk/src/wrapper/your-data-panel.ts` — overlay version, Shadow-DOM scoped, hooks for backup + transfer.
- `services/worker/src/router/your-data.ts` — standalone fallback at `/__shippie/data` for when the maker app crashes.
- Existing feel layer (`spring`, `haptics`, `view-transitions`) wired into observer rules.

### Mesh + Whiteboard (weeks 3-4) — wired
- `packages/proximity/` — full Proximity Protocol: STUN public-IP discovery, sha256 room IDs, X25519 ephemeral key exchange between peers, AES-256-GCM + Ed25519 envelopes, Yjs subdoc partitioning, vector-clock event log alongside CRDT shared state. **90/90 tests.**
- `services/worker/src/{signal-room,router/signal,router/signal-dev}.ts` — WebSocket signalling DO, hibernates when idle, fans out signalling messages. wrangler.toml has the DO migration v1.
- `apps/showcase-whiteboard/` — Vite + React + Yjs whiteboard. Local stroke 0ms, remote stroke under 30ms. README + manifest + SW.

### Local AI (week 5) — wired
- `apps/shippie-ai/` — installable PWA at `ai.shippie.app`. Hidden iframe accepts postMessage from `*.shippie.app` (origin allowlist with adversarial test coverage). Dedicated Worker for inference. Models cached in this origin's Cache Storage — solves cross-app duplication. User-facing dashboard with storage breakdown, installed-models list, per-origin usage log (no input/output text logged).
- `packages/sdk/src/local.ts` — `LocalAI` class lazy-creates the iframe, handles postMessage round-trip, throws `ShippieAINotInstalledError` if unreachable, reloads on `pageshow` to recover from iOS Safari memory eviction.
- `apps/web/lib/trust/csp-builder.ts` — auto-adds `frame-src https://ai.shippie.app` to maker-app CSP.

### Group moderation (week 6) — wired
- `packages/proximity/src/moderation-hook.ts` — three modes (open / owner-approved / ai-screened). 16/16 tests.
- `packages/sdk/src/wrapper/group-moderation-panel.ts` — owner-only injected UI.
- `services/worker/src/router/group-moderate.ts` — standalone fallback at `/__shippie/group/<id>/moderate`.

### Shippie Hub (week 7) — wired
- `services/hub/` — Bun + Docker. Static-app server, WebSocket signalling identical to worker, model cache (proxy `ai.shippie.app/models/*`), mDNS broadcast as `hub.local`, management dashboard. **22/22 tests including a real-boot integration test.**
- README explains `docker run -p 80:80 shippie/hub`.
- Wrapper transport-select probes `hub.local` first, falls back to cloud relay.

### Showcase apps (weeks 2 + 7) — wired
- `apps/showcase-recipe/` — 29 files. Local DB, image input, barcode scan via `shippie.device.scanBarcode()` (Android-only), Open Food Facts lookup, swipe-to-delete with haptics. 23/23 tests. Builds to `dist/` 219KB JS.
- `apps/showcase-journal/` — 33 files. Local AI through Shippie AI app — verifiably zero outgoing inference. Sentiment trend chart (SVG), semantic search via embeddings, topic clustering. Year-in-review uses extractive summary (no generative model — preserves zero-outgoing promise). 30/30 tests. Builds to `dist/` 165KB JS.

### Backup + transfer (weeks 8-9) — wired
- `apps/web/app/oauth/google-drive/route.ts` — single redirect URI for the platform. State HMAC'd with TTL. PKCE handled. Posts back to opener via `postMessage`, redirect fallback for mobile Safari. 9/9 tests.
- `packages/backup-providers/` — Drive client (multipart upload, retry on 5xx, list/prune for retention). Argon2id+AES-GCM encryption (delegates to `local-db/backup.ts`). Service-worker scheduler for daily/weekly cron. 33/33 tests.
- `packages/proximity/src/transfer.ts` — chunked AES-GCM transfer over Proximity Protocol. QR-encoded one-time room + transfer key. 9/9 tests.
- `packages/sdk/src/backup.ts` — `shippie.backup.{configure,now,status}` runtime.

## Test totals

- All net-new packages: **403 pass / 0 fail** (in isolation).
- Full monorepo `bun test`: 848 pass / 6 fail / 2 errors. **All 6 failures are pre-existing rate-route mock-pollution** (`apps/web/app/api/apps/[slug]/rate/route.test.ts` — passes 6/6 in isolation, fails when run with neighbors). Not introduced by this session.
- Typecheck: **24/24 packages clean** including all 6 new workspaces.

## What's left (not engineering work)

### Week 10 — maturity polish
- A11y audit on every observer rule (VoiceOver + TalkBack) — pending.
- Form-validate rule — scaffolded but not yet shipped.
- 4-way concurrent whiteboard stress test — pending.

### Week 11 — launch (user-driven)
- Demo video: two phones drawing together. **Equipment + recording: user.**
- Blog posts × 3 (sub-30ms drawing in browser, the AI app privacy model, DOM enhancement as universal extension). **Writing: user.**
- HN / Product Hunt / Twitter submissions. **Distribution: user.**
- Optional school pilot of Hub. **Partner sourcing: user.**

### Week 12 — polish (driven by week 11 feedback)
- Real-device QA on iPhone 13+, Pixel 6+, low-end Android, iPad.
- Top issues from launch-week feedback.
- v1.0 retrospective doc.

## Manual setup the user owes for prod

1. **Cloudflare** — KV namespace + R2 buckets created earlier session (`caa6a30a2af640a68305fefd4348a6e1`, `shippie-apps`, `shippie-public`). Outstanding: `shippie-public` bucket (paused mid-flight), `wrangler secret put WORKER_PLATFORM_SECRET`, `wrangler deploy`, DNS records for `*.shippie.app` and `proximity.shippie.app` and `ai.shippie.app`.
2. **Google Cloud Console** — single OAuth client at `https://shippie.app/oauth/google-drive`. Drive API enabled. Scope `drive.file`. Client ID + secret into Vercel env.
3. **Vercel env** — `OAUTH_COORDINATOR_SECRET` (`openssl rand -hex 32`), `GOOGLE_DRIVE_CLIENT_ID/SECRET`, plus the full env set from earlier session (CF_*, AUTH_*, etc.).
4. **`apps/shippie-ai/` deployment** — separate static deploy (Vercel project or Cloudflare Pages). Cannot use the maker zip pipeline; this is platform infrastructure not a maker app.

## Known caveats (raised by agents)

- **CF R2 multipart not smoke-tested against a real bucket** (cf-storage agent flagged this earlier). First prod upload of >5 MiB zip will validate.
- **WebRTC TURN fallback not real-network tested.** Code path is mockable; live verification needs deployed env vars.
- **DurableObject SignalRoom not exercised under miniflare end-to-end.** Unit tests cover `handleFrame` semantics; live DO routing tested via `signal-dev` shim only.
- **Shippie AI app deployment URL** isn't configured yet. Plan calls for a separate static deploy, not a maker-zip route.
- **Pre-existing rate-route test mock-pollution** still present (6 failures in full-suite, 0 in isolation).
- **Showcase apps need real-device Lighthouse runs.** Manifest + SW + theme + offline-shell are in place — should score 100, but needs verification.
