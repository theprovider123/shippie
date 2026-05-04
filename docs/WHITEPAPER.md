# Locally This, Locally That

**How Shippie Puts Apps Back on Your Device**

Draft v1 · 2026-04-29 · Devante Providence

---

## Why this exists

For two decades the trade was simple: you trusted a company with your data and they made the software work. Cloud-tethered apps, App Store gatekeeping, surveillance defaults — these weren't choices. They were the cost of admission.

That trade is no longer required. Phones are powerful. Browsers are fast. WebRTC, OPFS, WebGPU, WebNN, CRDTs, WASM compiled SQLite, on-device transformer inference — every primitive needed for apps to live on the user's device, talk to each other directly, and never phone home unnecessarily, exists right now in the platform you already have. The pieces are scattered across separate stacks, hidden behind expert-only APIs, and rarely composed into something a normal builder can use.

Shippie composes them. Not invents — composes. The interesting work is putting the pieces together so a vibe coder, a founder, a teacher, or a doctor can deploy a web app and have it install on their users' phones, run on those devices, and talk to other nearby devices, without renting someone's cloud, without surrendering data, without asking a corporate gatekeeper for permission.

Locally this. Locally that. The post-cloud platform.

---

## The thesis in one paragraph

> Deploy any web app. Shippie wraps it into an installable, offline-capable, tactile, proof-emitting experience. The app keeps its URL and custom-domain ownership, while the installed Shippie container becomes the richer home for apps, shared models, local data, cross-app intents, and the marketplace. Databases, files, and AI inference run on the user's device. Nearby users connect peer-to-peer. Capability Proof Badges are awarded only when the runtime observes the matching event from real devices. The whole stack is open source.

Three concepts, externally: **Wrap. Run. Connect.** Nine engineering components, internally: Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub. One governing product principle: **container-first experience, URL-first ownership, package-first portability.**

---

## The stack — a tour

### Wrap (Shell · Boost · Sense)

A SvelteKit app on Cloudflare Workers serves `*.shippie.app` for every maker app. A subdomain router in `apps/platform/src/hooks.server.ts` intercepts every HTML response and injects:

- A PWA **manifest** with sharp square icons (deliberate visual identity — Shippie apps are distinct on a home screen).
- A **service worker** with offline fallback, background-sync hooks, and an opt-in update toast.
- A **wrapper script** that auto-applies haptics on buttons, spring physics on transitions, gestures on lists, sensory **textures** that compose haptic + sound + visual into single confirm/complete/error/install moments, and **patina** that warms the app over months of use.
- The **Your Data panel** — a universal trust surface that loads even if the maker's app crashes. Storage breakdown, encrypted export, restore, device transfer, delete-everything-on-this-device. Standalone fallback at `/__shippie/data`.

Static analysis runs at deploy time. `@shippie/analyse` parses the maker's HTML/CSS/JS, builds an **AppProfile**, and the wrapper compiles a per-app set of enhancement rules. The maker writes a normal web app and inherits everything in the previous paragraph.

The container adds a second layer: one installed Shippie PWA that can open many Shippie apps inside a controlled runtime. A standalone URL still works and remains the maker's shareable surface. The container is the place where storage, AI models, intents, Your Data, package receipts, app switching, and the marketplace become a coherent personal app universe.

The composition under Wrap: vite-plugin-pwa (manifest + Workbox SW), Web Animations API + a small spring-physics primitive, the Web Vibration API, the Pointer Events API, Web Audio for sound textures, CSS custom properties for patina state, MutationObserver for the auto-enhance pass, and a container bridge that gives iframe apps a strict capability surface.

### Run (Core · AI · Vault)

The user's device is the computer.

