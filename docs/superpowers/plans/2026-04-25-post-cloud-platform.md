# Shippie Post-Cloud Platform — 12-Week Plan (v2)

**v2 (2026-04-25 evening) — supersedes v1.** Material changes:
- Shippie AI app (cross-origin iframe + postMessage) is the model-sharing architecture, scheduled week 5. **Edge fallback for embed/classify rejected** — the input text leaving the device breaks the privacy promise even if the output is a vector.
- Latency framed honestly: "local stroke 0ms, remote stroke under 30ms, both feel instant" — no sub-5ms claim.
- Feel layer (spring + haptics, already in `packages/sdk/src/wrapper/`) wired into Recipe Saver from week 2 as a first-class priority.
- Hub built week 7 but tested on internal network only; school pilot deferred to week 11–12 (not a blocking dependency).
- Launch plan added in weeks 10–11 (demo video, HN, Product Hunt, blog posts).
- DOM observer lives **inside** `packages/sdk/src/wrapper/observe/` — no new top-level package.
- Selector-based `enhance:` config in `shippie.json` is the rule API. Imperative TypeScript modules dropped.
- File-input-barcode rule dropped. Replaced with explicit `shippie.device.scanBarcode()` SDK method.
- Your Data panel reachable at `/__shippie/data` standalone — works even if the maker's app crashes.
- X25519 ephemeral key exchange between peers; join code is rendezvous-only, not key material.
- OAuth coordinator at `shippie.app/oauth/<provider>` (single redirect URI, not wildcard).

---

## Headline pitch (locked)

> **Shippie**
> The first wrapper that enhances your app without changing your code.
> Declare what you want — the wrapper makes it happen.
> Your HTML stays standard. Your app gets superpowers.

**Three orthogonal showcase apps prove the platform:** Recipe Saver (DOM enhancement + trust + feel), Collaborative Whiteboard (mesh + perceived-instant latency), Personal Journal with AI (privacy + local intelligence via Shippie AI app). Quiz pulled to weeks 13–16 if education demand materialises.

**Positioning rules:**
- No "Best on Android" badging. Everything works on Safari at floor capability. Android extras render where supported, are silent where not.
- DOM observer + feel layer are the moat. Both built in week 1–2.
- Three apps per twelve weeks. Realistic for one engineer.
- "Local stroke 0ms, remote stroke under 30ms — both feel instant" — never claim sub-5ms end-to-end.

---

## Existing foundation (don't rebuild)

| Package | What's there |
|---|---|
| `packages/sdk/` | `shippie.*` SDK: auth, db, files, feedback, analytics, install, meta, native, local. BYO-backend adapters in `backends/`. |
| `packages/sdk/src/wrapper/` | gestures, **haptics**, install-prompt + runtime, **spring**, **view-transitions**, handoff, theme-color, update-toast, web-vitals, qr, push, iab-bounce, referral, ui, capability detect |
| `packages/local-ai/` | capabilities detect, model loader, transformers.js adapter, manifest |
| `packages/local-db/` | wa-sqlite + OPFS, schema, memory, backup primitives, benchmark |
| `packages/local-files/`, `packages/local-runtime/`, `packages/local-runtime-contract/` | OPFS files, runtime worker, telemetry |
| `packages/pwa-injector/` | generate-manifest, generate-sw, inject-html |
| `packages/session-crypto/` | session crypto helpers |
| `packages/cf-storage/` | CfKv + CfR2 (added 2026-04-24) |
| `services/worker/` | runtime: HTML rewriter, proxy, manifest synth, SDK injection |

**Bold = feel layer primitives that already exist.** Wiring, not building.

**Gaps the plan fills:**
1. DOM observer + selector-based enhancement registry (the moat) — lives in `packages/sdk/src/wrapper/observe/`.
2. Proximity Protocol (signalling reuses `services/worker/`, no separate service).
3. Local Groups SDK + Yjs CRDT shared state + eventLog primitive.
4. **Shippie AI app** — cross-origin iframe at `ai.shippie.app` holding shared models + postMessage inference API.
5. AI moderation micro-model wired into group send path.
6. Cloud backup providers (Drive primary; Dropbox + WebDAV deferred).
7. Your Data panel — single injected component + standalone fallback route at `/__shippie/data`.
8. Three showcase apps in `apps/showcase-{recipe,whiteboard,journal}/`.

---

