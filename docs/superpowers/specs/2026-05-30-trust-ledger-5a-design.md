# Trust Ledger 5A — Ledger Core (Design Spec)

> **Status:** Draft v1, 2026-05-30. First spec under the Shippie OS roadmap (`docs/superpowers/plans/2026-05-30-shippie-os-roadmap.md`, Tranche 5A). Internal scope only.
>
> **Goal:** Ship the minimum honest Trust Ledger: every capability call is durably committed as an encrypted on-device row before the bridge response resolves; every Shippie-originated telemetry source is mirrored locally via a central registry that lint enforces; a minimal per-app timeline is viewable; egress is enforced on Shippie-controlled runtimes. 5B (Trust Center + Revokes) and 5C (Safe Mode + Rollback) are out of scope.

---

## 1. In-scope artefacts

| Artefact | Location | Purpose |
|---|---|---|
| Ledger package | `packages/trust-ledger/` (new workspace) | Row schema, encryption, IDB adapter, redaction, retention, in-memory queue, public emit API. |
| Bridge integration | `packages/container-bridge/src/index.ts` (extend) | `onCommitLedger` lifecycle hook on `ContainerBridgeHost` so emit happens before response resolves. |
| Container wiring | `apps/platform/src/lib/container/bridge-handlers.ts` + container page | Pass a `LedgerEmitter` into bridge host construction. |
| Telemetry egress registry | `apps/platform/src/lib/telemetry/egress-registry.ts` (new) | Single source of truth for Shippie-originated telemetry channels + their mirror functions. |
| Shell analytics rewiring | `apps/platform/src/lib/util/track.ts` (edit) | Routes through `emitTelemetry()` from the registry instead of direct fetch. |
| Server router gates | `apps/platform/src/lib/server/wrapper/wrap-worker.ts` (or equivalent mount) | Refuses to mount an unregistered `analytics_events` writer. |
| Runtime CSP | `apps/platform/src/hooks.server.ts` + `apps/platform/src/routes/__shippie-run/...` | Set `content-security-policy` `connect-src` allow-list on Shippie-controlled runtime responses. |
| Per-app timeline UI | `apps/platform/src/routes/__shippie/trust/[slug]/+page.svelte` (new) | Read-only IDB → timeline render. SSR shell + client hydrate. |
| Lint test | `apps/platform/src/lib/telemetry/registry.test.ts` | Asserts every analytics_events writer is registered + every registered channel has `mirror_fn`. |
| Acceptance test | `apps/platform/src/lib/trust-ledger/acceptance.test.ts` | Forces each capability + each telemetry source end-to-end and verifies the ledger row. |

**Not in this spec:** Trust Center cross-app surface (5B), revoke / rotation controls (5B), backup mirror (5B), safe mode / rollback (5C), profile-scoped keys (waits on Tranche 4), URL-installed apps deep enforcement (acknowledged gap, marker only).

---

## 2. Row schema

Single table, one row per capability call **and** one row per outgoing telemetry event.

```ts
// packages/trust-ledger/src/types.ts
export interface LedgerRow {
  id: string;                    // ULID — sortable by time, collision-resistant
  ts: number;                    // ms since epoch, client clock at call site
  app: string;                   // app slug ('__shippie_shell__' for platform-originated)
  capability: string;            // 'intent.provide' | 'network.fetch' | 'telemetry-egress' | ...
  category: LedgerCategory;      // 'capability' | 'telemetry-egress' | 'ledger-internal'
  source?: string;               // for telemetry-egress: 'cloud-proof' | 'shell-analytics' | 'wrapper-analytics' | 'beacon' | 'install-attribution' | 'handoff'
  summary: string;               // human-readable redacted summary (≤120 chars)
  target_host?: string;          // for network.fetch / telemetry-egress: hostname only, no path/query
  bytes_in?: number;             // response bytes (network.fetch) or 0 (intent.provide)
  bytes_out?: number;            // request bytes
  egress_visibility?: 'full' | 'bridge-only'; // 'bridge-only' for URL-installed apps
  outcome: 'ok' | 'fail-closed' | 'fail-open-degraded' | 'denied';
}

export type LedgerCategory = 'capability' | 'telemetry-egress' | 'ledger-internal';
```

