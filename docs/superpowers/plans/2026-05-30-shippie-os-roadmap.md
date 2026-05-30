# Shippie OS — Umbrella Roadmap

> **Status:** Draft v1, 2026-05-30. This is a sequencing roadmap, not a single design spec. Each tranche below becomes its own design doc → plan → implementation cycle.
>
> **Position.** "OS" is **internal vocabulary** for this roadmap — engineering and architecture framing, not a public claim. Public-facing language stays grounded: **Wrap. Run. Connect.** for the headline, and "a local-first app environment", "your apps running together on your device", "private system layer for web apps" as supporting copy. Shippie does *not* claim to replace iOS / Android / the underlying OS — doing so would invite impossible-to-meet expectations around background execution, lock screen, radios, app-store semantics, and native APIs. The honest claim is the one we already make: a local-first environment that makes web apps feel like a coherent personal system.

---

## 1. Thesis

Shippie already runs a sandboxed multi-app runtime on the user's device with a private intent bus, capability-gated permissions, shared local storage, shared local AI, peer mesh, encrypted backup, and an installable container. That is a kernel and a userland.

What's missing — and what "OS" means here — is the **always-present user-facing surface** (search, share, notifications, settings) and the **shared primitives** (Files, Contacts, Calendar, Camera, Voice, system Assistant) that 38+ apps should not each re-implement. Plus the **trust ledger** that turns Shippie's "your data stays here" promise from a static badge into a live audit the user can read.

Building all of this in line with the **private cloud / local-first / open / edge** approach means:

- **No central account.** Identity is the device, optionally bridged to user-held cloud (Drive/iCloud/Dropbox/Hub) for backup. No Shippie-owned user-data store, ever.
- **No proprietary kernel.** The "kernel" is the SvelteKit + Cloudflare Worker + iframe container that's already in `apps/platform/`. No native fork required. Hub is the edge node when the user wants one.
- **No App Store gatekeeping.** Distribution stays multi-path: zip / CLI / MCP / GitHub / URL-wrap-for-private + invite. The marketplace curates first-party demos; third-party apps install by URL.
- **Open by default.** AGPL platform, MIT SDK, no telemetry the user can't read in their own ledger.

This roadmap does NOT propose:

- A native mobile shell beyond PWA
- A Shippie account system
- An ad/store/payments rake
- Replacing the underlying OS the user already runs on their phone
- Any introduction of Vercel, third-party CDN, or proprietary cloud dependency

---

## 2. What Shippie already has (the kernel + userland)

| OS-grade capability | Where it lives today |
|---|---|
| App runtime / sandbox | `apps/platform/src/routes/container/` + iframe per app |
| Window mode | Focused (full-bleed via `/run/<slug>/`) + Dashboard (grid) |
| IPC | Intent bus — `packages/app-package-contract` capabilities + `apps/platform/src/lib/container/intents/` |
| Permissions | Capability bridge with per-app grants, `intent.provide` / `intent.consume` / `system.*` tiers |
| Local storage | `@shippie/local-db` (wa-sqlite) + `@shippie/local-files` (OPFS) |
| Local AI | `apps/platform/src/lib/container/ai-worker.ts` + `/__esm/` self-hosted Transformers runtime |
| Push | VAPID via `@shippie/sdk/wrapper/push` |
| Backup | `@shippie/backup-providers` (Drive, OAuth coordinator route) + device transfer in `@shippie/proximity` |
| Mesh | Pulse — WebRTC over SignalRoom DO + Hub for venue-local mDNS |
| App distribution | Marketplace + 5 deploy paths + Local Tool Policy scanner |
| Trust signals | Proof spine — `proof_events`, `capability_badges`, cron-derived `proven` badges |
| Always-present surface | `/today` (early — IndexedDB-backed daily card) |
| Recovery | `/__shippie/data` route reads underlying storage even if maker app is broken |
| Agent | `@shippie/agent` — 3 strategies + runner, rate-limited, no I/O |
| Curation manifest | `_generated/first-party-curation` + `SLUG_ALIASES` for canonical successors |

That's a non-trivial OS substrate. The work below sits **on top of it**, not under it.

---

## 3. The six tranches

Each tranche is a self-contained body of work that maps to existing Shippie component vocabulary (Shell / Boost / Sense / Core / AI / Vault / Pulse / Spark / Hub / Proof). Each gets its own design spec → plan → implementation cycle.

### Tranche 1 — Multitasking (Shell++)

