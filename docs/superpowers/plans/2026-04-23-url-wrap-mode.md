# URL-wrap Deploy Mode — Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a maker wrap an already-hosted URL (`https://mevrouw.vercel.app`) as a Shippie marketplace app served via Worker reverse-proxy at `{slug}.shippie.app`, with PWA manifest + SDK injected into every HTML response, CSS/JS streamed through, and full install funnel + ratings support.

**Architecture:** Additive to the static deploy path. New `source_kind='wrapped_url'` value on `apps`. Control plane `POST /api/deploy/wrap` validates the upstream, upserts the app + KV config. Worker routes by `source_kind`: existing static pipeline unchanged; wrap pipeline fetches upstream, streams response, uses `HTMLRewriter` to inject manifest + SDK tags. Cookie domain + CSP rewriting performed at the proxy edge.

**Tech Stack:** Postgres 16 (drizzle), Next.js 16 (control plane), Hono + Cloudflare Workers / Bun (runtime), `HTMLRewriter` (native on CF, polyfilled via `@cloudflare/html-rewriter-wasm` in Bun dev), `bun test`.

**Spec:** `docs/superpowers/specs/2026-04-23-url-wrap-mode-design.md`

---

## File Structure

**Create:**
- `packages/db/migrations/0018_wrap_mode.sql`
- `apps/web/lib/deploy/wrap.ts`
- `apps/web/lib/deploy/wrap.test.ts`
- `apps/web/app/api/deploy/wrap/route.ts`
- `apps/web/app/api/deploy/wrap/route.test.ts`
- `apps/web/app/new/wrap-form.tsx`
- `services/worker/src/router/proxy.ts`
- `services/worker/src/router/proxy.test.ts`
- `services/worker/src/rewriter.ts`
- `services/worker/src/rewriter.test.ts`
- `packages/cli/src/commands/wrap.ts`
- `packages/cli/src/commands/wrap.test.ts`

**Modify:**
- `packages/db/src/schema/apps.ts` — three new columns
- `apps/web/lib/deploy/index.ts` — export `loadAppMeta` helper for routing decisions
- `services/worker/src/app.ts` — insert wrap-or-static dispatch before `filesRouter`
- `services/worker/src/platform-client.ts` — add `loadWrapMeta(slug)` accessor
- `apps/web/app/new/page.tsx` — add "Wrap a URL" tab
- `packages/cli/src/index.ts` — register `wrap` subcommand
- `apps/web/app/docs/page.tsx` — add wrap-mode section

---

## Task 1: Schema migration + Drizzle types

**Files:**
- Create: `packages/db/migrations/0018_wrap_mode.sql`
- Modify: `packages/db/src/schema/apps.ts`

- [ ] **Step 1: Write the migration**

```sql
-- packages/db/migrations/0018_wrap_mode.sql

-- Source discriminator: 'static' (zip/github build → R2) or 'wrapped_url' (proxy)
alter table apps add column source_kind text not null default 'static';
alter table apps add constraint apps_source_kind_check
  check (source_kind in ('static', 'wrapped_url'));

-- Upstream URL — only set when source_kind='wrapped_url'
alter table apps add column upstream_url text;
alter table apps add constraint apps_upstream_url_consistency check (
  (source_kind = 'static' and upstream_url is null)
  or
  (source_kind = 'wrapped_url' and upstream_url is not null and upstream_url like 'https://%')
);

-- Proxy config: csp_mode, extra_headers, auth_redirect_hint
alter table apps add column upstream_config jsonb not null default '{}'::jsonb;

create index apps_source_kind_idx on apps (source_kind) where source_kind <> 'static';
```

- [ ] **Step 2: Extend the Drizzle schema**

In `packages/db/src/schema/apps.ts`, add these columns inside the `apps` table definition (alongside `sourceType` at line 45):

```ts
    sourceKind: text('source_kind').default('static').notNull(),
    upstreamUrl: text('upstream_url'),
    upstreamConfig: jsonb('upstream_config').default(sql`'{}'::jsonb`).notNull(),
```

Import `sql` if not already imported in the file.

- [ ] **Step 3: Run migration against local dev DB**

```bash
bun run --cwd packages/db db:push
```

Expected: `Changes applied` with no errors. The existing trigger + RLS policies on `apps` are untouched.

- [ ] **Step 4: Verify the schema change in Postgres**

```bash
psql shippie_dev -c "\d apps" | grep -E "source_kind|upstream_url|upstream_config"
```

Expected:
```
 source_kind      | text    |           | not null | 'static'::text
 upstream_url     | text    |           |          |
 upstream_config  | jsonb   |           | not null | '{}'::jsonb
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0018_wrap_mode.sql packages/db/src/schema/apps.ts
git commit -m "db: source_kind + upstream_url columns for URL-wrap mode"
```

---

## Task 2: Deploy-wrap pipeline — `createWrappedApp()`

Pure function: validates input, checks slug reservation + uniqueness, upserts the app row with `source_kind='wrapped_url'`, seeds a deploys row, writes KV. No zip extraction, no R2 write, no preflight.