Storage: one IDB object store `ledger_rows`, keyPath `id`, indexes on `ts`, `app`, and `[app, ts]`.

Storage entry on disk: `{id, ts_bucket, ciphertext, iv}` where `ts_bucket = floor(ts / 3600000)` enables fast retention sweep without decrypting; everything else is encrypted.

---

## 3. Crypto

### 3.1 Device key

5A uses a single per-device key derived from Vault material. Profile-scoped keys upgrade in a follow-up patch when Tranche 4 lands.

```ts
// packages/trust-ledger/src/crypto.ts
export interface LedgerKey {
  readonly id: string;        // 'device-v1' (versioned for future profile-scoped upgrade)
  readonly key: CryptoKey;    // non-extractable AES-GCM 256
}

export async function deriveDeviceLedgerKey(vaultSeed: Uint8Array): Promise<LedgerKey>;
```

Derivation: HKDF-SHA-256 over `vaultSeed` with info `'shippie/trust-ledger/device-v1'`, output 32 bytes, imported as non-extractable AES-GCM key.

`vaultSeed` comes from `getOrCreateDeviceSeed()` (new helper in `packages/session-crypto`) — 32 CSPRNG bytes persisted in IDB under a known key on first launch, never exported. **5A spec lock-down:** persisted as a plain IDB row under a separate object store `vault_seed` so a future profile-scoped Vault can replace it without ledger schema migration.

### 3.2 Envelope per row

```ts
// packages/trust-ledger/src/crypto.ts
export async function encryptRow(key: LedgerKey, row: LedgerRow): Promise<EncryptedRow>;
export async function decryptRow(key: LedgerKey, env: EncryptedRow): Promise<LedgerRow>;

export interface EncryptedRow {
  id: string;             // mirrors row.id for store keyPath
  ts_bucket: number;      // mirrors floor(row.ts / 3600000)
  iv: Uint8Array;         // 12 bytes, fresh per row
  ciphertext: Uint8Array; // AES-GCM of JSON(row)
  key_id: string;         // 'device-v1' so a re-key cycle can decrypt old rows
}
```

A dumped IDB snapshot reveals only `{id, ts_bucket, iv, ciphertext, key_id}` per row — capability, app slug, byte counts, target host are all inside the ciphertext.

---

## 4. Redaction rules (load-bearing)

Applied **before** encryption. The redactor is pure and unit-tested independently.

```ts
// packages/trust-ledger/src/redact.ts
export function redactCapabilityCall(
  capability: string,
  payload: unknown,
  result: unknown,
): { summary: string; target_host?: string; bytes_in?: number; bytes_out?: number };
```

| Capability | Summary rule | Other fields |
|---|---|---|
| `intent.provide` | `provide ${intent} (${rows.length} rows)` | bytes_out = `JSON.stringify(payload).length` |
| `intent.consume` | `consume ${intent} (${result.rows.length} rows)` | bytes_in = serialised result length |
| `network.fetch` | `fetch ${target_host} (${status})` | target_host = hostname, bytes_in/out = response/request sizes |
| `ai.run` | `ai.${task} (${result.source})` | bytes_out = input length, bytes_in = output length |
| `share.send` | `share to ${target_kind}` (no recipient names) | bytes_out only |
| `contacts.read` | `contacts.read (${fields.join(',')})` | no body |
| `calendar.write` | `calendar.write (${eventCount} events)` | no body |
| `data.transferDrop` | `transferDrop ${kind} → ${target_slug}` | bytes_out for payload size |
| `system.crossDb.query` | `crossDb ${rows.length} rows from ${source_slug}` | bytes_in |
| `db.insert` / `db.query` / `storage.getUsage` | `${capability} (${table})` | no body |
| Telemetry egress | `${event_name}` (event name only, no properties) | target_host = endpoint host, bytes_out = payload size |

Anything not in this list defaults to `capability` as the summary with no body fields. Adding a new capability requires extending the redactor.

**Hard rule:** the redactor receives the raw payload but only ever returns the summary record above. No raw body bytes ever cross into a ledger row.

---

## 5. Public API

