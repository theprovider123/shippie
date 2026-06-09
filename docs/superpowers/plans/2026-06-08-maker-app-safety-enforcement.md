# Maker App Safety Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the moderation→enforcement loop so a flagged maker app can actually be taken offline in near-real-time, harden the CSP/framing wall at the layer that actually sets it, and add the user-reporting / update-monitoring / transparency surfaces an open platform needs — without adding any friction to the maker upload flow.

**Architecture:** Shippie serves every maker app from R2 on its own subdomain origin (`slug.shippie.app`) via one Worker (`wrapper/dispatcher.ts`). `runAccessGate` runs before wrap proxy, static R2, and `__shippie/*` (dispatcher.ts:100-102) — the right single enforcement point. Today admin "suspend" only writes D1 + `reserved_slugs`; the live app keeps serving because nothing on the serve path checks suspension. We add a **dedicated KV key `apps:{slug}:suspended`** — deliberately separate from `apps:{slug}:meta` so that no deploy writer (`pipeline.ts`, `wrap.ts`, the github `callback`) and not `reconcile-kv` can ever clobber it — and enforce it in `runAccessGate`. CSP/framing is owned by `finalizeWrapperResponse` (dispatcher.ts:254), not the baked `<meta>`; the framing fix lives there plus the static + wrapped CSP builders.

**Tech Stack:** SvelteKit + Cloudflare Workers + D1 (Drizzle) + R2 + KV; `apps/platform` uses **vitest only** (never `bun:test`). Green-light = `bun run health` from repo ROOT (`/Users/devante/Documents/Shippie`).

**Review fixes folded in (from the 2026-06-08 review of v1 of this plan):**
- **P0 (deploy clobbers suspension):** solved structurally by the dedicated `:suspended` key (no deploy writer touches it) + a defense-in-depth deploy-completion guard (Task 1.6).
- **P0 (suspend silently misses KV):** suspend ALWAYS attempts KV enforcement, fails loudly if KV is unavailable, and re-applies on a D1 no-op (Task 1.5).
- **P1 (Phase 2 wrong layer):** rewritten around `finalizeWrapperResponse` + the static/wrapped CSP builders.
- **P1 (X-Frame-Options blocks Dock):** Task 2.1 removes `x-frame-options: DENY` for runtime responses and relies on `frame-ancestors`.
- **P1 (patchAppMeta fragile):** no longer used for the kill switch; the `:suspended` key is presence-based (no `JSON.parse`).
- **Product decision (settled):** unarchive = **full reinstatement** — clears `:suspended` AND releases the `reserved_slugs` hold so the maker can redeploy. Permanent bans = leave it suspended.

**Pre-flight (collision-branch safety — do once):**
- Branch is the Codex-collision branch `feat/dock-harmonization`. Build in the main tree but stage files **explicitly** (never `git add -A`) and re-check `git log`/HEAD before each commit. If HEAD moves unexpectedly, surface it.
- `cd apps/platform && bun run db:migrate:local` once so D1 is seeded.
- `frame-ancestors` value used throughout: `'self' https://shippie.app https://www.shippie.app https://next.shippie.app` (the Dock/platform hosts from `wrapper/routing.ts` PLATFORM_HOSTS; NO wildcard — prevents app-frames-app clickjacking). Define once as a constant.

---

## Phase 1 — Real-time suspension kill switch (P0)

**Outcome:** Suspending an app (dmca / policy_violation / spam) takes it offline at its subdomain within KV-propagation + 30s, across static *and* wrap serve paths *and* `__shippie/*` endpoints, and a deploy completing afterward cannot resurrect it. Unarchiving fully reinstates. KV failure during suspend is surfaced loudly, never silently swallowed.

### Task 1.1: Dedicated suspension KV helpers

