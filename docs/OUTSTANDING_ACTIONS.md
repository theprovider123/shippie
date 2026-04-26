# Outstanding Actions

This file lists what cannot be completed inside the agent loop — work that requires real hardware, real Cloudflare account state, or human verification on devices. Everything in code that could be done autonomously is in `docs/CURRENT_STATE.md`.

**Updated:** 2026-04-26 (Phase 0 + initial Phase 1/4/5 code work landed).

---

## Phase 0 — Truth and Green Health

✅ **Done.** `bun run health` is green. Component status table is the source of truth.

---

## Phase 1 — Live Room Wedge

### Code work — ✅ DONE
- Showcase app (`apps/showcase-live-room/`): host / guest / shared / results, full Yjs first-buzzer-wins logic, integration tests passing.
- Platform-side signalling: `SignalRoom` Durable Object class + `/__shippie/signal/[roomId]` route, 9/9 routing tests, wrangler.toml v3 migration + binding, wrap-worker bundles + re-exports the class.
- Proximity package (`packages/proximity/`): 90/90 tests already shipped before this session.

### Outstanding (you, with real phones)

- [ ] **Two-phone smoke** on iPhone Safari + Android Chrome on the same Wi-Fi.
  - Install the Live Room app to the home screen on each phone.
  - Host a room on phone A, guest joins via QR on phone B.
  - Run a 3-question quiz end to end.
  - Confirm: buzzer haptic fires on every tap, first-buzzer winner agrees on both phones, scoreboard bars animate with spring overshoot, milestone texture fires on the final winner row.
- [ ] **Latency measurement.** Open the room audit log (D1 `room_audit` rows for the test room) and capture `local stroke 0 ms; remote stroke <30 ms` honestly. Don't promise blindly — measure.
- [ ] **60-second demo video.** Two phones side-by-side, buzzer fairness shown to the millisecond. This is the launch asset.
- [ ] **Deploy SignalRoom to production.** First production deploy needs `wrangler deploy` with the v3 migration applied. The route `/__shippie/signal/[roomId]` will return 503 until the DO binding resolves at runtime.

### Acceptance for Phase 1

> Two-real-phone smoke completes a 3-question quiz with deterministic winner, sub-30 ms remote latency confirmed, demo video filmed.

---

## Phase 2 — Recipe + Journal Proof Apps

### Code work — ✅ DONE (substrate)
- `apps/showcase-recipe/`: api / components / db / pages — full structure exists.
- `apps/showcase-journal/`: ai / ambient / charts / components / db / pages — full structure with local sentiment + ambient analysis.
- Both build cleanly and ship through turbo.

### Outstanding (you, with real phones)
- [ ] **Install both to the home screen** on iPhone Safari + Android Chrome.
- [ ] **Persist data offline.** Open Recipe Saver on the tube (or with airplane mode), confirm recipes save and re-open after relaunch.
- [ ] **Open the Your Data panel** in each app. Confirm storage breakdown is accurate, export works, recovery route at `/__shippie/data` loads even if the maker app is broken.
- [ ] **Demonstrate Sense.** Tap many buttons, navigate between pages, scroll lists — confirm haptics + spring + textures + patina warming over time feel correct.

---

## Phase 3 — Maker Magic

### Code work — ✅ DONE (substrate)
- AppProfile analyser: `packages/analyse/` (html-scanner, css-scanner, js-scanner, capability-recommender, semantic-classifier, profile, wasm-detector).
- Enhancement dashboard route: `apps/platform/src/routes/dashboard/apps/[slug]/enhancements/{+page.svelte,+page.server.ts}`.
- AI backend transparency: `source: "webnn-npu" | "webgpu" | "wasm-cpu"` is threaded through `apps/shippie-ai/src/inference/router.ts`, `apps/shippie-ai/src/types.ts`, and `packages/sdk/src/local.ts`.

### Outstanding
- [ ] **Maker UX walkthrough.** Deploy a plain SvelteKit/React app with no `shippie.json`. Open the Enhancements tab. Confirm the dashboard surfaces every auto-detected capability + the AI dashboard shows backend used per inference.
- [ ] **Runtime proof ingestion** (the Phase 3 "Proof system"). The proof event schema, ingestion endpoint, listing rollup jobs, and maker proof dashboard are not yet wired. Recommended next slice — without this, Capability Proof Badges have no source data.
  - Recommended location: `apps/platform/src/routes/api/v1/proof/+server.ts` (ingestion), a cron in `src/lib/server/cron/` for rollups (similar pattern to `rollups.test.ts`), and a Svelte tab under `dashboard/apps/[slug]/proof/`.

---

## Phase 4 — Vault Completion