```ts
// packages/trust-ledger/src/index.ts
export interface Ledger {
  /** Durably commit a row. Resolves only after IDB write completes. */
  commit(row: LedgerRow): Promise<void>;

  /** Read rows for an app, newest first. */
  readApp(app: string, opts?: { since?: number; limit?: number }): Promise<LedgerRow[]>;

  /** Read recent telemetry-egress rows across all apps. */
  readTelemetry(opts?: { since?: number; limit?: number }): Promise<LedgerRow[]>;

  /** Drop rows whose ts < cutoffTs. Returns count deleted. */
  sweepRetention(cutoffTs: number): Promise<number>;

  /** Export all rows as plain JSON (for user-driven export). */
  exportAll(): Promise<LedgerRow[]>;

  /** Irrevocable wipe. Returns count deleted. Emits a single ledger-internal 'wipe' row first. */
  wipe(): Promise<number>;
}

export interface LedgerOptions {
  key: LedgerKey;
  retentionMs?: number;            // default 30 days
  /** Inject for tests; defaults to globalThis.indexedDB. */
  idbFactory?: IDBFactory;
}

export function createLedger(options: LedgerOptions): Promise<Ledger>;
```

**Singleton management** lives in the container (not the package): a `getLedger()` resolver at `apps/platform/src/lib/trust-ledger/host.ts` caches the open Ledger per device-key generation.

---

## 6. Durable-commit lifecycle hook

Extend `ContainerBridgeHost` (in `packages/container-bridge/src/index.ts`) with an `onCommitLedger` option:

```ts
export interface BridgeHostOptions {
  // ... existing fields
  /**
   * Called for every handled bridge request, BEFORE the response is posted.
   * The returned promise MUST resolve before the host posts the response.
   * If the promise rejects, the host posts an error response per the
   * failure policy (see §7) instead of the original result.
   */
  onCommitLedger?: (event: BridgeLedgerEvent) => Promise<void>;
}

export interface BridgeLedgerEvent {
  request: BridgeRequest;
  capability: BridgeCapability;
  method: string;
  payload: unknown;
  outcome: 'ok' | 'denied' | 'handler_error';
  result?: unknown;             // for ok
  errorCode?: string;           // for denied / handler_error
  durationMs: number;
}
```

`onMessage` is modified to `await onCommitLedger(...)` after the handler resolves (or rejects) and before `transport.post(response)`. If commit rejects:

- For capabilities in the **fail-open allow-list** (§7), the original result is still posted; the commit failure is queued as a `ledger-degraded` event and retried on the next successful commit.
- For all other capabilities, the host posts `{ok: false, error: {code: 'ledger-unavailable', message}}` instead of the result. The handler's side effects already happened (we have no rollback story for arbitrary handlers), but the caller receives a failure so the user banner can fire and the action is presented as "paused for safety, retry pending."

**Container wiring:** `apps/platform/src/lib/container/+page.svelte` (or wherever ContainerBridgeHost is constructed today) injects `onCommitLedger: (e) => emitFromBridgeEvent(e, ledger, ctx)`.

---

## 7. Failure policy

Implemented in `packages/trust-ledger/src/policy.ts` and consumed by the bridge wrapper.

### 7.1 Fail-open allow-list (5A frozen)

Only these capabilities may complete on ledger commit failure:

- `ai.run` when the request input has no `egress` flag (purely on-device inference)
- `db.query`, `db.list`, `storage.getUsage` (pure reads)
- `intent.consume` when the consumer is reading a cached/already-broadcast row (no fresh provider invocation)

Every other capability fails closed. A `ledger-degraded` event is emitted via the in-memory queue and committed (with `outcome: 'fail-open-degraded'`) on the next successful ledger init or commit.

### 7.2 Failure modes + responses

| Failure | Response |
|---|---|
| IDB write rejected (transient) | Retry once after 50 ms; on second failure, fail per allow-list policy. |
| IDB write rejected (quota) | Trigger retention sweep immediately (drop everything older than `retentionMs / 2`); retry once; if still failing, fail closed and surface the user prompt. |
| Crypto error | Fail closed always (we cannot keep the redaction invariant without crypto). |
| Vault key unreachable | Fail closed always. Bridge response `error.code = 'key-unavailable'`. Container surfaces a banner with a `safe.shippie.app` (or `?safe=1`) link, which 5A wires up as a placeholder route returning a minimal "ledger init failed" page even before 5C ships the full safe-mode shell. |
| Pre-init (first launch, before ledger ready) | Calls are queued in memory with `cap_n = 256` and `timeout_t_ms = 30_000`. On ledger init complete, batch-flush in arrival order. Overflow (queue full or timer expired) → fail-closed responses for everything currently in flight; subsequent calls block until init finishes. |