**Purpose.** A formal app lifecycle so backgrounded apps behave predictably: a timer's state survives a switch and resumes cleanly, a recording's buffer checkpoints durably, a sync queue picks up where it left off when next foregrounded. Today the iframe LRU cap is *eviction*, not lifecycle.

**Maps to.** Shell + Sense.

**In scope.**
- Lifecycle states per app: `running`, `paused`, `suspended` (state snapshot to OPFS), `evicted`. Transitions exposed to SDK as `shippie.lifecycle.on(state)`.
- Background task contract — narrow capability `background.task` that grants a single named task a **best-effort** wall-clock budget. Uses Periodic Background Sync / Background Fetch / Notification Triggers where the browser supports them; everywhere else, the guarantee is **durable checkpoint + faithful resume on next foreground**. The contract explicitly does not promise true background execution.
- Split-view + Picture-in-Picture for two apps at once (focused mode currently shows exactly one). Subject to browser PiP support; split-view is container-internal so works everywhere.
- Task switcher state preservation — when you swipe back to an app it resumes scroll/route/form state, not a cold reload.

**Out of scope.**
- True OS-level background execution (browsers won't allow it). Background here means "the container will faithfully resume you and grant the budgets you declared, within what the user's browser actually permits."

**Dependencies.** None blocking. Builds directly on existing container shell.

**Success criteria.**
- A podcast showcase keeps playing through a switch to a notes showcase (best-effort: continuous in browsers that allow audio backgrounding; resume-on-foreground elsewhere).
- A long sync checkpoints durably during backgrounding and drains correctly on resume — continuous in browsers that allow it (Background Sync), checkpoint-resume everywhere else.
- Split-view ships behind a feature flag with two real showcases proving cross-app workflow (e.g. Recipe + Shopping List).

**Effort.** L. Lifecycle is invasive — every showcase needs to be reviewed for state preservation assumptions.

---

### Tranche 2 — System Surfaces (Shell + Sense + AI)

**Purpose.** The always-present user-facing UX that makes a collection of apps feel like one OS: search, share, notifications, settings. Today these are either per-app or absent.

**Maps to.** Shell + Sense + AI + Proof.

**In scope.**
- **Spotlight.** Cross-app local search. Each app declares a `search.index` capability and provides items via `shippie.search.publish([{title, body, deeplink, ...}])`. Index lives in IndexedDB on-device; container runs FTS5 over it (already have wa-sqlite). Privacy invariant: the user, not Shippie, owns the index.
- **Share Sheet.** When an app calls `shippie.share({content, kinds})`, the container shows installed apps that consume a matching intent. Routes through the existing intent bus, so this is mostly a picker UI + receiver-side handler convention.
- **Notification Center.** Inbox + Quiet Hours + per-app routing rules. Backed by D1 for delivery audit (already in `room_audit` pattern); on-device queue is the source of truth.
- **Settings.** A real OS-level prefs shell — theme, language, region, motion, haptics, large text, reduced data, per-app permissions, per-app storage usage, per-app revoke. Today these are per-app.
- **Today (elevated).** The `/today` surface graduates from "early daily card" to the home surface that pulls signals from the intent bus + agent insights + notification inbox.

**Out of scope.**
- A system keyboard or IME (the OS underneath owns that).
- A system lockscreen (PWA can't deliver one; the OS lockscreen is the actual one).

**Dependencies.** Tranche 5 (Trust Ledger) for the Settings → Permissions panel to be honest. Surfaces can ship before the ledger is complete, but the per-app permissions tab is hollow without it.

**Success criteria.**
- Spotlight returns hits from at least 8 first-party showcases.
- Share Sheet routes content from any showcase to any other showcase that consumes a matching kind.
- Settings shows correct per-app storage + revocable permission for every installed app.
- Notification Center is the only place a user goes to find what Shippie wanted to tell them.

**Effort.** L. Biggest user-perceived "this is an OS now" lift; lots of surface area but each surface is well-scoped.

---

### Tranche 3 — Shared Primitives (Core++)

**Purpose.** HAL-style services apps consume by capability instead of re-implementing. Today 38 apps each ship their own contact pickers, scanners, calendars.

**Maps to.** Core + AI + Vault.

**In scope.**
- **System Files.** Cross-app browser + picker. Apps see only paths they're granted access to. Built on `@shippie/local-files`.
- **Contacts.** A shared, on-device, user-owned contact list. Capability `contacts.read` (per-field) and `contacts.write`. No phone-book sync to a Shippie server — bridged to user's chosen backup like everything else.
- **Calendar.** Shared event store. Capability `calendar.read` / `calendar.write` / `calendar.subscribe`.
- **Reminders.** Shared trigger store. Capability `reminders.set` with timezone-aware scheduling persisted durably to OPFS. Notification Triggers / Periodic Background Sync fire reminders in-browser where supported; foreground catch-up (replay missed reminders on next launch) is the guarantee everywhere else. The contract does not promise wake-from-cold delivery in browsers that lack the underlying APIs.
- **Camera / Scanner.** Shared scanner that returns structured output: "this is a receipt / business card / barcode / handwritten note." Backed by `apps/platform/src/lib/container/ai-worker.ts`.
- **Voice / Dictation.** Shared mic-to-text via local AI. Apps request the result, never the audio.

**Out of scope.**
- Sync of any of these to a Shippie-owned cloud. User-held backup only.
- A Shippie Mail / SMS surface — those are the underlying OS's job.

**Dependencies.**
- Tranche 5 (Trust Ledger) — these primitives are the biggest privacy stakes; the ledger needs to be ready or shipping in parallel.
- Tranche 1 (Lifecycle) for Reminders to survive eviction.

**Success criteria.**
- Three existing showcases swap their own contact pickers for the shared one (e.g. Match Room, Live Room, Whiteboard).
- A new showcase can be built that combines Files + Camera + Calendar without re-implementing any of them.
- A `contacts.read` grant can be revoked from Settings and the app's picker degrades gracefully.

**Effort.** L. Six primitives, but each is well-bounded.

---

### Tranche 4 — Identity & Device Fabric (Vault + Spark)

**Purpose.** An OS belongs to a person across their devices. Today Shippie is single-device-single-user. Spark (phone-to-phone propagation) has been deferred since launch; this tranche is its un-deferring plus the profile layer.

**Maps to.** Vault + Spark + Hub.

**In scope.**
- **Profiles.** Guest mode, kid mode, secondary profile. Profile boundary is a Vault keyspace boundary — separate OPFS root + DB namespace. Switching is `shippie.profile.switch(id)`.
- **Family install share.** A profile can mark an install as "shared with family"; other family-profile devices on the same Pulse mesh see it and can one-tap install.
- **Device pairing.** A user's phone + tablet + Hub auto-discover each other via Pulse + Hub mDNS + (out-of-band QR for first-touch). Once paired, the devices form the user's private edge.
- **Cross-device sync.** Per-app opt-in. Apps that declare `sync.replicate` get a Yjs replication channel over the device-fabric mesh — no Shippie server in the path.
- **Sign-in by device.** When a third-party app needs "who is this", the answer is a device-attestation token signed by the user's paired-device set. Never an email or phone number.

**Out of scope.**
- A Shippie account login (forbidden by the thesis).
- A cloud-replicated profile (replication is device-to-device or device-to-user-cloud).

**Dependencies.**
- Tranche 5 (Trust Ledger) for visible accounting of what crosses the fabric.

**Success criteria.**
- Profile switch on a single device works and isolates data.
- Pair phone + tablet, install Recipe on phone, see one-tap install offer on tablet.
- Run a Yjs-replicated showcase across paired devices with no Shippie service in the path.

**Effort.** XL. This is genuinely new substrate (profiles aren't in the codebase) plus un-deferring Spark.

---

### Tranche 5 — Trust Ledger (Proof++) **[recommended first spec — narrowed to sub-phase 5A]**

**Purpose.** Turn the Proof spine from "static capability badges on a listing" into a live user-readable ledger: "what did each app see, store, fetch, send, in the last 24 h / 7 d / 30 d." This is Shippie's differentiator made concrete.

**Maps to.** Proof + Vault + Shell.

**Internal sub-phases.** Single tranche, sequenced internally; each sub-phase gets its own spec.

- **5A — Ledger Core.** Schema, emit hooks at every capability-bridge site, on-device storage, redaction rules, retention, plus a minimal user-readable surface (a single per-app timeline view). This is the first spec to draft. Nothing in 5B or 5C ships before 5A is proven in the field.
- **5B — Trust Center + Revokes.** The full Settings → Trust panel: cross-app timeline, granular per-row revoke that takes effect on next call, scheduled-rotation controls, export / delete-all controls, opt-in backup mirror.
- **5C — Safe Mode + Rollback.** `safe.shippie.app` minimal shell that can read the ledger, revoke permissions, restore from backup, and roll back the container channel without the broken container being healthy. Container rollback channel: pin known-good version, halt rollouts that fail Proof gates on N devices in M hours.

**In scope (across the tranche).**
- **Per-app accounting.** Every capability call (`intent.provide`, `intent.consume`, `system.crossDb.query`, `data.transferDrop`, `network.fetch`, `ai.run`, `share.send`, `contacts.read`, `calendar.write`, etc.) emits a ledger row. Row schema: `{ts, app, capability, summary, bytes_in, bytes_out, target_host}`. Stays on-device by default; user can opt to mirror to their backup.
- **Ledger surface.** Per-app timeline. "Recipe Saver — last 24 h: read pantry 12×, wrote to shopping-list intent 3×, fetched palate.app/imports/aisle-map.json (8 KB), used local AI 4×, no network egress."
- **Granular revoke.** Each row has a "block this capability for this app" affordance. Revoke takes effect on next call. (5B.)
- **Safe-mode boot.** (5C.) If the container fails to load, `safe.shippie.app` (or local `?safe=1` flag) boots a minimal shell that can read the ledger, revoke permissions, restore from backup, or roll back the container channel.
- **Container rollback channel.** (5C.) Pin a known-good container version; if a new release fails Proof gates on N devices in M hours, the rollout halts and existing installs stay on the pinned version.
- **Network egress ledger.** Every outbound HTTP from any showcase running on a **Shippie-controlled runtime** is logged with target host + byte counts. (URL-installed / custom-domain apps are bridge-only — see "Egress enforcement" below.) The Local Tool Policy stays as a deploy-time check; runtime emission + enforcement is the load-bearing layer.

**Privacy invariants (load-bearing — these are not deferred questions).**
- **No payload logging.** Ledger rows carry summaries (capability, counts, target host, byte sizes), never bodies. A `network.fetch` row records `target_host` and `bytes_in/out`, never the request body, response body, or full URL with query string.
- **Redacted summaries.** Where a summary would otherwise include user content (e.g. intent payload preview), it is reduced to a stable signature (intent kind + row count) before being persisted.
- **Key derivation at rest.** Ledger rows are encrypted at rest.
  - **5A — device/Vault key.** A single key derived from the device's Vault material. A stolen IndexedDB snapshot is unreadable without it.
  - **Once Tranche 4 lands — profile-scoped key.** Rows partition by profile and re-encrypt under per-profile keys derived from the profile's Vault material. 5A does not depend on Tranche 4; the key derivation upgrades when 4 is available, behind a versioned schema field.
- **Retention.** Default 30 days, user-controllable down to "session only" and up to backup-pinned indefinite. Rows older than retention are deleted on next-launch sweep.
- **Export + delete.** First-class user actions, surfaced in the ledger UI. Export is plain JSON; delete is irrevocable + audited (the deletion itself logs a single row).
- **Backup mirroring.** Opt-in only. Default off. When on, mirror writes ride the existing user-held backup channel (Drive / iCloud / Dropbox / Hub), never to a Shippie-owned store.

**Failure policy for the durable-commit invariant (load-bearing — 5A design decision).**

The durable-commit invariant requires the encrypted ledger row to be persisted before the bridge response resolves. What happens when the commit itself fails (IDB write rejected, crypto error, quota exceeded, Vault key unreachable) is a 5A design decision the spec must lock down. The roadmap position:

- **Fail closed by default.** Any capability with identifiable user data or external effect — `network.fetch`, `share.send`, `contacts.read|write`, `calendar.write`, `data.transferDrop`, `system.crossDb.query`, every cross-app `intent.provide` / `intent.consume` write path — fails the call if the ledger commit fails. Bridge returns `{ok: false, error: 'ledger-unavailable'}`; the user sees a one-time recoverable banner ("Trust Ledger could not record this — action paused for safety").
- **Fail open with degraded visibility, narrowly.** Low-risk introspective capabilities with no user-data egress — a successful `ai.run` inference on app-local data with zero outbound traffic, pure read paths that already resolved from cache — may resolve normally. On next successful ledger commit, a `ledger-degraded` row is written so the user sees there was a gap. The fail-open list is **explicit, allow-listed, and refused by default**; the 5A spec names every entry.
- **Vault key access failure = always fail closed.** Without the key we cannot encrypt the row, cannot read prior rows for redaction context, cannot safely proceed. Bridge returns `key-unavailable`; safe-mode boot (5C) becomes the recovery surface. 5A ships the fail-closed banner + a "switch to safe mode" link even before 5C lands the full safe-mode shell.
- **Quota pressure (IDB full).** Triggers an immediate retention sweep (drops rows past the configured budget). If still full, subsequent writes block; the user is prompted to extend retention down or export-and-clear. Capabilities fail closed until quota recovers.
- **First-launch / migration carve-out.** On a new install or after a migration, capability calls are queued in a bounded memory buffer and flushed in batch on first successful ledger init. Cap: N writes (suggested 256) within T seconds (suggested 30); overflow fails closed. Once the ledger is hot, the queue is empty.

**The 5A spec must lock down before implementation:** (a) the precise allow-list for fail-open capabilities; (b) the banner copy + recovery affordance for fail-closed paths; (c) the queue cap N and timeout T; (d) what counts as "ledger init complete" for the carve-out; (e) how a stuck fail-closed loop (e.g. persistent Vault unavailability) hands the user off to safe-mode rather than degrading the container indefinitely.

**Mirror invariant — every Shippie-originated telemetry source lands locally.**
- **Scope: all telemetry classes Shippie collects from a device.** Currently in tree:
  - **Cloud Proof events** — `/api/v1/proof` → D1 `proof_events` → cron `capability_badges`. Privacy-preserving public proof; coarse-grained capability counter feeding badge derivation.
  - **Wrapper telemetry endpoints** — every `/__shippie/*` writer in `apps/platform/src/lib/server/wrapper/router/` that persists to D1 `analytics_events`. Currently in tree:
    - `/__shippie/analytics` — shell analytics (client-side `apps/platform/src/lib/util/track.ts`: install nudges, PWA launch, viewport mode, keyboard-open-in-tool, SW updates) **and** showcase-iframe wrapper analytics posted via the bridge.
    - `/__shippie/beacon` — sendBeacon-friendly fire-and-forget telemetry (`router/beacon.ts`).
    - `/__shippie/install` — install attribution beacon (`router/install.ts`: `install_a2hs_accepted`, `install_pwa_displayed`, etc.).
    - `/__shippie/handoff` — desktop→mobile handoff intent (`router/handoff.ts`: `handoff_request`).
- **Invariant.** Every event from any source above also lands in the local Trust Ledger as a row tagged `category: 'telemetry-egress'` with a `source` field naming the channel. The user reads the same row Shippie's platform was sent. No exceptions.
- **Central telemetry-egress registry (not just grep).** 5A introduces a typed registry — `apps/platform/src/lib/telemetry/egress-registry.ts` — that names every endpoint and every writer (both client-side and server-side). Each entry: `{channel, endpoint, writer_module, category, mirror_fn}`. The registry is the single source of truth.
  - **Server-side router handlers** in `lib/server/wrapper/router/*.ts` that touch `analytics_events` must register at module-load. The wrapper router refuses to mount an unregistered handler.
  - **Client-side emitters** (`util/track.ts`, any future helper, any `navigator.sendBeacon` call, any dynamically-constructed endpoint) must route through `emitTelemetry(channel, event)` from the registry — direct `fetch`/`sendBeacon` to a Shippie-egress URL is forbidden by lint.
  - **Lint** — a vitest in 5A walks the codebase and asserts: (a) every server handler under `lib/server/wrapper/router/` that imports `analytics_events` is in the registry; (b) every client-side call site touching a known Shippie-egress URL goes through `emitTelemetry`; (c) every registered channel has a `mirror_fn` that writes a ledger row.
  - **Acceptance test** — forces each registered channel end-to-end and verifies a matching `telemetry-egress` ledger row with the correct `source` field. Failing the test blocks merge.
  - **Adding a new telemetry source** is now a registry diff that fails CI until the mirror is also extended. This catches the gaps grep misses: `sendBeacon`, wrapper helper functions, dynamic endpoint construction, server-side route writers.
- **Why this is load-bearing.** This is what makes the Section 5 "no telemetry the user can't read" non-goal **enforceable** rather than aspirational. Without it the non-goal is a promise; with it, it's a test.

**Relationship to the existing cloud Proof events.**
- The Proof spine is fine as it stands — coarse counters intentionally narrow in what they carry. The Trust Ledger does not replace it.
- The Trust Ledger is fine-grained private accounting (what happened on the user's device) layered alongside. The mirror invariant binds them.

**Egress enforcement (not just emission) — scope-honest.**
- Egress accounting can only be **enforced** in iframes Shippie's runtime serves. Today that's apps loaded via `/__shippie-run/<slug>/` — the bundle URL behind every `/run/<slug>/` route and every container iframe load with `?shippie_embed=1`.
- **For Shippie-controlled runtimes**, the 5A enforcement layer makes direct unmediated egress **impossible**:
  - Runtime CSP restricts `connect-src` to bridge-mediated paths (`/__shippie/proxy`, declared first-party intent endpoints, same-origin for the app's own assets).
  - Iframe `sandbox` is set conservatively for the showcase profile (note: `sandbox` is **not** a "no arbitrary network" switch on its own; the load-bearing primitives are CSP + the bridge gate — this roadmap does not claim otherwise).
  - Bridge-side `network.fetch` capability gate rejects unrequested targets.
- **For URL-installed / custom-domain apps** — where `runtime-src.ts` returns an absolute external URL (`apps/platform/src/lib/container/runtime-src.ts:34`) — the iframe runs on a non-Shippie origin and the bridge can only observe what the app declares through the bridge. **The Trust Ledger explicitly marks these apps as `egress_visibility: 'bridge-only'`** so the user knows direct fetches inside that iframe are not enumerable. Bridge-mediated activity is fully accounted; direct iframe egress is acknowledged-gap, not silently-missing.
- **Closing this gap is a Tranche 5 follow-up, not 5A.** Two paths to consider when we get there:
  - **A. Tighten App Kinds.** Container-eligible apps must be Shippie-controlled runtimes — URL-wrap / custom-domain apps would need to be repackaged or routed through a same-origin proxy before they can appear in the container.
  - **B. Live with the gap, surface it loudly.** Keep URL-installed apps container-eligible but show them as `bridge-only` everywhere, including in Settings → Trust, with a maker-side warning at install.

**Out of scope.**
- A Shippie-owned audit-log cloud. Ledger is on-device.
- Per-byte deep packet inspection. Host + byte count + capability is the granularity.

**Dependencies.** None. Builds directly on existing `proof_events` + `capability_badges` substrate. Unblocks Tranche 2 (Settings honesty) and Tranches 3, 4 (primitive trust + fabric accountability). Profile-scoped key derivation is a future *upgrade* when Tranche 4 lands, not a dependency.

**Success criteria (per sub-phase).**

5A — Ledger Core:
- **Durable-commit invariant.** Every capability call from any first-party showcase causes an encrypted ledger entry to be durably committed (IDB write completed) **before** the bridge response resolves to the calling app. No audit row is lost if the page dies immediately after the call returns. User-visible timeline reflects the new row within 3 s nominal (capped by debounce + decryption cost).
- **Failure policy verified.** Forcing each ledger-failure mode (IDB rejected, crypto error, quota exceeded, Vault key unreachable) produces the documented response per policy: fail-closed capabilities return `{ok: false, error: ...}` and surface the user banner; allow-listed fail-open capabilities resolve and emit a `ledger-degraded` row on recovery; Vault key absence triggers the safe-mode handoff; first-launch queue caps hold under flood.
- Open the minimal per-app timeline → see a truthful, complete 24 h log for that app with payload redaction holding (no bodies, no full URLs with query strings).
- Device-key encryption verified: an IndexedDB dump is unreadable without the device's Vault key. (Profile-key partitioning verifies in a 5A follow-up patch after Tranche 4 ships.)
- Retention sweep correctly evicts rows older than the configured budget on next launch.
- **Mirror invariant verified — all sources.** Forcing each known telemetry source (cloud Proof event, shell analytics event, wrapper analytics event) produces both the egress and a matching `telemetry-egress` ledger row with the correct `source`.
- **Egress enforcement verified for Shippie-controlled runtimes.** A showcase loaded via `/__shippie-run/<slug>/` attempting `fetch()` to an undeclared host is blocked by CSP at runtime, not merely flagged at build.
- **Egress visibility marked for URL-installed apps.** A custom-domain or app-subdomain container runtime shows `egress_visibility: 'bridge-only'` in its Trust Ledger header, so the user reads an honest scope statement.

5B — Trust Center + Revokes:
- Revoke `network.fetch` for one app; verify the app's next outbound fetch is rejected by the bridge and the revoke is logged.
- Export → re-import → diff matches.
- Backup mirror opt-in produces an encrypted blob in the user's chosen backup, never on Shippie infrastructure.

5C — Safe Mode + Rollback:
- Force a container update to a known-bad build; verify the rollback channel halts the rollout and the install stays on the pinned version.
- Boot safe mode after simulating container breakage; verify ledger read + restore + rollback all work without the broken container in the path.

**Effort.** 5A: M. 5B: M. 5C: M-L (safe mode is its own small kernel). Whole tranche M-L.

**Why first (and why 5A first).**
1. Highest leverage per LOC — most emit-side hooks are 1-line additions inside an already-instrumented bridge.
2. Uniquely Shippie — no other "OS" does this for the user.
3. Visible launch value the day 5A ships; 5B + 5C compound on top.
4. Unblocks Tranches 2, 3, 4 from having hollow Settings / permissions surfaces.
5. Narrow first slice (5A) avoids the safe-mode + rollback complexity until the core ledger is proven in the field.
6. **Credibility lever.** If the ledger lands, the rest of the OS framing becomes credible instead of merely ambitious — "your apps, accountable to you" stops being a slogan and becomes a row you can read.

---

### Tranche 6 — System Assistant (AI + Agent + Pulse)

**Purpose.** An always-present Shippie assistant that can act across apps via the intent bus. Today `shippie.ai.run` is task-shaped (classify, summarise, sentiment). The agent package has the strategies + runner but no system-level surface.

**Maps to.** AI + Agent (`@shippie/agent`) + Pulse.

**In scope.**
- **Assistant surface.** A persistent UI element (drawer or pill) reachable from anywhere — Today, container chrome, any app via shared gesture.
- **Cross-app action.** "Add what's left of the recipe to my shopping list" works because the assistant translates intent → existing intent bus message → consenting consumer. Permissions: the assistant inherits the user's grants, never escalates.
- **Local-first model.** Default model is the shared local AI (Transformers.js / WebNN). User-held cloud model (OpenRouter, Anthropic, etc. with user's own key in Vault) is opt-in.
- **Agent strategies as system services.** The existing `@shippie/agent` strategies (meal-planning, schedule-awareness, budget-awareness) graduate from per-showcase to system-level, surfaced through Today + the assistant.
- **Ledger-first.** Every assistant action emits a Trust Ledger row.

**Out of scope.**
- A Shippie-hosted LLM. Local AI or user-key only.
- Continuous mic / "wake word". Opt-in voice input via Tranche 3's shared Voice primitive.

**Dependencies.**
- Tranche 5 (Trust Ledger) for action accountability — load-bearing for the assistant's ledger-first invariant.
- Tranche 2 (Today + Settings) for surfaces.
- Tranche 3 (shared Voice) for voice input — required only for the voice-flavoured assistant.
- Tranche 4 (Identity & Device Fabric) for cross-device assistant work (acting from your tablet on data that lives on your phone) — required only for the cross-device flavour. A single-device, text-input assistant can ship with just 2, 3, 5.

**Success criteria.**
- Assistant can take a 3-step cross-app action (e.g. "schedule a 30-min cook of [recipe] for tomorrow 7pm, add missing pantry items to shopping list") with each step traceable in the ledger.
- Works fully offline on the local model for a documented set of action types.
- Voice-doc invariants honoured (no "broken", no "failed", agency stays with the user).

**Effort.** L. Surface + glue is medium; making it good is hard.

---

## 4. Dependency graph + sequencing

```
                                Tranche 5
                              (Trust Ledger)
                              /     |      \
                             /      |       \
                            v       v        v
                   Tranche 2     Tranche 3   Tranche 4
                  (Surfaces)    (Primitives) (Identity)
                          \       |        /
                           \      |       /
                            v     v      v
                            Tranche 6
                           (Assistant)


            Tranche 1 (Multitasking)  →  independent; can ship any time
                                         (Tranche 3 Reminders wants it,
                                          but degrades gracefully without)
```

**Recommended ship order.**

1. **Tranche 5 — Trust Ledger** (M-L, ~2-3 commit phases).
2. **Tranche 2 — System Surfaces** (L, parallelisable into Spotlight / Share / Notifications / Settings).
3. **Tranche 1 — Multitasking** (L, can run in parallel with Tranche 2 once Trust Ledger lands — different surface area).
4. **Tranche 3 — Shared Primitives** (L, the six primitives can land in any order; Files + Contacts first to unlock the most existing showcase consolidation).
5. **Tranche 4 — Identity & Device Fabric** (XL, the most genuinely-new substrate; needs Tranche 5 in place first).
6. **Tranche 6 — System Assistant** (L on top of all of the above).

Rough horizon: Tranches 5 + 2 are weeks. Tranches 1, 3, 6 are months. Tranche 4 is a quarter or more (Spark + profiles).

---

## 5. Non-goals (load-bearing — defend against scope gravity)

> "OS" is permission-shaped vocabulary. Internally it sharpens what we're building; in scope reviews and stakeholder conversations it can quietly authorise everything. These non-goals exist to keep the roadmap from drifting into them. **Treat every proposal to violate one as a thesis change, not a routine call.**

- **No Shippie account.** Identity is device + paired-device fabric + user-held cloud. There is never a "log in to Shippie" step.
- **No Shippie-owned user-data store.** Trust Ledger lives on-device. Backups are user-held cloud or Hub.
- **No native mobile shell.** PWA + container + Hub. If the OS underneath improves PWA capability (background tasks, file system access, BLE), we benefit; we don't fork.
- **No Vercel, no third-party CDN.** Cloudflare-only. AI runtime self-hosted via `/__esm/`. Backup providers are user's chosen drive, not Shippie's.
- **No app store gatekeeping.** Multi-path distribution stays. Marketplace curates first-party demos; third-party apps install by URL or invite.
- **No telemetry the user can't read.** Every Shippie-originated telemetry source — cloud Proof events, shell analytics, wrapper analytics, any future class — also lands as a row in the device's Trust Ledger via the mirror invariant in Tranche 5. Adding a new telemetry source requires extending the mirror; enforced by lint + test in 5A.
- **No "we are replacing iOS / Android" claim.** Public copy never positions Shippie as a replacement OS. We are a local-first app environment that makes web apps feel like a coherent personal system, running on top of whatever OS the user has.

---

## 6. What stays unchanged

- **Wrap. Run. Connect.** is still the public story.
- **Public copy stays grounded.** "OS" is internal vocabulary; never say "Shippie OS" or "we are replacing iOS / Android" in user-facing copy, marketing, or any external surface. Use "local-first app environment", "your apps running together on your device", "private system layer for web apps". Never make claims (background execution, lock screen, radios, app-store semantics, native APIs) we cannot meet.
- The nine internal components (Shell / Boost / Sense / Core / AI / Vault / Pulse / Spark / Hub) plus cross-cutting Proof remain the engineering vocabulary.
- `apps/platform/` is the kernel. `apps/showcase-*/` are userland. `services/hub/` is the edge node.
- `bun run health` (typecheck + test + build) remains the green-light gate. Every tranche keeps it green.
- **Voice-doc invariants are user-facing only.** Showcase UI, assistant output, public copy, and any text the user reads obey the no-"broken" / no-"failed" / agency-stays-with-the-user rules. Internal docs, success criteria, and engineering language use whatever vocabulary is clearest, including "fail", "broken", or "error" where they describe a test scenario, a code path, or an enforcement condition.

---

## 7. Open questions to resolve during each tranche's spec

These don't block the roadmap, but each surfaces real decisions when its tranche is brainstormed:

- **Ledger retention UI + indefinite semantics.** Default (30 d on-device, user-controllable rotation) is decided in Tranche 5 invariants. Open: the surface design for the rotation control, and the precise semantics of "backup-pinned indefinite" — does it pin last-N rows globally, last-N per source, or unbounded? Affects the Trust Center disk-usage display.
- **Spotlight schema.** Do apps publish flat documents or structured records? (FTS5 prefers flat; intents want structured.)
- **Notification routing.** Does the user write rules, or does the agent infer them?
- **Profile boundary.** Is it a separate IndexedDB origin, or a key-prefixed namespace? (Implications for browser eviction granularity.)
- **Device fabric attestation.** How does device A trust that the QR-paired device B is still the same device B six months later? (Possible answer: device key in Vault, re-attested on every pair-mesh handshake.)
- **Assistant action authority.** Does the assistant always confirm before a cross-app write, or are some actions implicitly authorised by an existing intent grant?

---

## 8. Next step

The user picked **roadmap-first** in the brainstorm. After review of this doc, the next move is to brainstorm **Tranche 5A — Ledger Core** into a real design spec via the standard `docs/superpowers/specs/YYYY-MM-DD-*-design.md` flow, then a plan, then implementation. 5B (Trust Center + Revokes) and 5C (Safe Mode + Rollback) get their own specs only after 5A is proven in the field.

If during review the picked first-spec changes (e.g. you want Tranche 2 first because the user-visible win matters more on launch), the recommendation is portable — every tranche has a self-contained spec scope.