### Code work — ✅ DONE (substrate)
- OAuth coordinator package: `packages/backup-providers/src/oauth-coordinator.ts` with envelope sign/verify, PKCE helpers.
- Provider adapter: `packages/backup-providers/src/google-drive.ts` with file upload/list/download/prune.
- Encryption: `packages/backup-providers/src/crypto.ts`.
- Scheduler: `packages/backup-providers/src/scheduler.ts`.
- Device transfer primitives: `packages/proximity/src/transfer.ts`.
- **NEW**: OAuth coordinator route at `apps/platform/src/routes/oauth/[provider]/+server.ts` — handles popup-open envelope verify + 302 to provider authorize, callback state verify + code exchange + postMessage(token) to maker app's signed origin. 8/8 tests green.

### Outstanding
- [ ] **Cloudflare env vars** in production: `OAUTH_COORDINATOR_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `SHIPPIE_PUBLIC_HOST` (see updated `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md` Step 5).
- [ ] **Google Cloud Console**: register OAuth client. Authorised redirect URI = `https://shippie.app/oauth/google-drive` (exactly one redirect for the platform). Authorised JS origins = `https://shippie.app`. Enable Google Drive API.
- [ ] **End-to-end backup test** from `apps/showcase-recipe/` or `apps/showcase-journal/`:
  - Wire a "Backup to Drive" button in the Your Data panel.
  - Add 50 recipes / journal entries.
  - Trigger a backup → verify encrypted blob lands in user's Drive under "Shippie Backups/".
  - Wipe the device → restore from Drive → confirm data integrity.
- [ ] **Device transfer end-to-end**:
  - Wire a "Transfer to new device" button in the Your Data panel that calls `packages/proximity/src/transfer.ts`.
  - Test: phone A → phone B in <60 s for a realistic recipe library (~50 entries + a few photos).

### Acceptance for Phase 4

> Phone A → Phone B transfer in under 60 seconds for realistic app data; Google Drive backup/restore works end-to-end; Shippie never sees plaintext user data.

---

## Phase 5 — Launch Surface

### Code work — partially done
- ✅ Homepage hero refreshed to Wrap/Run/Connect framing (`apps/platform/src/routes/+page.svelte`).
- ✅ Architecture / self-hosting / prod-deploy-runbook docs rewritten to reflect HEAD.
- ✅ `docs/CURRENT_STATE.md` is the living truth file.

### Outstanding (mostly your call, not autonomous-bot work)
- [ ] **Whitepaper.** Working title from the plan: *Locally This, Locally That — How Shippie Puts Apps Back on Your Device.* Keep the saved Vivian Balakrishnan reference as inspiration; you flagged this for whitepaper time. Outline:
  1. The problem: cloud-tethered apps, App Store gatekeeping, surveillance defaults.
  2. The thesis: Wrap. Run. Connect.
  3. The stack: 9 internal components (Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub).
  4. Composition over invention — what's open-source underneath.
  5. Proof, not promises — the runtime evidence layer.
  6. What's hard about this and where help is wanted.
- [ ] **Architecture diagram.** Cleaned up SVG of the data-flow + per-pillar boundary. The seed exists in `docs/architecture.md`'s ASCII map; promote to a real diagram for the homepage and whitepaper.
- [ ] **Capability Proof Badge UI.** When the runtime proof ingestion lands (Phase 3 outstanding), each app listing should display its earned badges (Works offline / Runs local DB / Uses local AI / Mesh-ready / Data export verified). The badges are computed; the listing card just needs a slot.
- [ ] **Maker onboarding flow.** A guided "deploy your first app in 60 seconds" walkthrough on `/new` for first-time makers. Today the page exists but the onboarding moment isn't designed.
- [ ] **Seeded apps across all three pillars.** Per the plan, 10–20 apps deliberately spread across Wrap (utilities) / Run (data apps) / Connect (event tools). Avoid random isolated calculators — every seeded app should illustrate one pillar in its strongest form.
- [ ] **Launch sequence**: Day 1 Show HN + open source repo, Day 2 Live Room buzzer-fairness Twitter video, Day 3 r/privacy + r/selfhosted, Day 4 Product Hunt, Day 5 Claude Code Discord / Cursor forums.

---

## Phase 6 — Frontier R&D (post-launch, intentionally deferred)

Per the plan's Non-Negotiables: **build when core proof is strong.** Spark phone-to-phone propagation, BLE beacon discovery, hotspot handoff, chain propagation, crowd consensus, gossip aggregation, cross-app intents + knowledge graph, multi-Hub venue mesh, stadium pilot, festival pilot, MCP deploy from chat, app graduation reports — all stay in the roadmap, **none get touched until Phase 5 ships and demand pulls them in.**

If after launch you start getting DMs like "we'd run this for our Friday quiz at the pub" or "can it work at our school sports day," the demand signal is real and Phase 6 starts there.

---

## Reference

- Approved plan: `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`
- Living truth file: `docs/CURRENT_STATE.md`
- Architecture: `docs/architecture.md`
- Self-hosting: `docs/self-hosting.md`
- Prod deploy: `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`
- Active engineering plans: `docs/superpowers/plans/2026-04-2*.md`