**Files:**
- Modify: `apps/platform/src/lib/server/deploy/kv-write.ts` (add helpers; key doc block at lines 5-13)
- Test: `apps/platform/src/lib/server/deploy/kv-write.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { writeSuspension, clearSuspension, readSuspension } from './kv-write';

function fakeKv(data: Record<string, string> = {}): KVNamespace {
  return {
    get: (k: string) => Promise.resolve(data[k] ?? null),
    put: async (k: string, v: string) => { data[k] = v; },
    delete: async (k: string) => { delete data[k]; },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

describe('suspension KV helpers', () => {
  test('write → read returns suspended with reason', async () => {
    const kv = fakeKv();
    await writeSuspension(kv, 'bad', 'spam');
    expect(await readSuspension(kv, 'bad')).toEqual({ suspended: true, reason: 'spam' });
  });
  test('absent key → not suspended', async () => {
    expect(await readSuspension(fakeKv(), 'clean')).toEqual({ suspended: false, reason: null });
  });
  test('clear removes the flag', async () => {
    const data: Record<string, string> = {};
    const kv = fakeKv(data);
    await writeSuspension(kv, 'x', 'dmca');
    await clearSuspension(kv, 'x');
    expect(await readSuspension(kv, 'x')).toEqual({ suspended: false, reason: null });
  });
  test('empty/garbage value still counts as suspended (fail-closed)', async () => {
    const kv = fakeKv({ 'apps:y:suspended': '' });
    expect((await readSuspension(kv, 'y')).suspended).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd /Users/devante/Documents/Shippie/apps/platform && bunx vitest run src/lib/server/deploy/kv-write.test.ts`
Expected: FAIL — helpers don't exist.

- [ ] **Step 3: Implement the helpers**

Append to `kv-write.ts`. Note: presence-based, no `JSON.parse` — a corrupt/empty value still reads as suspended (fail-closed for a kill switch):

```ts
/**
 * Suspension flag — `apps:{slug}:suspended`. Deliberately a SEPARATE key
 * from :meta so deploy writers (pipeline/wrap/callback) and the
 * reconcile-kv cron — all of which rewrite the whole :meta blob — can
 * never clear it. Presence = suspended; the value carries the reason.
 * Read is presence-based (no JSON.parse) so a corrupt value fails closed.
 */
export async function writeSuspension(
  kv: KVNamespace,
  slug: string,
  reason: string | null,
): Promise<void> {
  await kv.put(`apps:${slug}:suspended`, reason ?? 'suspended');
}

export async function clearSuspension(kv: KVNamespace, slug: string): Promise<void> {
  await kv.delete(`apps:${slug}:suspended`);
}

export async function readSuspension(
  kv: KVNamespace,
  slug: string,
): Promise<{ suspended: boolean; reason: string | null }> {
  const raw = await kv.get(`apps:${slug}:suspended`);
  if (raw === null || raw === undefined) return { suspended: false, reason: null };
  return { suspended: true, reason: raw === '' ? null : raw };
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/server/deploy/kv-write.ts apps/platform/src/lib/server/deploy/kv-write.test.ts
git commit -m "feat(safety): dedicated apps:{slug}:suspended KV helpers (presence-based, deploy-proof)"
```

### Task 1.2: Cached `loadSuspension` loader on the hot path

**Files:**
- Modify: `apps/platform/src/lib/server/wrapper/platform-client.ts` (mirror `loadAppMeta`, lines 95-129)
- Test: `apps/platform/src/lib/server/wrapper/platform-client.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { loadSuspension, bustSuspensionCache } from './platform-client';

function fakeKv(data: Record<string, string>): KVNamespace {
  return {
    get: (k: string) => Promise.resolve(data[k] ?? null),
    put: async () => {}, delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

describe('loadSuspension', () => {
  test('reads the dedicated suspended key', async () => {
    bustSuspensionCache('bad');
    const m = await loadSuspension(fakeKv({ 'apps:bad:suspended': 'spam' }), 'bad');
    expect(m.suspended).toBe(true);
  });
  test('absent → not suspended', async () => {
    bustSuspensionCache('ok');
    expect((await loadSuspension(fakeKv({}), 'ok')).suspended).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — add to `platform-client.ts` (reuse `WRAP_TTL_MS`):

```ts
// ────────────────────────────────────────────────────────────────────
// Suspension flag — apps:{slug}:suspended. Read on the hot path by the
// access gate; 30s memo like meta. Presence-based (no JSON parse).
// ────────────────────────────────────────────────────────────────────
export interface SuspensionRuntime { suspended: boolean; reason: string | null; }
interface CachedSuspension { value: SuspensionRuntime; expires: number; }
const suspensionCache = new Map<string, CachedSuspension>();