**Files:**
- Create: `apps/web/lib/deploy/wrap.ts`
- Create: `apps/web/lib/deploy/wrap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/deploy/wrap.test.ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { schema } from '@shippie/db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { createWrappedApp } from './wrap';

async function cleanup(slug: string) {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
}

describe('createWrappedApp', () => {
  const testSlug = 'wrap-test-mevrouw';
  beforeEach(() => cleanup(testSlug));

  test('rejects non-https upstream', async () => {
    const r = await createWrappedApp({
      slug: testSlug,
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'http://insecure.example.com',
      name: 'Test',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(),
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('upstream_not_https');
  });

  test('rejects reserved slug', async () => {
    const r = await createWrappedApp({
      slug: 'admin',
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'https://example.com',
      name: 'Test',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(['admin']),
    });
    expect(r.success).toBe(false);
    expect(r.reason).toBe('slug_reserved');
  });

  test('happy path: inserts app + deploy row with source_kind=wrapped_url', async () => {
    const r = await createWrappedApp({
      slug: testSlug,
      makerId: '00000000-0000-0000-0000-000000000001',
      upstreamUrl: 'https://mevrouw.vercel.app',
      name: 'Mevrouw',
      type: 'app',
      category: 'tools',
      reservedSlugs: new Set(),
    });
    expect(r.success).toBe(true);
    expect(r.slug).toBe(testSlug);
    expect(r.liveUrl).toBe('https://wrap-test-mevrouw.shippie.app/');
    expect(r.runtimeConfig?.requiredRedirectUris).toEqual([
      'https://wrap-test-mevrouw.shippie.app/api/auth/callback',
    ]);

    const db = await getDb();
    const [row] = await db.select().from(schema.apps).where(eq(schema.apps.slug, testSlug));
    expect(row?.sourceKind).toBe('wrapped_url');
    expect(row?.upstreamUrl).toBe('https://mevrouw.vercel.app');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/lib/deploy/wrap.test.ts
```

Expected: FAIL with `Cannot find module './wrap'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/deploy/wrap.ts
import { schema, type ShippieDb } from '@shippie/db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export interface CreateWrappedAppInput {
  slug: string;
  makerId: string;
  upstreamUrl: string;
  name: string;
  tagline?: string;
  type: 'app' | 'web_app' | 'website';
  category: string;
  cspMode?: 'lenient' | 'strict';
  themeColor?: string;
  reservedSlugs: ReadonlySet<string>;
}

export type CreateWrappedAppResult =
  | {
      success: true;
      slug: string;
      appId: string;
      deployId: string;
      liveUrl: string;
      runtimeConfig: { requiredRedirectUris: string[] };
    }
  | { success: false; reason: string };

function publicHost(): string {
  return process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
}

export async function createWrappedApp(
  input: CreateWrappedAppInput,
): Promise<CreateWrappedAppResult> {
  if (!input.upstreamUrl.startsWith('https://')) {
    return { success: false, reason: 'upstream_not_https' };
  }
  if (input.reservedSlugs.has(input.slug)) {
    return { success: false, reason: 'slug_reserved' };
  }

  const db: ShippieDb = await getDb();
  const existing = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, input.slug))
    .limit(1);
  if (existing[0] && existing[0].makerId !== input.makerId) {
    return { success: false, reason: 'slug_taken' };
  }

  const host = publicHost();
  const runtimeOrigin = `https://${input.slug}.${host}`;
  const liveUrl = `${runtimeOrigin}/`;

  const [appRow] = await db
    .insert(schema.apps)
    .values({
      slug: input.slug,
      name: input.name,
      tagline: input.tagline ?? null,
      type: input.type,
      category: input.category,
      makerId: input.makerId,
      sourceType: 'zip', // legacy field, not meaningful for wrapped
      sourceKind: 'wrapped_url',
      upstreamUrl: input.upstreamUrl,
      upstreamConfig: {
        cspMode: input.cspMode ?? 'lenient',
      },
      themeColor: input.themeColor ?? '#E8603C',
    })
    .onConflictDoUpdate({
      target: schema.apps.slug,
      set: {
        sourceKind: 'wrapped_url',
        upstreamUrl: input.upstreamUrl,
        upstreamConfig: { cspMode: input.cspMode ?? 'lenient' },
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.apps.id });

  if (!appRow) return { success: false, reason: 'insert_failed' };

  const [deployRow] = await db
    .insert(schema.deploys)
    .values({
      appId: appRow.id,
      status: 'success',
      version: 1,
      sourceKind: 'wrapped_url',
      sourceRef: input.upstreamUrl,
    })
    .returning({ id: schema.deploys.id });

  if (!deployRow) return { success: false, reason: 'deploy_insert_failed' };

  await db
    .update(schema.apps)
    .set({ activeDeployId: deployRow.id, lastDeployedAt: new Date() })
    .where(eq(schema.apps.id, appRow.id));

  return {
    success: true,
    slug: input.slug,
    appId: appRow.id,
    deployId: deployRow.id,
    liveUrl,
    runtimeConfig: {
      requiredRedirectUris: [`${runtimeOrigin}/api/auth/callback`],
    },
  };
}
```

**Note:** `schema.deploys` already has `sourceKind` and `sourceRef` columns (verify by reading `packages/db/src/schema/deploys.ts` before running — if missing, add them in a small follow-up migration; they're used for attribution only, not load-bearing).

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/lib/deploy/wrap.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/deploy/wrap.ts apps/web/lib/deploy/wrap.test.ts
git commit -m "feat(wrap): createWrappedApp pipeline with validation + db writes"
```