## Architecture additions

### Inside the existing SDK package (no new top-level workspace)

```
packages/sdk/src/wrapper/
  observe/                       NEW — DOM observation runtime
    index.ts                     observe(), unobserve(), registerRule()
    registry.ts                  rule registry, dispatch
    mutation-observer.ts         MutationObserver + rAF batching + per-rule budget
    selector-engine.ts           compiles shippie.json `enhance:` selectors → observer targets
    capability-gate.ts           skip rules when device API missing
    rules/
      wakelock.ts                <video autoplay>, <canvas data-shippie-canvas> → wake lock on first user gesture
      share-target.ts            honors shippie.json share_target
      list-swipe.ts              <ul data-shippie-list> → swipe-to-reveal + haptics (uses existing wrapper/haptics)
      text-autocomplete.ts       <input type="text" autocomplete="shippie"> → suggest from local DB
      form-validate.ts           <form data-shippie-validate> → schema validation from shippie.json
    *.test.ts

  your-data-panel.ts             NEW — universal trust panel (in-app overlay)
  observe-init.ts                NEW — bootstrap that hooks into wrapper init

services/worker/src/
  router/your-data.ts            NEW — serves /__shippie/data standalone fallback
  router/signal.ts               NEW — WebSocket signalling at /__shippie/signal/<roomId>
  rewriter.ts                    extend HTMLRewriter to inject observe-init.ts alongside SDK
```

### New packages (only where workspace boundary genuinely helps)

```
packages/proximity/              Group SDK + WebRTC client
  src/
    index.ts                     shippie.local.group public API
    client.ts                    WebSocket-to-worker-signal client
    room-id.ts                   sha256(public_ip + app_slug + group_code)
    stun.ts                      public IP discovery via RTCPeerConnection ICE
    webrtc.ts                    P2P channel setup, retry, datachannel mux
    handshake.ts                 X25519 ephemeral key exchange between peers
    encryption.ts                AES-GCM message envelope, Ed25519 signatures
    group.ts                     Group lifecycle: create, join, broadcast, send, on
    crdt.ts                      Yjs subdoc partitioning for sharedState()
    eventlog.ts                  append-only log with vector clocks for chat/quiz/feed
    moderation-hook.ts           pre-broadcast moderation pass via Shippie AI app

packages/backup-providers/       Drive primary (week 8); Dropbox + WebDAV deferred
  src/
    google-drive.ts              OAuth via shippie.app/oauth/google-drive coordinator
    scheduler.ts                 SW-driven daily backup
    *.test.ts
```

### The Shippie AI app

```
apps/shippie-ai/                 NEW — installable PWA, holds all micro-models
  src/
    index.html                   user-facing dashboard (storage, models, usage)
    inference.html               hidden-iframe target — accepts postMessage, runs inference
    public/
      manifest.webmanifest       installable PWA
    workers/
      model-cache.ts             service worker — caches model files
    inference/
      router.ts                  postMessage protocol, origin allowlist (*.shippie.app)
      models/
        classify.ts              DistilBERT-base-mnli quantized, ~250MB
        embed.ts                 all-MiniLM-L6-v2, ~90MB
        sentiment.ts             distilbert-sst2 quantized, ~70MB
        moderate.ts              detoxify-mini, ~100MB
        vision.ts                MobileNet-V3 quantized, ~200MB
        registry.ts              lazy-load on first use; user controls install
    dashboard/
      app.tsx                    storage breakdown, installed models, usage log
```

Hosts at `ai.shippie.app`. **Models live ONLY here**, cached in this origin's OPFS + Cache Storage. Other Shippie apps call inference via hidden iframe + postMessage. The user installs Shippie AI as a PWA the first time any AI-using app needs it; from then on, every Shippie app gets free, fast, fully-local inference.

### Showcase apps

```
apps/showcase-recipe/            Recipe Saver — DOM enhancement + trust + feel showcase
apps/showcase-whiteboard/        Collaborative Whiteboard — mesh + perceived-instant latency
apps/showcase-journal/           Personal Journal with AI — privacy + local intelligence
```

Each is a Vite app. Deployed via existing `/api/deploy` zip pipeline. Lives at `recipe.shippie.app`, `whiteboard.shippie.app`, `journal.shippie.app`.

---

## The Shippie AI app — detailed architecture

This is the most pioneering piece in the plan. Calling it out separately.