export async function loadSuspension(kv: KVNamespace, slug: string): Promise<SuspensionRuntime> {
  const hit = suspensionCache.get(slug);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const raw = await kv.get(`apps:${slug}:suspended`);
  const value: SuspensionRuntime =
    raw === null || raw === undefined
      ? { suspended: false, reason: null }
      : { suspended: true, reason: raw === '' ? null : raw };
  suspensionCache.set(slug, { value, expires: now + WRAP_TTL_MS });
  return value;
}

export function bustSuspensionCache(slug: string): void {
  suspensionCache.delete(slug);
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(safety): cached loadSuspension for the access-gate hot path`).

### Task 1.3: Enforce suspension at the top of `runAccessGate`

**Files:**
- Modify: `apps/platform/src/lib/server/wrapper/router/access-gate.ts:18-40` (`AccessGateOpts` + top of `runAccessGate`)
- Test: `apps/platform/src/lib/server/wrapper/router/access-gate.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { runAccessGate } from './access-gate';
import type { WrapperContext } from '../env';

function ctx(url: string): WrapperContext {
  return {
    request: new Request(url, { headers: { host: new URL(url).host } }),
    env: { DB: {} as never, CACHE: {} as never, INVITE_SECRET: 'x' } as never,
    slug: new URL(url).host.split('.')[0],
    traceId: 't',
  } as unknown as WrapperContext;
}

describe('runAccessGate — suspension', () => {
  test('suspended app → 451 takedown, even on __shippie routes', async () => {
    const res = await runAccessGate(ctx('https://bad.shippie.app/__shippie/feedback'), {
      meta: { slug: 'bad', visibility_scope: 'public', suspended: false } as never,
      suspension: { suspended: true, reason: 'spam' },
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(451);
    expect(await res!.text()).toContain('removed');
  });
  test('non-suspended public app → null (passes)', async () => {
    const res = await runAccessGate(ctx('https://ok.shippie.app/'), {
      meta: { slug: 'ok', visibility_scope: 'public' } as never,
      suspension: { suspended: false, reason: null },
    });
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

In `access-gate.ts`, extend `AccessGateOpts`:

```ts
export interface AccessGateOpts {
  meta: AppMetaRuntime | null;
  suspension?: { suspended: boolean; reason: string | null };
}
```

Make it the **first** thing in `runAccessGate` (above the `__shippie/` bypass):

```ts
export async function runAccessGate(
  ctx: WrapperContext,
  opts: AccessGateOpts
): Promise<Response | null> {
  // Enforcement suspension kills the app on ALL paths (static, wrap,
  // __shippie) before any other gate logic. Backed by the dedicated
  // apps:{slug}:suspended KV key, which no deploy writer can clobber.
  if (opts.suspension?.suspended) {
    return new Response(renderSuspended(), {
      status: 451,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  // System routes never go through the gate.
  if (new URL(ctx.request.url).pathname.startsWith('/__shippie/')) {
    return null;
  }
  // ...existing body unchanged...
```

Add `renderSuspended()` near the other `render*` helpers (dark, tokenized, with `hello@shippie.app` appeal):

```ts
function renderSuspended(): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Removed by Shippie</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; background: #14120F; color: #EDE4D3; min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 2rem; }
  .card { max-width: 32rem; text-align: center; }
  .tag { font: 12px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.1em; color: #E8603C; margin-bottom: 1rem; }
  h1 { font-size: 1.6rem; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; color: #B8A88F; }
  a { color: #E8603C; text-decoration: none; }
</style>
<div class="card">
  <p class="tag">shippie.app</p>
  <h1>This app has been removed</h1>
  <p>Shippie took this app offline for violating the platform policy.
     If you're the maker and believe this is a mistake, contact
     <a href="mailto:hello@shippie.app">hello@shippie.app</a>.</p>
  <p><a href="https://shippie.app">Browse live apps →</a></p>
</div>`;
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(safety): enforce suspension takedown (451) in access gate`).

### Task 1.4: Wire `loadSuspension` into the dispatcher

**Files:**
- Modify: `apps/platform/src/lib/server/wrapper/dispatcher.ts:100-102` + import

- [ ] **Step 1: Implement** — add `loadSuspension` to the platform-client import (line ~15) and load+pass it:

```ts
  const meta = await loadAppMeta(env.CACHE, slug);
  const suspension = await loadSuspension(env.CACHE, slug);
  const gated = await runAccessGate(ctx, { meta, suspension });
  if (gated) return finalizeWrapperResponse(gated, ctx);
```

- [ ] **Step 2: Typecheck** (`bun run check` in apps/platform) → 0 errors.
- [ ] **Step 3: Commit** (`feat(safety): load suspension on the dispatch hot path`).

### Task 1.5: Admin suspend/unarchive — always-enforce, fail loud, full reinstatement

**Files:**
- Modify: `apps/platform/src/routes/admin/+page.server.ts` — imports (~line 21) + `setArchived` (lines 219-336)
- Test: `apps/platform/src/routes/admin/page.server.test.ts` (extend)

- [ ] **Step 1: Imports**

```ts
import { writeSuspension, clearSuspension } from '$server/deploy/kv-write';
import { bustSuspensionCache } from '$server/wrapper/platform-client';
```

- [ ] **Step 2: Restructure `setArchived` so KV enforcement is unconditional and not bypassed by the D1 no-op**

The current no-op short-circuit (lines 258-264) returns before any KV work. Move KV enforcement so it runs for suspension/clear **regardless** of the D1 no-op, and surface KV failure as a `fail(...)` (never a silent success). Concretely, replace the no-op return + after-update block with this flow (keeping the existing audit + notify):

```ts
  const cache = event.platform.env.CACHE;
  const isClearingSuspension = !archived && (before.suspensionReason ?? null) !== null;

  // SAFETY: enforcement must reach the live serving layer. For a takedown
  // (or lifting one) we ALWAYS write/clear the dedicated suspended key,
  // even when the D1 row is already in the target state (repairs a missing
  // KV flag), and we fail LOUD if KV is unavailable — a takedown must never
  // look successful while the app stays online.
  if (isSuspension || isClearingSuspension) {
    if (!cache) {
      return fail(503, { error: 'enforcement cache unavailable — app NOT taken offline; retry' });
    }
    try {
      if (isSuspension) await writeSuspension(cache, before.slug, suspensionReason);
      else await clearSuspension(cache, before.slug);
      bustSuspensionCache(before.slug); // local isolate; remote clears on 30s memo
    } catch (err) {
      console.error('[admin.suspend] KV enforcement failed', { slug: before.slug, err });
      return fail(500, { error: 'enforcement write failed — app state uncertain; retry' });
    }
  }

  // D1 no-op: state + reason already match. KV enforcement above has run,
  // so it's safe to return now without re-writing D1 / audit.
  if (
    before.isArchived === archived &&
    (before.takedownReason ?? null) === reason &&
    (before.suspensionReason ?? null) === suspensionReason
  ) {
    return { ok: true, noop: true };
  }

  // ...existing D1 update + recordAudit + notifyMakerOfTakedown unchanged...
```

- [ ] **Step 3: Full reinstatement — release the reserved-slug hold on unarchive**

In the reserved-slugs section (currently the suspension branch ~lines 312-336 that INSERTs into `reserved_slugs`), add the inverse for unarchiving a previously-suspended app. After the existing audit/notify, when `isClearingSuspension`:

```ts
  // Full reinstatement (product decision 2026-06-08): lifting a suspension
  // releases the reserved-slug hold so the maker can fix + redeploy.
  if (isClearingSuspension) {
    try {
      await event.platform.env.DB.prepare('DELETE FROM reserved_slugs WHERE slug = ?')
        .bind(before.slug).run();
    } catch (err) {
      console.warn('[admin.unarchive] reserved_slugs release failed', { slug: before.slug, err });
    }
  }
```

- [ ] **Step 4: Test** — extend `page.server.test.ts` with a `fakeKv` recording `put`/`delete` (pattern from `wrapper/router/files.test.ts:24-36`):
  - suspend (`suspensionReason='spam'`) → `apps:{slug}:suspended` present.
  - suspend when CACHE is `undefined` → returns `fail` (status 503), D1 not silently "ok".
  - re-suspend on an already-suspended D1 row but with the KV key missing → key re-created (no-op D1, KV repaired).
  - unarchive a suspended app → `apps:{slug}:suspended` deleted AND a `DELETE FROM reserved_slugs` issued.

- [ ] **Step 5: Run** (`bunx vitest run src/routes/admin/page.server.test.ts`) → PASS.
- [ ] **Step 6: Commit** (`feat(safety): suspend always enforces in KV + fails loud; unarchive fully reinstates`).

### Task 1.6: Deploy-completion guard (defense-in-depth, P0)

**Files:**
- Modify: `apps/platform/src/lib/server/deploy/pipeline.ts` (in `deployStatic`, before the active-pointer flip ~line 571 area)
- Modify: `apps/platform/src/routes/api/v1/deploy/callback/+server.ts` (~line 132, before it writes meta/active)
- Test: `apps/platform/src/lib/server/deploy/pipeline.test.ts`

**Why:** `reserved_slugs` blocks NEW deploys at preflight, but an in-flight deploy or async github callback could land AFTER a suspension. The `:suspended` key already keeps such an app offline (access-gate still 451s), but we should also refuse to publish a new version of a suspended app.

- [ ] **Step 1: Add a guard helper + check** — before flipping the active pointer / writing meta, read suspension from D1 (authoritative) for the slug; if `isArchived && suspensionReason`, abort:

```ts
// in deployStatic, after the apps row is resolved and before writeActivePointer:
const [enforce] = await db
  .select({ isArchived: schema.apps.isArchived, suspensionReason: schema.apps.suspensionReason })
  .from(schema.apps).where(eq(schema.apps.slug, slug)).limit(1);
if (enforce?.isArchived && enforce.suspensionReason) {
  // Mark the deploy failed; do NOT flip the active pointer.
  throw new DeploySuspendedError(slug); // surfaced as 409 by the API route
}
```

Define `DeploySuspendedError` and have `/api/deploy` + `/api/deploy/trial` + the github callback translate it to a 409 (callback: log + 200-ack without flipping active, so the provider doesn't retry-storm).

- [ ] **Step 2: Test** — `deployStatic` against a fake D1 returning `{ isArchived: true, suspensionReason: 'spam' }` throws `DeploySuspendedError` and never calls `writeActivePointer`.
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Commit** (`feat(safety): refuse to publish a new version of a suspended app`).

### Task 1.7: Full health gate + manual verification

- [ ] **Step 1:** `cd /Users/devante/Documents/Shippie && bun run health` → green. (If red, rule out the pre-existing `@shippie/analyse` showcase-recipe failure noted in CLAUDE.md before assuming it's yours.)
- [ ] **Step 2: Manual (dev)** — `cd apps/platform && bun run dev` (4101), grant local admin, suspend a seeded app from `/admin` with reason `spam`, `curl` its subdomain → expect 451 "removed". Unarchive → serves again (allow ~30s memo or restart dev) AND the slug is redeployable.

---

## Phase 2 — CSP / framing fix at the finalizer (P1)

**Outcome:** `frame-ancestors` (a real response header, set by `finalizeWrapperResponse`) consistently allows the Dock to frame maker apps while denying arbitrary framers; `x-frame-options: DENY` no longer blocks the Dock; static and wrapped CSP builders agree.

**Shared constant** (define once, e.g. top of `dispatcher.ts` or a small `wrapper/csp-frame.ts` imported by all three sites):

```ts
export const PLATFORM_FRAME_ANCESTORS =
  "'self' https://shippie.app https://www.shippie.app https://next.shippie.app";
```

### Task 2.1: Finalizer — fix fallback `frame-ancestors`, drop `x-frame-options: DENY`

**Files:**
- Modify: `apps/platform/src/lib/server/wrapper/dispatcher.ts:270-283`
- Test: `apps/platform/src/lib/server/wrapper/dispatcher.test.ts` (create if absent; or co-locate a finalizer test)

- [ ] **Step 1: Write the failing test** — call `finalizeWrapperResponse(new Response('x'), ctx)` with a `fakeKv` having NO `apps:{slug}:csp`, assert: (a) `Content-Security-Policy` contains `frame-ancestors 'self' https://shippie.app`; (b) `x-frame-options` is **null** (not `DENY`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — change the fallback CSP's `frame-ancestors 'none'` → `${PLATFORM_FRAME_ANCESTORS}`, and **remove** the `x-frame-options: DENY` block (XFO has no cross-origin allow-list; framing is governed by `frame-ancestors`). Keep `x-content-type-options: nosniff` and `referrer-policy`.

```ts
  if (!out.headers.has('content-security-policy')) {
    const appCsp = await ctx.env.CACHE.get(`apps:${ctx.slug}:csp`);
    out.headers.set(
      'content-security-policy',
      appCsp ??
        `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors ${PLATFORM_FRAME_ANCESTORS}; base-uri 'self'`
    );
  }
  if (!out.headers.has('x-content-type-options')) {
    out.headers.set('x-content-type-options', 'nosniff');
  }
  // NOTE: x-frame-options removed — it has no cross-origin allow-list, so
  // DENY blocked the Dock from framing maker apps. frame-ancestors (above)
  // is the framing control and permits only the platform Dock origins.
  if (!out.headers.has('referrer-policy')) {
    out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  }
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`fix(csp): finalizer frame-ancestors allows Dock; drop x-frame-options DENY`).

### Task 2.2: Static `buildCsp` — matching `frame-ancestors`

**Files:**
- Modify: `apps/platform/src/lib/server/deploy/csp.ts:72`
- Test: `apps/platform/src/lib/server/deploy/csp.test.ts`

- [ ] **Step 1: Failing test** — `buildCsp(manifest).header` contains `frame-ancestors 'self' https://shippie.app` (not `'none'`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** change line 72 to `["frame-ancestors", PLATFORM_FRAME_ANCESTORS]` (import the constant).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`fix(csp): static build frame-ancestors allows Dock origins`).

### Task 2.3: Wrapped (proxy) CSP — matching `frame-ancestors`

**Files:**
- Modify: `apps/platform/src/lib/server/wrapper/router/proxy.ts:37`
- Test: `apps/platform/src/lib/server/wrapper/router/proxy.test.ts`

- [ ] **Step 1: Failing test** — `buildWrappedCsp(wrap)` contains `frame-ancestors 'self' https://shippie.app`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** change line 37 `"frame-ancestors 'none'"` → `` `frame-ancestors ${PLATFORM_FRAME_ANCESTORS}` `` (import the constant).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`fix(csp): wrapped-app frame-ancestors allows Dock origins`).

### Task 2.4: Health + manual framing check

- [ ] **Step 1:** `bun run health` from root → green.
- [ ] **Step 2: Manual** — in dev, open a maker app inside the Dock and confirm it still frames (regression check for the XFO removal); confirm the app cannot be framed from an arbitrary third-party origin (frame-ancestors denies it).

> serveFromR2 needs NO CSP change — the finalizer owns the response header. The baked `<meta>` CSP can stay (harmless; the header wins).

---

## Phase 3 — User "Report this app" → admin queue (P1)

**Outcome:** Any visitor can report an app from `/apps/[slug]`; reports land in an admin review queue with a one-click suspend that calls the Phase 1 path. Primary organic safety signal for an open, no-pre-review platform. (Expand each item to full TDD before executing.)

- Migration `apps/platform/drizzle/00NN_app_reports.sql` — `app_reports`: `id`, `app_id` (FK), `slug`, `reporter_user_id` (nullable), `reason` enum (`malware`/`abuse`/`impersonation`/`illegal`/`other`), `detail`, `status` (`open`/`reviewing`/`actioned`/`dismissed`), `created_at`, `reviewed_by`, `reviewed_at`. Apply with `db:migrate:local`.
- Schema `src/lib/server/db/schema/app-reports.ts` (+ barrel export).
- Endpoint `src/routes/api/apps/[slug]/report/+server.ts` — `POST`, IP rate-limited (mirror `/api/deploy/trial`), runs the hard-spam heuristics from `$server/moderation/feedback.ts` on `detail`, inserts a row. **Anonymous allowed** (abuse reports must not require login).
- UI on `apps/platform/src/routes/apps/[slug]/+page.svelte` — a ghost "Report" affordance opening a compact sheet (reuse `FeedbackSheet.svelte` + tokens; sentence-case, no cream pill).
- Admin `src/routes/admin/reports/+page.server.ts` + `+page.svelte` — queue with status filter + a "Suspend app" action calling the **Phase 1** suspend path; nav entry in the admin shell. Every action `recordAudit`.

**Acceptance:** report inserts + rate-limits + spam-filters; admin queue lists; suspend-from-queue takes the app offline (451).

---

## Phase 4 — Update behavior-delta monitoring (P0-monitoring)

**Outcome:** Updates stay instant (no approval gate), but each version records a behavior delta vs. the previous active deploy, and high-delta updates from popular apps surface to admins. Catches benign-v1 → malicious-v2.

- Pure `src/lib/server/deploy/behavior-delta.ts` — `computeBehaviorDelta(prev, next)` over data already in `pipeline.ts`: new `allowed_connect_domains`, new permissions/capabilities, large bundle-size jump, new external-network flag, app-kind change → `{ score, additions: string[] }`. Unit-tested, pure.
- Persist onto the `deploys` row (reuse a JSON column or add `behaviorDeltaJson`) inside `deployStatic` once the previous active deploy is known.
- Admin feed `src/routes/admin/updates/+page.server.ts` — recent high-delta updates joined to popularity (`upvoteCount`/`activeUsers30d`), link to Flight Recorder + suspend action.
- Non-blocking: deploys never wait on the delta. `log` any feed truncation.

**Acceptance:** unit tests (new domain → flagged; identical → 0); a v2 adding a connect domain appears in the feed.

---

## Phase 5 — Surface "What Shippie checked" on the public app page (P2)

**Outcome:** The real deploy-report findings appear on `/apps/[slug]` — maker-only analysis becomes public trust signal.

- Loader in `apps/platform/src/routes/apps/[slug]/+page.server.ts` reads the active version's deploy report (R2 `apps/{slug}/v{active}/_shippie/deploy-report.json` or the `deploys`/`appPackages` summary) and projects a **user-safe** subset (never raw finding internals).
- UI in the app-detail "About this tool" `.facts` section (hairline, tokens, no boxy panel): ✓ Runs locally · ✓ No trackers · Connects to: `…`.
- Guardrail test: projection excludes maker-only fields (scores/raw findings) — mirror the `userStatusLabel` user-safe pattern.

**Acceptance:** clean report → badges; declared connect domains listed; user-safe projection test passes.

---

## Self-Review notes
- **Spec/finding coverage:** all five review findings + the original five gaps are mapped (Phase 1 = kill switch with the two P0 fixes + deploy guard; Phase 2 = finalizer/static/proxy CSP + XFO; Phase 3 = reporting; Phase 4 = update monitoring; Phase 5 = transparency).
- **Type consistency:** suspension carried as `{ suspended: boolean; reason: string | null }` across `kv-write.ts` (`readSuspension`), `platform-client.ts` (`SuspensionRuntime`/`loadSuspension`), `access-gate.ts` (`AccessGateOpts.suspension`), and the dispatcher. The KV key is `apps:{slug}:suspended` everywhere. `PLATFORM_FRAME_ANCESTORS` is one shared constant used by the finalizer, `buildCsp`, and `buildWrappedCsp`.
- **Enforcement latency** (intentional, documented): KV propagation (seconds) + 30s per-isolate memo. `bustSuspensionCache` clears only the calling isolate. Near-real-time; a strict improvement over today's "never offline." For an instant global kill, an admin can also purge the active pointer — out of scope here.
- **Deferred:** plain maker-cleanup archive does NOT stop serving (only suspension does); maker self-service appeal UI; custom-domain shadowing audit; confirming `reap-trials`/`reconcile-kv` clear KV+R2 not just D1.