---

## Task 3: `POST /api/deploy/wrap` endpoint

**Files:**
- Create: `apps/web/app/api/deploy/wrap/route.ts`
- Create: `apps/web/app/api/deploy/wrap/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/api/deploy/wrap/route.test.ts
import { describe, expect, test, mock, afterEach } from 'bun:test';

mock.module('@/lib/cli-auth', () => ({
  resolveUserId: async () => ({ userId: '00000000-0000-0000-0000-000000000001' }),
}));
mock.module('@/lib/deploy/wrap', () => ({
  createWrappedApp: async (input: { slug: string }) => ({
    success: true,
    slug: input.slug,
    appId: 'app-id',
    deployId: 'deploy-id',
    liveUrl: `https://${input.slug}.shippie.app/`,
    runtimeConfig: { requiredRedirectUris: [`https://${input.slug}.shippie.app/api/auth/callback`] },
  }),
}));
mock.module('@/lib/deploy/reserved-slugs.ts', () => ({
  loadReservedSlugs: async () => new Set<string>(),
}));

const { POST } = await import('./route');

describe('POST /api/deploy/wrap', () => {
  afterEach(() => mock.restore());

  test('happy path returns success + live_url', async () => {
    const res = await POST(
      new Request('http://x/api/deploy/wrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'mevrouw',
          upstream_url: 'https://mevrouw.vercel.app',
          name: 'Mevrouw',
          type: 'app',
          category: 'tools',
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.live_url).toBe('https://mevrouw.shippie.app/');
    expect(body.runtime_config.required_redirect_uris).toHaveLength(1);
  });

  test('rejects missing slug with 400', async () => {
    const res = await POST(
      new Request('http://x/api/deploy/wrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ upstream_url: 'https://x.com' }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/app/api/deploy/wrap/route.test.ts
```

Expected: FAIL with `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

```ts
// apps/web/app/api/deploy/wrap/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveUserId } from '@/lib/cli-auth';
import { createWrappedApp } from '@/lib/deploy/wrap';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs.ts';
import { parseBody } from '@/lib/internal/validation';
import { withLogger } from '@/lib/observability/logger';

const BodySchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  upstream_url: z.string().url().startsWith('https://'),
  name: z.string().min(1).max(120),
  tagline: z.string().max(280).optional(),
  type: z.enum(['app', 'web_app', 'website']).default('app'),
  category: z.string().min(1).max(48),
  csp_mode: z.enum(['lenient', 'strict']).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withLogger('deploy.wrap', async (req: NextRequest) => {
  const who = await resolveUserId(req);
  if (!who) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = await parseBody(req, BodySchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const reservedSlugs = await loadReservedSlugs();
  const result = await createWrappedApp({
    slug: parsed.value.slug,
    makerId: who.userId,
    upstreamUrl: parsed.value.upstream_url,
    name: parsed.value.name,
    tagline: parsed.value.tagline,
    type: parsed.value.type,
    category: parsed.value.category,
    cspMode: parsed.value.csp_mode,
    themeColor: parsed.value.theme_color,
    reservedSlugs,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'wrap_failed', reason: result.reason }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    slug: result.slug,
    deploy_id: result.deployId,
    live_url: result.liveUrl,
    runtime_config: {
      required_redirect_uris: result.runtimeConfig.requiredRedirectUris,
    },
  });
});
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/app/api/deploy/wrap/route.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/deploy/wrap
git commit -m "feat(wrap): POST /api/deploy/wrap with zod validation"
```

---

## Task 4: HTMLRewriter injection — standalone module

Isolate the tag-injection logic so it's testable without starting a Worker. Native `HTMLRewriter` exists in Workers + Bun, but is not in Node. For Node tests we use the polyfill `@cloudflare/html-rewriter-wasm`. In Bun, use the built-in.

**Files:**
- Create: `services/worker/src/rewriter.ts`
- Create: `services/worker/src/rewriter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/worker/src/rewriter.test.ts
import { describe, expect, test } from 'bun:test';
import { injectPwaTags } from './rewriter';

const BASE_HTML = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';

describe('injectPwaTags', () => {
  test('inserts manifest link and SDK script before </head>', async () => {
    const stream = new Response(BASE_HTML).body!;
    const rewritten = await new Response(
      injectPwaTags(stream, { slug: 'mevrouw' }),
    ).text();
    expect(rewritten).toContain('<link rel="manifest" href="/__shippie/manifest">');
    expect(rewritten).toContain('<script src="/__shippie/sdk.js" async></script>');
    expect(rewritten.indexOf('</head>')).toBeGreaterThan(rewritten.indexOf('<script src="/__shippie/sdk.js'));
  });

  test('does not double-inject when SDK tag already present', async () => {
    const html = BASE_HTML.replace('</head>', '<script src="/__shippie/sdk.js"></script></head>');
    const stream = new Response(html).body!;
    const out = await new Response(injectPwaTags(stream, { slug: 'mevrouw' })).text();
    const count = (out.match(/\/__shippie\/sdk\.js/g) ?? []).length;
    expect(count).toBe(1);
  });

  test('passes non-HTML bodies through unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stream = new Response(bytes).body!;
    const out = await new Response(injectPwaTags(stream, { slug: 'x', contentType: 'image/png' })).bytes();
    expect(out).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test services/worker/src/rewriter.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the rewriter**

```ts
// services/worker/src/rewriter.ts
/**
 * PWA-tag injection into an upstream HTML stream.
 *
 * Uses Bun/Workers-native HTMLRewriter. For HTML responses, inserts:
 *   - <link rel="manifest" href="/__shippie/manifest">
 *   - <script src="/__shippie/sdk.js" async></script>
 * before </head>.
 *
 * Non-HTML bodies are passed through unchanged. Duplicate-injection is
 * prevented by a `data-shippie-injected` marker attribute.
 */

declare const HTMLRewriter: {
  new (): {
    on(selector: string, handler: { element?: (el: any) => void }): any;
    transform(response: Response): Response;
  };
};

export interface InjectOpts {
  slug: string;
  contentType?: string;
}

const MANIFEST_TAG = '<link rel="manifest" href="/__shippie/manifest" data-shippie-injected="1">';
const SDK_TAG = '<script src="/__shippie/sdk.js" async data-shippie-injected="1"></script>';

export function injectPwaTags(body: ReadableStream<Uint8Array>, opts: InjectOpts): ReadableStream<Uint8Array> {
  const ct = opts.contentType ?? '';
  if (!ct.toLowerCase().includes('text/html')) return body;

  let sdkSeen = false;
  let manifestSeen = false;

  const res = new Response(body, { headers: { 'content-type': 'text/html' } });
  const rewriter = new HTMLRewriter()
    .on('link[rel="manifest"]', {
      element() {
        manifestSeen = true;
      },
    })
    .on('script[src="/__shippie/sdk.js"]', {
      element() {
        sdkSeen = true;
      },
    })
    .on('head', {
      element(el: { append(html: string, opts: { html: boolean }): void }) {
        if (!manifestSeen) el.append(MANIFEST_TAG, { html: true });
        if (!sdkSeen) el.append(SDK_TAG, { html: true });
      },
    });

  return rewriter.transform(res).body!;
}
```

**Bun/Workers HTMLRewriter note:** `HTMLRewriter` is a global in both environments. The `declare const` above shuts up the type checker without pulling a cf-types dep.

- [ ] **Step 4: Run to verify pass**

```bash
bun test services/worker/src/rewriter.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/rewriter.ts services/worker/src/rewriter.test.ts
git commit -m "feat(worker): injectPwaTags — manifest + SDK via HTMLRewriter"
```

---

## Task 5: Proxy router — fetch upstream, rewrite, stream

**Files:**
- Create: `services/worker/src/router/proxy.ts`
- Create: `services/worker/src/router/proxy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// services/worker/src/router/proxy.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { proxyRouter } from './proxy';
import type { AppBindings } from '../app';

// Stand up a fake upstream on an ephemeral port
let upstream: ReturnType<typeof Bun.serve>;
let upstreamUrl = '';

beforeEach(() => {
  upstream = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/') {
        return new Response(
          '<!doctype html><html><head><title>t</title></head><body>hi</body></html>',
          { headers: { 'content-type': 'text/html', 'set-cookie': 'id=abc; Domain=upstream.example' } },
        );
      }
      if (u.pathname === '/api/ping') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('404', { status: 404 });
    },
  });
  upstreamUrl = `http://localhost:${upstream.port}`;
});
afterEach(() => upstream.stop(true));

function appWithMeta(slug: string) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('slug', slug);
    c.set('traceId', 'test');
    await next();
  });
  app.route('/', proxyRouter(() => ({ upstreamUrl, cspMode: 'lenient' })));
  return app;
}