### 7.3 Banner copy (5A frozen)

```
Trust Ledger could not record this action — paused for safety. Open Safe Mode →
```

The "Open Safe Mode" link is `/?safe=1` for 5A. The full safe-mode shell lands in 5C; 5A's placeholder route shows the user the failure detail and a "retry init" button.

### 7.4 Stuck-loop guard

If the bridge has posted 5 consecutive `ledger-unavailable` responses inside 60 s for the same app, the container forces the failure banner to a modal that requires user acknowledgement before further bridge calls. This stops a hostile or buggy app from spamming the user with toast banners.

---

## 8. Mirror invariant — telemetry egress registry

### 8.1 Registry shape

```ts
// apps/platform/src/lib/telemetry/egress-registry.ts
export interface TelemetryChannel {
  channel: 'cloud-proof' | 'shell-analytics' | 'wrapper-analytics' | 'beacon' | 'install-attribution' | 'handoff';
  endpoint: string;                 // request URL, may include path
  writer_module: string;            // file path of the writer (for lint to verify)
  category: 'capability-counter' | 'product-telemetry' | 'install-attribution' | 'handoff-intent';
  mirror_fn: (event: TelemetryEvent) => LedgerRow;
}

export interface TelemetryEvent {
  channel: TelemetryChannel['channel'];
  event_name: string;
  app?: string;                     // null/__shippie_shell__ for platform-originated
  payload_bytes: number;            // request body length
  target_host: string;              // hostname of endpoint
}

export const TELEMETRY_CHANNELS: readonly TelemetryChannel[];

export function emitTelemetry(event: TelemetryEvent): Promise<void>;
```

### 8.2 Initial registrations

| channel | endpoint | writer_module |
|---|---|---|
| `cloud-proof` | `https://shippie.app/api/v1/proof` | `packages/sdk/src/wrapper/proof.ts` |
| `wrapper-analytics` | `/__shippie/analytics` | `apps/platform/src/lib/server/wrapper/router/analytics.ts` |
| `shell-analytics` | `/__shippie/analytics?slug=__shippie_shell__` | `apps/platform/src/lib/util/track.ts` |
| `beacon` | `/__shippie/beacon` | `apps/platform/src/lib/server/wrapper/router/beacon.ts` |
| `install-attribution` | `/__shippie/install` | `apps/platform/src/lib/server/wrapper/router/install.ts` |
| `handoff` | `/__shippie/handoff` | `apps/platform/src/lib/server/wrapper/router/handoff.ts` |

### 8.3 Enforcement

Three layers:

1. **`emitTelemetry` is the only client-side path.** `util/track.ts` no longer calls `fetch` directly; it calls `emitTelemetry({channel: 'shell-analytics', ...})` which (a) writes the ledger row, (b) posts to the endpoint via the existing path. Sequence: ledger write succeeds → endpoint fetch is fired. If ledger write fails, the fetch is also dropped (mirror invariant — if we can't log it, we don't send it).
2. **Server-side router refuses unregistered handlers.** The wrap-worker mount function imports `TELEMETRY_CHANNELS` and asserts every handler under `/lib/server/wrapper/router/` that touches `analytics_events` matches a registered `writer_module`. New handler not in the registry → mount throws on boot, surfaced as a vitest failure before the worker ships.
3. **Lint test** at `apps/platform/src/lib/telemetry/registry.test.ts`:
   - Greps the codebase for `db.insert(schema.analyticsEvents` and asserts every match's containing file is a registered `writer_module`.
   - Greps for `fetch(...)` / `navigator.sendBeacon(...)` calls whose target matches a known Shippie-egress URL pattern, and asserts the calling module is the writer for that channel (i.e. the registered file owns the egress).
   - Asserts every channel has a `mirror_fn` and the function produces a row that round-trips through the redactor without error.

### 8.4 Acceptance test