- **Core**: `@shippie/local-db` is wa-sqlite compiled to WASM, persisted in OPFS. Drizzle-style API on top so makers write `db.recipes.where(...).all()`, not raw SQL. `@shippie/local-files` wraps OPFS with a path-based abstraction. The local runtime contract is in `@shippie/local-runtime-contract` — a tiny package that lets local-first apps share a vocabulary.
- **AI**: the container owns the model cache and loads a versioned Transformers runtime artifact through `apps/platform/src/lib/container/ai-worker.ts`. Models are downloaded once per device and shared by every app opened inside Shippie. WebNN routes to the Neural Processing Unit when available, WebGPU when not, WASM as the floor. The maker calls `shippie.ai.classify(text, labels)` or the bridge equivalent and never sees the worker. Every response carries a `source` field so the dashboard can show which backend ran the inference. **No prompt content is ever logged. The privacy invariant is load-bearing.**
- **Vault**: `@shippie/backup-providers` adapts to Google Drive (others to follow) using Bring-Your-Own-Cloud. Encryption is AES-256-GCM with Argon2id key derivation from a user passphrase. The OAuth coordinator at `https://shippie.app/oauth/[provider]` mints signed envelopes — the platform holds the OAuth client secret, the maker app holds nothing. Tokens are postMessaged back to the maker's signed origin (never URL-derived) and stored in OPFS, never localStorage, never on a Shippie server. Device transfer (`@shippie/proximity/transfer`) uses a one-time room with a transfer key encoded in a QR — older device → newer device, encrypted in transit, no cloud involved.

The composition under Run: wa-sqlite + OPFS, Origin Private File System Access API, Transformers.js / ONNX Runtime Web / WebNN, Web Crypto API, Workbox precaching, the Cache Storage API, and a per-app permission namespace inside one local container.

### Connect (Pulse · Spark · Hub)

Devices on the same WiFi or in the same room talk peer-to-peer.

- **Pulse**: `@shippie/proximity` is the client side of the Proximity Protocol. WebRTC peer-to-peer with a Cloudflare Durable Object signalling room (`SignalRoom` at `/__shippie/signal/[roomId]`). Yjs CRDT for shared state. A vector-clock event log for chat-shaped data. End-to-end encryption with X25519 ephemeral key exchange + AES-256-GCM. Group moderation with local AI prefilter. The whole package ships at 90+ tests.
- **Spark** (roadmapped): phone-to-phone propagation via BLE beacon, hotspot share, chain propagation. The Glastonbury / disaster-zone narrative. Real but unproven; deferred until the core wedge demos land.
- **Hub** (`services/hub`): a Bun + Docker container designed for a Raspberry Pi at a venue. mDNS-advertised WebSocket signalling so the venue keeps working when public internet doesn't. App + model cache so phones download from the Hub instead of the internet on first install. Optional data bridge to pull external feeds (sports scores, news) into the local mesh from a single internet-connected node.

The composition under Connect: WebRTC Data Channels, RTCPeerConnection, Yjs, the Web Crypto API, Bonjour/mDNS via Avahi, WebSocket fan-out via Cloudflare Durable Objects.

### Cross-cutting: Proof

Every Shippie claim must be earned by runtime evidence. Capability Proof Badges on a marketplace listing are awarded only after the wrapper has observed the matching event from at least N distinct device hashes in real use.

- The wrapper emits typed events to `POST /api/v1/proof`: `installed`, `service_worker_active`, `offline_loaded`, `local_db_used`, `data_exported`, `ai_ran_local`, `model_cached`, `room_joined`, `peer_synced`, `backup_written`, `backup_restored`, `device_transferred`, `permissions_scanned`, `external_domains_shown`, `permission_diff_surfaced`. The taxonomy is the security boundary — anything outside it is rejected, not silently dropped.
- A daily cron derives badges from per-event distinct-device counts within each rule's lookback window. Badges revoke on regression.
- The maker dashboard's Proof tab shows earned + pending badges with per-event progress against threshold.
- The public listing page surfaces proven badges with a stronger visual treatment than build-time-detected capabilities.

This is the difference between "this app claims to support X" and "we have observed this app doing X on real devices, three independent times, in the last thirty days." The badge is the proof, not the promise.

---

## Composition over invention

The interesting work isn't inventing primitives — the platform invented them already. The interesting work is composing.