describe('proxyRouter', () => {
  test('HTML response has SDK injected', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const text = await res.text();
    expect(text).toContain('/__shippie/sdk.js');
  });

  test('JSON response passes through', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('strips Domain attribute from upstream Set-Cookie', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toContain('id=abc');
    expect(sc.toLowerCase()).not.toContain('domain=');
  });

  test('replaces upstream CSP with Shippie CSP in lenient mode', async () => {
    const app = appWithMeta('mevrouw');
    const res = await app.request('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test services/worker/src/router/proxy.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the proxy router**

```ts
// services/worker/src/router/proxy.ts
/**
 * Reverse-proxy router for source_kind='wrapped_url' apps.
 *
 * Mounted after slug resolution, before the static files router. For
 * every request we build an upstream Request, fetch it, and stream the
 * response back — injecting PWA tags on HTML, rewriting Set-Cookie
 * domains, and replacing CSP per mode.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app';
import { injectPwaTags } from '../rewriter';

export interface WrapMeta {
  upstreamUrl: string;
  cspMode: 'lenient' | 'strict';
}

const SHIPPIE_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https:; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function stripCookieDomain(setCookie: string): string {
  return setCookie
    .split(',')
    .map((c) =>
      c
        .split(';')
        .filter((p) => !/^\s*Domain=/i.test(p))
        .join(';'),
    )
    .join(',');
}

function buildUpstreamUrl(upstreamBase: string, reqUrl: string): string {
  const base = new URL(upstreamBase);
  const req = new URL(reqUrl);
  return new URL(req.pathname + req.search, base).toString();
}

export function proxyRouter(loadMeta: (slug: string) => WrapMeta | Promise<WrapMeta>) {
  const router = new Hono<AppBindings>();

  router.all('*', async (c) => {
    const meta = await loadMeta(c.var.slug);
    if (!meta) return c.json({ error: 'wrap_config_missing' }, 500);

    const upstreamUrl = buildUpstreamUrl(meta.upstreamUrl, c.req.url);
    const upstreamHeaders = new Headers(c.req.raw.headers);
    upstreamHeaders.delete('host');
    upstreamHeaders.delete('content-length');

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
        redirect: 'manual',
      });
    } catch (err) {
      return c.json({ error: 'upstream_unreachable', message: String(err) }, 502);
    }

    const outHeaders = new Headers(upstream.headers);

    // Cookie domain stripping
    const setCookie = outHeaders.get('set-cookie');
    if (setCookie) {
      outHeaders.delete('set-cookie');
      outHeaders.append('set-cookie', stripCookieDomain(setCookie));
    }

    // CSP replacement
    outHeaders.delete('content-security-policy');
    if (meta.cspMode === 'lenient') {
      outHeaders.set('content-security-policy', SHIPPIE_CSP);
    } else if (upstream.headers.get('content-security-policy')) {
      outHeaders.set('content-security-policy', upstream.headers.get('content-security-policy')!);
    }

    // HTML injection
    const contentType = upstream.headers.get('content-type') ?? '';
    const body = upstream.body
      ? injectPwaTags(upstream.body, { slug: c.var.slug, contentType })
      : null;

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  });

  return router;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test services/worker/src/router/proxy.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/router
git commit -m "feat(worker): proxyRouter — fetch + stream + PWA injection + cookie/CSP rewrite"
```

---

## Task 6: Wire proxy into Worker app — dispatch by source_kind

**Files:**
- Modify: `services/worker/src/platform-client.ts` — add `loadWrapMeta`
- Modify: `services/worker/src/app.ts` — dispatch

- [ ] **Step 1: Add KV accessor**

In `services/worker/src/platform-client.ts`, add:

```ts
export async function loadWrapMeta(
  kv: { get(key: string, opts?: { type?: 'json' }): Promise<unknown> },
  slug: string,
): Promise<{ upstreamUrl: string; cspMode: 'lenient' | 'strict' } | null> {
  const raw = await kv.get(`apps:${slug}:wrap`, { type: 'json' });
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { upstream_url?: string; csp_mode?: string };
  if (!r.upstream_url) return null;
  return {
    upstreamUrl: r.upstream_url,
    cspMode: r.csp_mode === 'strict' ? 'strict' : 'lenient',
  };
}
```

- [ ] **Step 2: Dispatch in app.ts**

Modify `services/worker/src/app.ts`. Replace the line `app.route('/', filesRouter);` (around line 108) with:

```ts
  // Route by source_kind — wrap mode proxies to upstream; static falls through
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/__shippie/')) return next();
    const wrap = await loadWrapMeta(c.env.APP_CONFIG, c.var.slug);
    if (wrap) {
      const proxy = proxyRouter(() => wrap);
      return proxy.fetch(c.req.raw, c.env);
    }
    return next();
  });
  app.route('/', filesRouter);
```

Add imports at the top:
```ts
import { proxyRouter } from './router/proxy.ts';
import { loadWrapMeta } from './platform-client.ts';
```

- [ ] **Step 3: Deploy pipeline writes KV**

In `apps/web/lib/deploy/wrap.ts`, after the successful DB insert (before the `return { success: true, ... }`), add a KV write. Import at top:

```ts
import { writeWrapMeta } from '@/lib/deploy/kv';
```

And inside `createWrappedApp` just before the `return`:

```ts
await writeWrapMeta(input.slug, {
  upstream_url: input.upstreamUrl,
  csp_mode: input.cspMode ?? 'lenient',
});
```

Create the helper at `apps/web/lib/deploy/kv.ts` if it doesn't exist, or extend it:

```ts
// apps/web/lib/deploy/kv.ts (or append to existing file)
import { DevKv } from '@shippie/dev-storage';

export async function writeWrapMeta(
  slug: string,
  meta: { upstream_url: string; csp_mode: 'lenient' | 'strict' },
) {
  const kv = new DevKv();
  await kv.put(`apps:${slug}:wrap`, JSON.stringify(meta));
}
```

In prod, `DevKv` is swapped for the Cloudflare KV binding via the existing signed-request spine — match whatever pattern `apps/web/lib/deploy/index.ts` uses for static KV writes. Read that file first to copy the exact call shape.

- [ ] **Step 4: Hit a local wrapped app end-to-end**

```bash
# 1. Dev servers running on 4100 + 4200 (they already are)
# 2. Create a wrap via the API
curl -sS -X POST http://localhost:4100/api/deploy/wrap \
  -H 'content-type: application/json' \
  -H "cookie: $(cat ~/.shippie-dev-cookie 2>/dev/null || echo '')" \
  -d '{"slug":"wrap-demo","upstream_url":"http://localhost:4100/","name":"Wrap Demo","type":"app","category":"tools"}'
# Expected: {"success":true,"slug":"wrap-demo","live_url":"https://wrap-demo.shippie.app/", ...}
# (If auth fails, sign in via the browser first at /auth/signin and re-try.)

# 3. Hit the proxy endpoint
curl -sS -H 'host: wrap-demo.localhost' http://localhost:4200/ | head -20
# Expected: Shippie home HTML with __shippie/sdk.js injected before </head>
```

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/app.ts services/worker/src/platform-client.ts apps/web/lib/deploy/wrap.ts apps/web/lib/deploy/kv.ts
git commit -m "feat(worker): dispatch wrapped slugs to proxyRouter via KV config"
```

---

## Task 7: CLI `shippie wrap` command

**Files:**
- Create: `packages/cli/src/commands/wrap.ts`
- Create: `packages/cli/src/commands/wrap.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/commands/wrap.test.ts
import { describe, expect, test, mock } from 'bun:test';

mock.module('../api.js', () => ({
  postJson: async (path: string, body: unknown) => ({
    success: true,
    slug: (body as { slug: string }).slug,
    live_url: `https://${(body as { slug: string }).slug}.shippie.app/`,
    runtime_config: { required_redirect_uris: [`https://${(body as { slug: string }).slug}.shippie.app/api/auth/callback`] },
  }),
}));

const { wrapCommand } = await import('./wrap');

describe('shippie wrap', () => {
  test('success path prints slug, live URL, redirect URI', async () => {
    const out: string[] = [];
    await wrapCommand({
      upstreamUrl: 'https://mevrouw.vercel.app',
      slug: 'mevrouw',
      name: 'Mevrouw',
      type: 'app',
      category: 'tools',
      log: (s) => out.push(s),
    });
    const joined = out.join('\n');
    expect(joined).toContain('wrapped');
    expect(joined).toContain('https://mevrouw.shippie.app/');
    expect(joined).toContain('https://mevrouw.shippie.app/api/auth/callback');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test packages/cli/src/commands/wrap.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the command**

```ts
// packages/cli/src/commands/wrap.ts
import { postJson } from '../api.js';

export interface WrapInput {
  upstreamUrl: string;
  slug: string;
  name?: string;
  tagline?: string;
  type?: 'app' | 'web_app' | 'website';
  category?: string;
  cspMode?: 'lenient' | 'strict';
  log?: (line: string) => void;
}

export async function wrapCommand(input: WrapInput): Promise<void> {
  const log = input.log ?? console.log;
  const body = {
    slug: input.slug,
    upstream_url: input.upstreamUrl,
    name: input.name ?? input.slug,
    tagline: input.tagline,
    type: input.type ?? 'app',
    category: input.category ?? 'tools',
    csp_mode: input.cspMode,
  };
  const res = await postJson<{
    success: boolean;
    slug: string;
    live_url: string;
    runtime_config: { required_redirect_uris: string[] };
    reason?: string;
  }>('/api/deploy/wrap', body);
  if (!res.success) throw new Error(`wrap failed: ${res.reason ?? 'unknown'}`);

  log(`✓ wrapped ${res.slug}`);
  log(`  live: ${res.live_url}`);
  log('');
  log('  Add this redirect URI to your auth provider (Supabase / Auth0 / Clerk):');
  for (const uri of res.runtime_config.required_redirect_uris) {
    log(`    ${uri}`);
  }
}
```

- [ ] **Step 4: Register in the CLI dispatcher**

In `packages/cli/src/index.ts`, add a branch for `wrap`. The exact shape depends on the existing dispatcher (read it first); pattern is:

```ts
if (command === 'wrap') {
  const { wrapCommand } = await import('./commands/wrap.js');
  const upstream = args._[1];
  if (!upstream) throw new Error('usage: shippie wrap <upstream-url> [--slug X] [--name X]');
  await wrapCommand({
    upstreamUrl: String(upstream),
    slug: String(args.slug ?? deriveSlug(String(upstream))),
    name: args.name ? String(args.name) : undefined,
    type: args.type as 'app' | 'web_app' | 'website' | undefined,
    category: args.category ? String(args.category) : undefined,
    cspMode: args.strictCsp ? 'strict' : 'lenient',
  });
  return;
}
```

With a small helper:
```ts
function deriveSlug(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').split('.')[0] ?? 'app';
}
```

- [ ] **Step 5: Verify**

```bash
bun test packages/cli/src/commands/wrap.test.ts
bun run --cwd packages/cli build
```

Expected: test passes, CLI builds clean.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src
git commit -m "feat(cli): shippie wrap <upstream-url>"
```

---

## Task 8: Dashboard "Wrap a URL" form on /new

**Files:**
- Create: `apps/web/app/new/wrap-form.tsx`
- Modify: `apps/web/app/new/page.tsx`

- [ ] **Step 1: Write the form component**

```tsx
// apps/web/app/new/wrap-form.tsx
'use client';

import { useState } from 'react';

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; liveUrl: string; redirectUri: string }
  | { kind: 'error'; message: string };

export function WrapForm() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPhase({ kind: 'submitting' });

    const body = {
      upstream_url: String(form.get('upstream_url') ?? ''),
      slug: String(form.get('slug') ?? ''),
      name: String(form.get('name') ?? ''),
      tagline: String(form.get('tagline') ?? '') || undefined,
      type: String(form.get('type') ?? 'app'),
      category: String(form.get('category') ?? 'tools'),
    };

    const res = await fetch('/api/deploy/wrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      live_url?: string;
      runtime_config?: { required_redirect_uris?: string[] };
      reason?: string;
      error?: string;
    };

    if (res.ok && j.success && j.live_url) {
      setPhase({
        kind: 'done',
        liveUrl: j.live_url,
        redirectUri: j.runtime_config?.required_redirect_uris?.[0] ?? '',
      });
    } else {
      setPhase({ kind: 'error', message: j.reason ?? j.error ?? 'Wrap failed.' });
    }
  }

  if (phase.kind === 'done') {
    return (
      <div style={{ padding: 'var(--space-lg)', border: '1px solid var(--border-light)' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', color: 'var(--sage-leaf)' }}>
          ✓ Wrapped
        </p>
        <p style={{ marginTop: 'var(--space-sm)' }}>
          <a href={phase.liveUrl} style={{ color: 'var(--sunset)', fontFamily: 'var(--font-mono)' }}>
            {phase.liveUrl}
          </a>
        </p>
        {phase.redirectUri && (
          <>
            <p style={{ marginTop: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: 'var(--small-size)' }}>
              Add this redirect URI to your auth provider:
            </p>
            <pre
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                padding: 'var(--space-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                marginTop: 'var(--space-xs)',
              }}
            >
              {phase.redirectUri}
            </pre>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Field label="Upstream URL" name="upstream_url" placeholder="https://mevrouw.vercel.app" required />
      <Field label="Slug" name="slug" placeholder="mevrouw" required />
      <Field label="Name" name="name" placeholder="Mevrouw" required />
      <Field label="Tagline (optional)" name="tagline" />
      <Row>
        <Select label="Type" name="type" options={[['app', 'App'], ['web_app', 'Web app'], ['website', 'Website']]} />
        <Field label="Category" name="category" placeholder="tools" defaultValue="tools" />
      </Row>
      {phase.kind === 'error' && (
        <p style={{ color: '#c84a2a', fontSize: 'var(--small-size)' }}>{phase.message}</p>
      )}
      <button
        type="submit"
        className="btn-primary"
        disabled={phase.kind === 'submitting'}
        style={{ justifyContent: 'center' }}
      >
        {phase.kind === 'submitting' ? 'Wrapping…' : 'Wrap URL'}
      </button>
    </form>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}</span>
      <input
        {...rest}
        style={{
          height: 40,
          padding: '0 0.75rem',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
        }}
      />
    </label>
  );
}
function Select({ label, name, options }: { label: string; name: string; options: [string, string][] }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}</span>
      <select name={name} style={{ height: 40, padding: '0 0.75rem', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-md)' }}>{children}</div>;
}
```

- [ ] **Step 2: Add a tab on /new**

Read `apps/web/app/new/page.tsx` to see the existing upload form. Add a second tab beside it. Minimal approach:

```tsx
import { WrapForm } from './wrap-form';

// ...within the page body, after the existing upload flow:
<section style={{ marginTop: 'var(--space-2xl)', paddingTop: 'var(--space-xl)', borderTop: '1px solid var(--border-light)' }}>
  <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h2-size)', marginBottom: 'var(--space-md)' }}>
    Or wrap an already-hosted app
  </h2>
  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', maxWidth: 560 }}>
    Keep your app on Vercel / Netlify / your own server. We add the marketplace, PWA install, and ratings.
  </p>
  <WrapForm />
</section>
```

- [ ] **Step 3: Smoke test in the browser**

```bash
# Dev server already running. Open:
open http://localhost:4100/new
```

Sign in (dev link), scroll to "Wrap an already-hosted app", fill in `https://example.com` + slug `wrap-ex`, submit. Expected: "✓ Wrapped" with the live URL and redirect-URI hint.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/new
git commit -m "feat(wrap): dashboard form for wrapping an existing URL"
```

---

## Task 9: Docs update

**Files:**
- Modify: `apps/web/app/docs/page.tsx`

- [ ] **Step 1: Add wrap section after Quick start**

In `apps/web/app/docs/page.tsx`, inside the `Quick start` `<Section>` add a new `<Subsection>`:

```tsx
<Subsection title="Wrap an already-hosted app">
  <p>
    Your app already lives on Vercel / Netlify / your own server? Don&apos;t move it.
    Point Shippie at the URL and we&apos;ll generate a marketplace entry + PWA shell
    + install funnel, served via edge reverse-proxy at{' '}
    <code>{'{slug}'}.shippie.app</code>.
  </p>
  <Code
    lines={[
      'shippie wrap https://mevrouw.vercel.app --slug mevrouw',
      '',
      '# → live at https://mevrouw.shippie.app/',
      '# → add this redirect URI to your auth provider:',
      '#   https://mevrouw.shippie.app/api/auth/callback',
    ]}
  />
  <p>
    Works with any PWA that responds over HTTPS: Next.js, Astro, Remix, Nuxt, Rails,
    Django, Rust servers — anything.
  </p>
</Subsection>
```

- [ ] **Step 2: Hit /docs**

```bash
open http://localhost:4100/docs
```

Verify the new subsection renders.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/docs/page.tsx
git commit -m "docs: wrap-mode quick-start section"
```

---

## Task 10: End-to-end integration test

**Files:**
- Create: `apps/web/e2e/wrap-mode.spec.ts`

- [ ] **Step 1: Write the e2e**

```ts
// apps/web/e2e/wrap-mode.spec.ts
import { test, expect } from '@playwright/test';

test('wrap a URL end-to-end', async ({ page, request }) => {
  // Dev sign-in to get a session cookie
  await page.goto('http://localhost:4100/auth/signin');
  await page.getByText('Dev: sign in as').click();
  await page.waitForURL(/\/dashboard/);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Create a wrap
  const slug = `e2e-wrap-${Math.random().toString(36).slice(2, 8)}`;
  const res = await request.post('http://localhost:4100/api/deploy/wrap', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: {
      slug,
      upstream_url: 'http://localhost:4100/docs',
      name: 'E2E Wrap',
      type: 'app',
      category: 'tools',
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);

  // Hit the runtime URL via Host header (simulating subdomain routing)
  const live = await request.get('http://localhost:4200/', {
    headers: { host: `${slug}.localhost` },
  });
  expect(live.status()).toBe(200);
  const html = await live.text();
  expect(html).toContain('__shippie/sdk.js');
  expect(html).toContain('__shippie/manifest');
  // Upstream content appears too
  expect(html.toLowerCase()).toContain('ship an app on shippie');
});
```

- [ ] **Step 2: Run**

```bash
bun run --cwd apps/web e2e wrap-mode.spec.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/wrap-mode.spec.ts
git commit -m "test(wrap): e2e — wrap endpoint + proxy serves injected HTML"
```

---

## Task 11: Final sweep

- [ ] **Step 1: Full typecheck**

```bash
bunx tsc --noEmit -p apps/web/tsconfig.json
bunx tsc --noEmit -p services/worker/tsconfig.json
bunx tsc --noEmit -p packages/cli/tsconfig.json
```

Expected: all exit 0.

- [ ] **Step 2: Full test suite**

```bash
bun test apps/web services/worker packages/cli
```

Expected: all green, new tests included.

- [ ] **Step 3: Manual demo**

Use the existing demo.zip site as a substitute upstream:

```bash
# Serve the demo statically on 4300
python3 -m http.server --directory /tmp/demo-ship 4300 &
sleep 1

# Wrap it
curl -sS -X POST http://localhost:4100/api/deploy/wrap \
  -H "cookie: $(cat ~/.shippie-dev-cookie)" \
  -H 'content-type: application/json' \
  -d '{"slug":"wrap-demo","upstream_url":"http://localhost:4300","name":"Wrap Demo","type":"app","category":"tools"}'

# Hit the proxy
curl -sS -H 'host: wrap-demo.localhost' http://localhost:4200/ | head -30
```

Expected: demo site HTML with `__shippie/sdk.js` and `__shippie/manifest` injected.

- [ ] **Step 4: Update PR description + ship**

```bash
git log --oneline --since="1 day" | head
# Expected: the task commits above, ready for PR
```

---

## Self-review notes

- All steps have complete code, not placeholders
- `schema.deploys.sourceKind / sourceRef` used in Task 2 — verify these exist in `packages/db/src/schema/deploys.ts` before running; if not, add them in Task 1's migration (low risk; they're informational).
- The dev env uses `DevKv` locally; prod Cloudflare KV write path should match the static deploy pipeline's existing KV write helper — read `apps/web/lib/deploy/index.ts` for the exact pattern when implementing Task 6 step 3.
- HTMLRewriter is a Bun + Workers global; test runs under Bun so the global is present. If a future CI runs under Node-only, swap to `@cloudflare/html-rewriter-wasm`.
- Phase B (private apps) plan is produced as a sibling file — this plan explicitly does NOT add any private/invite logic.