`apps/platform/src/lib/trust-ledger/acceptance.test.ts`:

For each registered channel, simulate a write (call `emitTelemetry` or invoke the server handler directly with a fake event) and assert a matching `telemetry-egress` row appears in the ledger with `source = channel`, `target_host` matching the endpoint host, `bytes_out` matching the payload size.

---

## 9. Egress enforcement (Shippie-controlled runtimes)

### 9.1 CSP

`apps/platform/src/hooks.server.ts` (or the route-level hook) sets, on every response for paths matching `/run/<slug>/`, `/__shippie-run/<slug>/`, and the apex container shell:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https:;
  connect-src 'self' /__shippie/* /__esm/* https://shippie.app https://*.shippie.app;
  frame-src 'self' https://*.shippie.app;
  frame-ancestors 'self' https://shippie.app https://*.shippie.app;
```

The `connect-src` restriction keeps showcase iframes from issuing fetches to arbitrary external hosts. Outbound traffic must route via `/__shippie/proxy` (already wired) or one of the registered telemetry endpoints. Showcases that legitimately need external hosts declare them in `shippie.json` `connect_hosts: []`; the runtime CSP header for that slug is widened by the wrap-worker.

**Caveat acknowledged in the doc and the egress-enforcement test:** iframe `sandbox` does not provide a "no arbitrary network" switch on its own. The load-bearing primitive is CSP + the bridge `network.fetch` gate. Both must be present; either alone is insufficient.

### 9.2 Bridge `network.fetch` gate

Already-present capability gate in `assertCapabilityAllowed` is extended in 5A to read the allowed-host list from the showcase's permissions and reject `network.fetch` calls whose target host is not in the list. The CSP and the bridge gate use the same source of truth (`shippie.json connect_hosts`).

### 9.3 URL-installed apps

When `resolveRuntimeSrc` returns an absolute external URL (`runtime-src.ts:34`), the ledger row created for any bridge call from that iframe carries `egress_visibility: 'bridge-only'`. The per-app timeline (§10) shows a header banner: "This app runs on its own origin (`<host>`). Shippie can record what passes through the bridge; activity that stays inside the app is not enumerable here."

5A does not propose retiring URL-installed apps; that decision is deferred to a follow-up.

---

## 10. Minimal per-app timeline UI (5A only)

Route: `/__shippie/trust/[slug]/+page.svelte`. SSR returns a shell + the slug; client hydrates and reads the ledger via the singleton.

Layout:

```
┌────────────────────────────────────────────────────┐
│ Trust Ledger — <App Name>                          │
│ [bridge-only badge if applicable]                  │
│                                                    │
│ Last 24 h                                          │
│ ───────────────────────────────                    │
│ 14:23  intent.provide cooked-meal (3 rows)         │
│ 14:01  network.fetch palate.app (4.2 KB)           │
│ 13:48  ai.run classify (local)                     │
│ ...                                                │
│                                                    │
│ [Export this app's rows as JSON]                   │
└────────────────────────────────────────────────────┘
```

Pure read; no revoke buttons (that's 5B). One Svelte component, one CSS block tied to existing tokens, fully SSR-safe (server returns the chrome, IDB load only after hydration).

Linked from the Your Data panel (existing `your-data-panel.ts`) as "View trust ledger" when the panel is open for that app.

---

## 11. Retention

`apps/platform/src/lib/trust-ledger/sweep.ts` registers a `requestIdleCallback` (with `setTimeout` fallback) on container boot:

```ts
const cutoffTs = Date.now() - retentionMs;
const deleted = await ledger.sweepRetention(cutoffTs);
emitTelemetry({channel: 'shell-analytics', event_name: 'ledger_retention_swept', payload_bytes: 0, target_host: 'localhost'});
```

Default `retentionMs = 30 * 24 * 3600 * 1000`. User-controllable via `localStorage['shippie.trust-ledger.retention-ms']` for 5A; the UI control lands in 5B.

Sweep uses the `ts_bucket` index — no decryption needed to identify rows past the cutoff.

---

## 12. Test surface

### 12.1 `packages/trust-ledger/src/*.test.ts` (bun:test, package-local)

- `crypto.test.ts` — round-trip encrypt/decrypt, key derivation determinism, IV freshness.
- `redact.test.ts` — every capability in the table (§4) produces the expected summary; arbitrary payloads never leak into the row.
- `ledger.test.ts` — commit/read round-trip, sweep removes only old rows, wipe is irrevocable + leaves the wipe row, queue flushes in order.
- `policy.test.ts` — allow-list capabilities fail-open with `ledger-degraded` enqueued; non-allow-list fail-closed; quota → sweep → retry → fail-closed path; stuck-loop guard fires at 5/60s.

### 12.2 `apps/platform/src/lib/trust-ledger/*.test.ts` (vitest)

- `host.test.ts` — singleton caches; container resolves the same instance across handlers.
- `acceptance.test.ts` — every registered channel + every bridge capability produces a matching ledger row (durable-commit invariant).
- `bridge-integration.test.ts` — bridge response includes the result only after the ledger row is durably committed (verified by spying on commit + post order).

### 12.3 `apps/platform/src/lib/telemetry/registry.test.ts` (vitest)

- Asserts every analytics_events writer file is registered.
- Asserts no client-side `fetch`/`sendBeacon` to a Shippie-egress endpoint outside the registered writer module.
- Asserts every channel's `mirror_fn` produces a valid row.

### 12.4 `apps/platform/src/lib/container/csp.test.ts` (vitest)

- Asserts the CSP header is present on `/run/*`, `/__shippie-run/*`, container shell responses.
- Asserts `connect-src` excludes arbitrary external hosts and includes only the allow-listed set + the showcase's declared `connect_hosts`.
- Asserts a simulated showcase fetch to an undeclared host is rejected by the bridge gate even if it bypassed CSP.

---

## 13. Migration / rollout

5A is additive — no existing capability behaviour changes except that responses now block on a ~1-5 ms ledger commit per call.

- First-launch carve-out (§7.2) prevents a cold-boot stampede.
- `vault_seed` IDB row is self-healing: if missing, one is generated on first read.
- No D1 migration required — the ledger is purely on-device.
- No new Cloudflare bindings required.

If the ledger init fails persistently on a real device, the user lands on the placeholder safe-mode route (§7.3) and can clear local storage to reset. 5C will replace this with the proper recovery shell.

---

## 14. Non-goals (5A)

- Trust Center cross-app dashboard (5B).
- Per-row revoke controls (5B).
- Backup mirror (5B).
- Safe-mode shell with revoke + restore + rollback (5C).
- Container rollback channel (5C).
- Profile-scoped key partitioning (Tranche 4).
- Retiring URL-installed apps to close the bridge-only gap (Tranche 5 follow-up).
- Building the ledger UI's rotation control (5B).
- Encrypting telemetry-egress endpoint payloads (the endpoint already has TLS; the ledger captures hashes/sizes only).

---

## 15. Open questions deferred to implementation

These are small enough that the implementer picks the answer with a sentence of justification in the commit message:

- Exact `requestIdleCallback` polyfill choice (likely none — `setTimeout(cb, 0)` is fine).
- ULID vs UUIDv7 for `id` (ULID — sortable, smaller).
- Whether the `ledger-internal` rows for sweep/wipe count toward retention (no — they're audit, never swept).
- Whether `stuck-loop guard` modal copy follows voice-doc invariants (yes — "Trust Ledger needs attention" not "broken").

---

## 16. Acceptance

5A is complete when:

1. Every capability handled by `ContainerBridgeHost` causes a durably-committed encrypted ledger row before the response resolves.
2. The redactor refuses to write any payload body bytes into a row.
3. Forcing each failure mode produces the documented response per §7.
4. The telemetry egress registry covers all six currently-in-tree sources; the lint test passes; the acceptance test verifies each channel mirrors locally.
5. CSP is present on Shippie-controlled runtimes; the egress test verifies an undeclared-host fetch is blocked.
6. URL-installed apps render with the `bridge-only` marker in their timeline.
7. The per-app timeline at `/__shippie/trust/[slug]` renders a truthful 24 h log.
8. `bun run health` is green: typecheck + test + build across all packages.

After 5A ships:

- 5B adds the Trust Center, revokes, export/delete-all UI, backup mirror.
- 5C adds the full safe-mode shell + container rollback channel.