| Capability | What Shippie composes |
|---|---|
| Database in the browser | wa-sqlite (LinkedIn's WASM port of SQLite) + OPFS + Drizzle-style typed API |
| Local AI | Transformers.js (Xenova) + WebNN/WebGPU/WASM backend selection + container worker + Cache Storage |
| App ownership | standalone URLs + custom domains + signed `.shippie` package metadata + container receipts |
| App isolation | sandboxed iframes + bridge capability grants + deploy-time trust scanning + package permissions |
| Mesh networking | WebRTC + Yjs CRDTs + X25519 ephemeral keys + AES-256-GCM + Cloudflare Durable Objects for signalling |
| BYO-Cloud backup | Google Drive REST API + AES-GCM + Argon2id + OAuth 2.0 PKCE + Cloudflare Workers as the coordinator |
| Service worker injection | vite-plugin-pwa + Workbox + a thin static analyser that picks the right caching strategy |
| Proof event spine | Cloudflare D1 + Drizzle + a daily cron + a typed event taxonomy |
| Subdomain wrapper | SvelteKit's `hooks.server.ts` + an HTML rewriter that injects the wrapper script |

None of these are Shippie's invention. The composition is. Each individual component is documented in its package; this whitepaper is the meta-document that says how they fit together.

The license positions reflect this: `apps/platform`, `apps/shippie-ai`, `services/hub`, `packages/pwa-injector` are AGPL-3.0 — fork and self-host freely; network-accessible modifications must publish under the same license. SDK, CLI, MCP server, shared types, templates are MIT — link into your apps without constraint. The platform is the part that's worth federating; the SDK is the part that should spread.

---

## Where help is wanted

The tour above describes what's built. The frontier is what isn't. If you're reading this and wondering where to dig in:

- **Spark**: BLE beacon discovery + hotspot share + chain propagation for the no-internet-at-all scenario. The wire protocol is sketched; the implementation is open. Festival use cases drive this.
- **Receiver leg of the device transfer flow**: the sender side ships in the Your Data panel; the receiver UI (scan QR → re-import into local-db/local-files) is roadmapped to v1.5.
- **Crowd consensus**: gossip aggregation for fan-reported scores at venues with no internet. Designed in conversation; no code yet.
- **Cross-app knowledge graph**: the container has the bridge and intent direction; durable, user-controlled recall across many apps is the next careful step.
- **MCP deploy from chat**: the MCP server and shared core are wired; the magical "build, deploy, read logs, iterate" loop keeps expanding.
- **Native graduation**: app graduation reports for PWA / iOS / Android readiness, plus a native wrapper export. Roadmapped.

If any of these are problems you're already solving — please publish what you're doing. Composition over invention works because someone else already did the hard part. The next wave of this depends on more people doing that.

---

## On openness

This document exists for the same reason Vivian Balakrishnan published the architecture of his second-brain agent on GitHub: secrecy is not the edge. Composition, clarity, and momentum are the edge. Shippie's stack stays open because:

- An open platform invites scrutiny. The Trust Surface only works if the privacy claims are inspectable.
- Open source forks give users an exit. If Shippie ever fails to honour its commitments, the platform itself can be self-hosted on someone else's account in an afternoon.
- Open source attracts contributors. We need them — see the previous section.
- An open platform federates. Multiple Shippie deployments interop because the protocol is documented, not because they share a database.

The hippie ethos is operational, not aesthetic. *Your data, your device, your control.* If we hold those three things sacred, every architectural decision falls into place.

---

## Appendix: where to read the code

- Living truth file: [`docs/CURRENT_STATE.md`](./CURRENT_STATE.md) — the one source of architectural truth.
- Architecture: [`docs/architecture.md`](./architecture.md) (with [`architecture.svg`](./architecture.svg)).
- Self-hosting: [`docs/self-hosting.md`](./self-hosting.md).
- Production deploy runbook: [`docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`](./superpowers/plans/2026-04-26-prod-deploy-runbook.md).
- Active build roadmap: [`docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md`](./superpowers/plans/2026-04-25-intelligence-layer-roadmap.md).
- Outstanding actions: [`docs/OUTSTANDING_ACTIONS.md`](./OUTSTANDING_ACTIONS.md).

---

*This is draft v1. The post-launch v2 will incorporate real-device demo footage, latency measurements from production traffic, and the first round of community contributions.*