### The flow

```
recipe.shippie.app (maker app)              ai.shippie.app (hidden iframe)
        │                                              │
        │  shippie.local.ai.classify(text, labels)     │
        │   ↓                                          │
        │  postMessage({                               │
        │    requestId, task: 'classify',              │
        │    text, labels                              │
        │  })  ──────────────────────────────────────► │
        │                                              │
        │                                              │ ── service worker → cached model
        │                                              │ ── runs inference in dedicated worker
        │                                              │
        │ ◄───────  postMessage({                      │
        │             requestId, result, confidence    │
        │           })                                 │
        │                                              │
              No network. Same device. Two tabs.
```

### Why this is right

| Concern | Duplication (A) | Edge (B) | Shippie AI app (C) |
|---|---|---|---|
| Storage per app | 500MB-1GB | ~0 | ~0 (shared) |
| Total storage | Multiplies | ~0 | Fixed ~400-500MB |
| Privacy | Full local | **Broken — input text leaves device** | Full local |
| Offline | Works | Breaks | Works |
| Latency | <200ms | 50-200ms | <200ms (postMessage + inference) |
| Cost to Shippie | $0 | Per-inference | $0 |
| iOS feasibility | Marginal | Good | Good (one origin's quota) |
| User control | Implicit | Implicit | **Visible AI dashboard** |

### Implementation outline

**Wrapper side** — the SDK lazy-creates the iframe on first AI call:

```ts
// packages/sdk/src/local.ts (extension)
class LocalAI {
  private iframe: HTMLIFrameElement | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private ready: Promise<void> | null = null;

  private ensureIframe(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      this.iframe = document.createElement('iframe');
      this.iframe.src = 'https://ai.shippie.app/inference.html';
      this.iframe.style.display = 'none';
      this.iframe.setAttribute('aria-hidden', 'true');
      this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      window.addEventListener('message', this.onMessage);
      this.iframe.addEventListener('error', () => reject(new Error('shippie-ai-not-installed')));
      const readyHandler = (e: MessageEvent) => {
        if (e.origin === 'https://ai.shippie.app' && e.data?.type === 'ready') {
          window.removeEventListener('message', readyHandler);
          resolve();
        }
      };
      window.addEventListener('message', readyHandler);
      document.body.appendChild(this.iframe);
    });
    return this.ready;
  }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== 'https://ai.shippie.app') return;
    const { requestId, result, error } = e.data ?? {};
    const p = this.pending.get(requestId);
    if (!p) return;
    error ? p.reject(new Error(error)) : p.resolve(result);
    this.pending.delete(requestId);
  };

  async infer<T>(task: string, payload: object): Promise<T> {
    await this.ensureIframe();
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      this.iframe!.contentWindow!.postMessage(
        { requestId, task, ...payload },
        'https://ai.shippie.app',
      );
    });
  }

  classify(text: string, labels: string[]) { return this.infer('classify', { text, labels }); }
  embed(text: string) { return this.infer<number[]>('embed', { text }); }
  sentiment(text: string) { return this.infer('sentiment', { text }); }
  moderate(text: string) { return this.infer('moderate', { text }); }
}
```

**AI app side** — the hidden iframe accepts requests with origin allowlist:

```ts
// apps/shippie-ai/src/inference.html / inference/router.ts
const ALLOWED = /^https:\/\/[a-z0-9-]+\.shippie\.app$/;

window.addEventListener('message', async (e) => {
  if (!ALLOWED.test(e.origin)) return;
  const { requestId, task, ...payload } = e.data ?? {};
  try {
    const model = await loadModel(task);
    const result = await model.run(payload);
    e.source!.postMessage({ requestId, result }, { targetOrigin: e.origin });
  } catch (err) {
    e.source!.postMessage(
      { requestId, error: (err as Error).message },
      { targetOrigin: e.origin },
    );
  }
});

parent.postMessage({ type: 'ready' }, '*');
```

### Honest caveats

- **iOS Safari memory pressure can kill hidden iframes.** Mitigation: run inference inside a dedicated `Worker` inside the iframe — workers survive memory pressure better than main-thread state. Reload iframe on `pageshow` if it was killed.
- **First-time UX requires the AI app to be loadable.** When user opens Recipe Saver and hits a model, the wrapper either loads `ai.shippie.app/inference.html` (if cached or cacheable now) or shows a one-time "Install Shippie AI to enable on-device intelligence (one-time, ~400MB total, fully private)" prompt with an Install link.
- **AI app and host app must be served by the same control plane** (`*.shippie.app`) for the origin allowlist to be meaningful. If a host installs at a custom domain (`chiwit.com`), the wrapper either: (a) refuses AI inference under that domain, or (b) routes through `chiwit.shippie.app` which embeds the iframe. (a) is simpler for v1.
- **CSP on the maker's app must allow the iframe.** `frame-src https://ai.shippie.app`. The wrapper rewrites the maker's CSP via `services/worker/src/rewriter.ts` to add this directive automatically.
- **Models served from `ai.shippie.app/models/*`, not a separate `models.shippie.app`.** Same-origin within the AI app simplifies CORS and cache scope. CDN-cached at the edge for fast first-download.

### The AI app dashboard (user-facing)

```
┌─────────────────────────────────────────┐
│  🚀 Shippie AI Engine                   │
│                                          │
│  Your on-device intelligence.            │
│  All processing stays on this phone.     │
│                                          │
│  ── Models ──                            │
│  ✓ Classification         250MB          │
│  ✓ Embeddings              90MB          │
│  ✓ Sentiment               70MB          │
│  ✓ Moderation             100MB          │
│  ○ Image labelling        200MB [Install]│
│                                          │
│  Total: 510MB                            │
│                                          │
│  ── Usage This Week ──                   │
│  Recipe Saver: 47 inferences             │
│  Journal: 23 inferences                  │
│  Whiteboard: 0                           │
│                                          │
│  ── Privacy ──                           │
│  All processing runs on this device.     │
│  No data has been sent to any server.    │
│  No inference logs are stored.           │
│                                          │
│  [Manage models]  [Reset usage]          │
└─────────────────────────────────────────┘
```

This is also a **trust signal as product** — users see a real dashboard confirming their data stays local.

---

## 12-week build sequence

Each week ends with deployable software. Tagged release of relevant packages. End-of-week demo deliverable in *italics*.

### Phase 1 — Trust + observation + feel (weeks 1–2)

**Week 1: DOM observer infrastructure + Your Data panel + feel-layer wiring.**

- `packages/sdk/src/wrapper/observe/`:
  - `mutation-observer.ts` with rAF-batched dispatch, subtree filtering (ignore Shippie's own injected nodes), per-rule timing budget (auto-disable rules >2ms/dispatch with a warning event).
  - `selector-engine.ts` reads `shippie.json` `enhance:` config, compiles selector→rule mappings.
  - `registry.ts` exposes `registerRule(name, fn)` for built-in + future third-party rules.
  - `capability-gate.ts` — rule manifests declare required APIs; gate auto-skips when missing.
  - First two rules: `wakelock.ts` (defers `screen.wakeLock` acquire until first user gesture), `share-target.ts` (reads `shippie.json` share_target, dispatches to `shippie.share.onReceive`).
- `packages/sdk/src/wrapper/your-data-panel.ts` — in-app overlay (storage breakdown, manual export AES-256-GCM + Argon2id, restore, delete-all, transfer entry-point stub for week 9).
- `services/worker/src/router/your-data.ts` — **standalone fallback** at `/__shippie/data`. Renders self-contained HTML, reads OPFS / IDB / Cache via wrapper API. Works if the maker's app crashes.
- **Feel layer wiring** (existing primitives, not new code):
  - Confirm `wrapper/spring.ts` is auto-applied to view transitions in injected install/share/your-data UI.
  - Confirm `wrapper/haptics.ts` wired to default DOM events in observer rules.
  - Wrapper applies smooth view transitions to the SDK-injected components without maker config.
- Worker injects `<script src="/__shippie/observe.js">` alongside the existing SDK. CSP rewrite already handles same-origin scripts.
- Acceptance: take any existing app, add `<video autoplay>`, screen stays on after first user gesture. Take an existing app, add `data-shippie-list` to a `<ul>`, swipe-to-reveal works with haptic ticks. *Show ME these two interactions on a real device.*

**Week 2: Recipe Saver alpha + first three rules live.**

- `apps/showcase-recipe/`: Vite + React app. Local DB of recipes via `shippie.local.db`. Image upload, manual recipe edit, search.
- Add `text-autocomplete.ts` rule: `<input type="text" autocomplete="shippie">` suggests from current local-DB rows of matching column name.
- Add `shippie.device.scanBarcode()` SDK method (Android only). Recipe Saver uses it explicitly via a "Scan barcode" button next to the image input — not auto-injected. On iOS, the button doesn't render.
- Configure `shippie.json` `enhance:` block with the 3 rules; Recipe Saver inherits them automatically.
- Deploy via existing `/api/deploy` pipeline → `recipe.shippie.app`.
- Acceptance: full Recipe Saver flow (add recipe with image, scan barcode for ingredient on Android, search, view, delete) works offline. Lighthouse PWA score 100. Your Data panel functional.

*End-of-Phase-1 demo: Recipe Saver v0.1 live. The video shows: open the app, add a recipe (autocomplete suggests ingredients from your past recipes), scan a barcode on Android, watch the screen stay on while the camera scans, swipe-to-reveal a recipe to delete it. **All without any maker code beyond the recipe app itself.** The wrapper provided every enhancement.*

### Phase 2 — Mesh foundation + signalling (weeks 3–4)

**Week 3: Proximity Protocol primitives.**

- `services/worker/src/router/signal.ts` — WebSocket route at `/__shippie/signal/<roomId>`. Single Durable Object class `SignalRoom` (colocated with worker, no separate service). DO holds WebSocket-per-device per room; fans out signalling messages; hibernates when room empties; stores nothing.
- `packages/proximity/src/`:
  - `stun.ts` — public IP via `RTCPeerConnection` ICE candidates, with Google/Cloudflare STUN as fallback. Handles dual-stack IPv4/IPv6.
  - `room-id.ts` — `sha256(public_ip + app_slug + group_code)`. Carrier-grade NAT salts itself out via the group_code.
  - `webrtc.ts` — RTCPeerConnection setup, datachannel `shippie-mesh`, retry with exponential backoff, TURN fallback (Cloudflare Calls TURN endpoint).
  - `client.ts` — WebSocket signalling client.
  - `handshake.ts` — **X25519 ephemeral key exchange** between peers after WebRTC connects. The DO never sees keys; the join code is purely a rendezvous identifier.
- Smoke test page proves WebRTC P2P works: two browser tabs, same network, find each other through the worker, establish datachannel, exchange messages. Latency under 30ms on local WiFi.

**Week 4: Group SDK + Yjs + eventLog.**

- `packages/proximity/src/group.ts`:
  - `shippie.local.group.create({ name, joinCode? })` — generates 8-char base32 rendezvous code.
  - `shippie.local.group.join(code)` — joins room, completes X25519 handshake with peers.
  - `group.broadcast(channel, data)` / `group.send(role, data)` / `group.on(event, handler)`.
- `packages/proximity/src/crdt.ts` — Yjs Y.Map / Y.Array via `group.sharedState(name)`. Subdoc partitioning for whiteboard-class state (visible region first, backfill).
- `packages/proximity/src/eventlog.ts` — `group.eventLog(name)` for append-only chat/quiz/feed-style data. Vector clocks. ~10× lighter than full CRDT.
- `packages/proximity/src/encryption.ts` — AES-GCM envelopes signed with Ed25519, keys from week-3 handshake.
- Acceptance: two laptops join a group, sharedState updates land under 30ms. eventLog handles 100 ordered messages without conflict. Owner removes a member, group key rotates, removed member can no longer decrypt new messages.

*End-of-Phase-2 demo: Collaborative Whiteboard v0.1 at `whiteboard.shippie.app`. Two phones on same WiFi. Pair via QR. Draw together. Local strokes paint at 0ms (predictive local render). Remote strokes appear in under 30ms. Both feel instant. Video posted to Twitter — "wait, that's a PWA?"*

### Phase 3 — Local AI + group moderation (weeks 5–7)

**Week 5: Shippie AI app — the big one.**

- `apps/shippie-ai/` scaffold:
  - `inference.html` — invisible-iframe target. Origin allowlist `^https:\/\/[a-z0-9-]+\.shippie\.app$`. postMessage protocol.
  - Models loaded lazily via transformers.js (already wired in `packages/local-ai/`):
    - `classify` — DistilBERT-base-mnli quantized, ~250MB
    - `embed` — all-MiniLM-L6-v2, ~90MB
    - `sentiment` — distilbert-sst2 quantized, ~70MB
    - `moderate` — detoxify-mini class, ~100MB
  - Models cached in this origin's OPFS + Cache Storage. Service worker serves from cache after first download.
  - Heavy compute runs in a dedicated Worker inside the iframe (survives iOS Safari memory pressure better than main thread).
  - `index.html` — user-facing dashboard (PWA, installable).
- Wrapper extension in `packages/sdk/src/local.ts`:
  - `shippie.local.ai.{classify, embed, sentiment, moderate}` lazy-create the iframe, handle postMessage, return results.
  - Capability gate: if iframe fails to load (AI app not installed, CSP block), throws `ShippieAINotInstalled` with install URL. Maker can catch and prompt.
- `services/worker/src/rewriter.ts` updates: auto-rewrite maker CSP to add `frame-src https://ai.shippie.app`.
- Deploy `apps/shippie-ai/` to `ai.shippie.app` via existing pipeline.
- Acceptance: from `recipe.shippie.app`, call `await shippie.local.ai.classify('homemade pasta')` — returns a classification, network tab shows zero outgoing requests beyond the initial iframe load. Inspect the AI app's dashboard, see the inference logged with source app `recipe.shippie.app`.

**Week 6: Group moderation modes.**

- `packages/proximity/src/moderation-hook.ts`:
  - `mode: 'open'` — pass-through.
  - `mode: 'owner-approved'` — outgoing held on sender's device, owner sees queue, approves/rejects.
  - `mode: 'ai-screened'` — outgoing hits `shippie.local.ai.moderate` (via Shippie AI app, fully local) before broadcast. Flagged content holds for owner review.
- Owner moderation dashboard at `/__shippie/group/<id>/moderate` — wrapper-injected, works in any app, no maker code.
- Acceptance: AI-screened group blocks a known-toxic test message before broadcast. Owner sees the flag, can approve or block.

**Week 7: Hub MVP — internal test only.**

- `services/hub/` — Docker container (Pi or x86 Linux):
  - Static file server for cached app deploys (devices install apps from Hub when offline).
  - WebSocket signalling endpoint mirroring `/__shippie/signal/<roomId>` semantics.
  - Local model cache that proxies `ai.shippie.app/models/*` (devices download from Hub instead of CDN).
  - Management dashboard at `hub.local`.
- Wrapper transport-select probes `hub.local` first, falls back to `proximity.shippie.app`. Same group works either way — same X25519 handshake, same encryption, just different rendezvous endpoint.
- **Test on internal network only** (your home WiFi, your office). School pilot deferred to week 11–12 — don't block the 12-week plan on a real-school deployment.
- Acceptance: turn off internet, two devices on local WiFi can still create + join a Whiteboard group via the Hub. Latency unchanged from cloud-relay path.

*End-of-Phase-3 demo: Personal Journal with AI v0.1 at `journal.shippie.app`. All AI runs through Shippie AI app — verified zero outgoing inference requests. Sentiment trend over time. Semantic search ("when was I last anxious?"). Topic clusters. Encrypted at rest. The privacy-first journal that means it.*

### Phase 4 — Cloud backup + device transfer (weeks 8–9)

**Week 8: Drive backup via OAuth coordinator.**

- `apps/web/app/oauth/google-drive/route.ts` — single redirect URI `https://shippie.app/oauth/google-drive`. Receives the auth code from Google, posts back to the originating app via popup `window.opener.postMessage` (default) or 302 redirect (mobile Safari fallback). State HMAC'd to prevent forgery.
- `packages/backup-providers/src/google-drive.ts` — uploads encrypted backup directly to user's Drive `/Shippie Backups/` folder. Tokens stored locally (per-app). Shippie servers see only the auth code in transit.
- Service-worker scheduler: daily at user-chosen time, retry with backoff, surface success/failure in Your Data panel.
- Auto-restore: app loads on a new device, Your Data panel checks Drive for recent backup, prompts "Restore from 6 hours ago?".
- Acceptance: Recipe Saver auto-backs-up to Drive nightly. Restore from a fresh install with passphrase brings back all recipes + images.

**Week 9: Device-to-device transfer.**

- WebRTC transfer reuses Proximity Protocol with a one-time room. Old device generates QR with code + transfer key. New device scans, joins room, receives chunked DB + files via RTCDataChannel.
- BLE fallback for off-WiFi (Android-only, slow but works for tiny payloads — not whiteboard state, just credentials + bootstrap).
- Group state portability: device transfer carries owner key pair + group memberships + Yjs state. New device IS the old device from the group's perspective.
- Acceptance: full Recipe Saver state (200 recipes, 50 images, group with partner) transfers in under 15 seconds on shared WiFi. Whiteboard group on old device intact on new device, no re-invite.

### Phase 5 — Maturity + launch + Hub pilot (weeks 10–12)

**Week 10: Maturity — list/swipe rules + form validation + accessibility audit.**

- Refine existing observer rules with real-world testing across the 3 showcase apps.
- New rule: `form-validate.ts` — `<form data-shippie-validate>` validates against `shippie.json data_schemas` before submit.
- Full a11y audit: VoiceOver + TalkBack on each rule. Rules that break a11y move behind explicit opt-in via `data-shippie-enhance="..."`.
- Refine Whiteboard: 4+ concurrent participants, image insertion, export-as-PNG.
- Refine Journal: trend visualisations, year-in-review (extractive only, runs on-device).

**Week 11: Launch.**

- **Demo video:** two phones on a desk, drawing together via Whiteboard. Latency captured via timestamp deltas. 60-second cut for Twitter, 3-minute version for HN/Product Hunt.
- **Blog posts:**
  - "Sub-30ms collaborative drawing in the browser — how Shippie's Proximity Protocol works"
  - "Your data, your device — the Shippie AI app and what it means for privacy"
  - "DOM enhancement: the universal browser extension you didn't install"
- **Submissions:** Hacker News (tech post), Product Hunt (showcase apps), Twitter/X (demo video), select indie-hackers Discord/Slacks.
- **Documentation:** `docs/wrapper.md` (the `enhance:` config and rules), `docs/groups.md` (Proximity Protocol API), `docs/ai.md` (Shippie AI app and inference SDK), `docs/data.md` (Your Data panel and backup).
- One real school pilot if a partner is willing — the Hub from week 7 gets deployed to their network, they run a quiz or whiteboard session. Optional, not blocking.

**Week 12: Polish + retrospective.**

- All three apps to v1.0 quality. Lighthouse 100. Real-device testing on iPhone 13+, Pixel 6+, low-end Android, iPad.
- Fix top issues from launch-week feedback.
- Retrospective document: what shipped, what slipped, week-13+ priorities pulled by demand.

---

## Acceptance criteria per showcase app

### Recipe Saver
- [ ] 100% offline-capable. Air-plane mode → app fully functional.
- [ ] Barcode scan on Android (via `shippie.device.scanBarcode()`) → autofill ingredients via Open Food Facts.
- [ ] Image input + barcode button work as separate affordances. Standard HTML semantics preserved.
- [ ] Local search across recipes returns under 50ms.
- [ ] Your Data panel: storage breakdown, manual export, daily Drive backup.
- [ ] Auto-restore from Drive on fresh-device install.
- [ ] Group share: invite a partner via QR, both edit recipes peer-to-peer with sub-30ms remote latency, local strokes (e.g., live editing) instant.
- [ ] Full feel layer: spring transitions on view changes, haptic ticks on swipe-to-reveal, smooth view transitions.
- [ ] Lighthouse PWA score 100.

### Collaborative Whiteboard
- [ ] Two devices on same WiFi pair via QR in under 10 seconds.
- [ ] **Local stroke 0ms (predictive paint), remote stroke under 30ms on local network.** Both feel instant.
- [ ] 4-way concurrent drawing without conflicts (Yjs CRDT).
- [ ] Works without internet (P2P + Hub or pure-LAN WebRTC).
- [ ] Falls back to internet relay when peers are not on same network — same UX, higher latency (60–150ms).
- [ ] Owner can clear board, kick participants, export PNG.
- [ ] Your Data panel shows zero data was uploaded to Shippie servers (relay sees encrypted blobs only).

### Personal Journal with AI
- [ ] **Verifiably zero outgoing inference requests.** Network tab open during 5-minute session shows: app load, AI app iframe load (one time), no inference traffic.
- [ ] Sentiment per entry (mood trend chart).
- [ ] Semantic search ("when was I anxious about work") via local embeddings (Shippie AI app).
- [ ] Topic clustering across entries.
- [ ] Year-in-review uses extractive summary (TextRank, no model). Generative summary explicitly absent in v1.
- [ ] Encrypted at rest (SQLCipher on top of wa-sqlite + OPFS).
- [ ] Encrypted backup to user's own Drive — never to Shippie.
- [ ] Your Data panel includes "Delete everything from this device" with verification.
- [ ] Lighthouse PWA score 100.

---

## What ships every week

| Week | Deployed |
|---|---|
| 1 | Wrapper v3.0: observe runtime, Your Data panel, 2 rules, feel layer wired into injected UI. |
| 2 | Recipe Saver alpha at `recipe.shippie.app`. 3 rules. `shippie.device.scanBarcode()`. Lighthouse 100. |
| 3 | Worker `signal.ts` route + SignalRoom DO. Smoke-test page proves WebRTC P2P. |
| 4 | Whiteboard alpha at `whiteboard.shippie.app`. `shippie.local.group.*` API live. eventLog + sharedState. |
| 5 | **Shippie AI app live at `ai.shippie.app`.** Recipe Saver demonstrates local autocomplete via embeddings. |
| 6 | Group moderation modes. Whiteboard groups can be moderated. |
| 7 | Hub Docker container, internal-network tested. Journal alpha at `journal.shippie.app`. |
| 8 | Drive OAuth coordinator at `shippie.app/oauth/google-drive`. Recipe Saver auto-backs-up nightly. |
| 9 | Device transfer (DB + files + group state) via QR pairing. |
| 10 | Form validation rule. List/swipe rules mature. Full a11y audit done. |
| 11 | **Launch: demo video, 3 blog posts, HN/PH/Twitter.** Optional school pilot if partner ready. |
| 12 | All three apps at v1.0. Real-device QA. Retrospective. |

---

## Dependencies + risks

| Risk | Mitigation |
|---|---|
| WebRTC NAT traversal failures | TURN fallback via Cloudflare Calls |
| iOS PWA OPFS quota eviction | Hard 500MB cap per app on iOS; AI app holds a separate origin's quota → effectively isolated |
| Low-end Android inference speed | Device-class detection on first run; surface "this might be slow" in AI app dashboard, never silently fail |
| iOS Safari iframe memory eviction | Inference runs in dedicated Worker inside iframe (workers more resilient); auto-reload iframe on `pageshow` if killed |
| DOM enhancement breaks maker apps | `data-shippie-no-enhance`, opt-out at element AND app level (`enhance: false` in shippie.json), rules ship behind feature flag for one week before default-on |
| Yjs sync stalls on large state | Subdoc partitioning by region/time-window |
| Schools block all UDP / WebRTC | Hub deployment for that case (week 7); not blocking for 12-week plan |
| Maker forgets to install Shippie AI | Wrapper detects iframe load failure, shows install prompt, app degrades gracefully (search becomes keyword, sentiment hidden) until install |
| Cloud backup token theft | Tokens stored in OPFS, never in localStorage; per-app, not platform-wide |

---

## Out of scope (week 13+, demand-driven)

- Quiz app (week 13+ if education demand)
- Pantry tracker, fitness tracker, MIDI/Serial/USB SDK methods
- Custom domains per app (separate prod-launch track)
- Cross-app intelligence layer (intents, knowledge graph, temporal/spatial memory) — pioneering territory but layers on top of week 1–12 foundation
- Generative summarisation in Journal (v1.5 with explicit consent toggle)
- Dropbox / WebDAV backup providers (Drive is enough for launch)
- Real-school pilot of Hub (week 13+ once a partner is identified)
- Marketplace browsing / discovery / leaderboards (already exists, doesn't need rebuild)
- Monetisation / billing / tiers
- First-party database, auth, or compute (the ecosystem already has these; Shippie never competes)
- Stripe payments via Payment Request API
- Android-only Bluetooth heart-rate / NFC SDK methods (week 13+ if fitness/inventory demand)

---

## Marketing copy (locked)

> **Shippie**
>
> The first wrapper that enhances your app without changing your code.
>
> Declare what you want — the wrapper makes it happen. Your HTML stays standard. Your app gets superpowers.
>
> File inputs accept barcodes. Lists feel native. Video keeps the screen on. Forms autocomplete from local data. AI runs on the device. Friends share over the local network. Backups go to your own Drive — never ours.
>
> Your code doesn't change. Your app just works better.

No "Best on Android" badging. No tier stratification. Android users discover extras silently. iOS users get a fully functional, beautiful, local-first PWA. Both stories are great.
