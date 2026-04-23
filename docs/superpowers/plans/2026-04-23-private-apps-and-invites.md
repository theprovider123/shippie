# Private Apps & Link Invites — Implementation Plan (Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** `2026-04-23-url-wrap-mode.md` (Phase A). Do not start until Phase A is merged — the wrap dispatch logic in `services/worker/src/app.ts` is the hook point for the access gate.

**Goal:** Ship private visibility with link-based invites. A maker can mark any app (static or wrapped) as `visibility_scope='private'`, create shareable invite links with optional max-uses/expiry, and only invitees can see the marketplace listing or load the app at `{slug}.shippie.app`. Public shelves, search, leaderboards, and sitemap never surface private apps.

**Architecture:** Additive. Two new tables (`app_access`, `app_invites`). Existing public queries add `and visibility_scope = 'public'` filters. Runtime Worker gets a new access-gate middleware before the wrap/static dispatch. Invite claim flow sets a signed HMAC cookie scoped to `.shippie.app` so both apex (marketplace page) and subdomain (runtime) accept the same grant.

**Tech Stack:** Postgres 16 (drizzle), Next.js 16, Hono + Workers/Bun, `jose` for HMAC JWT (already a dep via auth.js), `bun test`.

**Spec:** `docs/superpowers/specs/2026-04-23-private-apps-and-invites-design.md`

**Email invites** (Phase C) are explicitly out of scope here; API endpoints for email-type return `501 not_implemented`.

---

## File Structure

**Create:**
- `packages/db/migrations/0019_private_apps_and_invites.sql`
- `apps/web/lib/access/check.ts` + `.test.ts`
- `apps/web/lib/access/invite-cookie.ts` + `.test.ts`
- `apps/web/lib/access/invites.ts` + `.test.ts` (create/claim/revoke/list)
- `apps/web/app/invite/[token]/page.tsx`
- `apps/web/app/api/invite/[token]/claim/route.ts` + `.test.ts`
- `apps/web/app/api/apps/[slug]/invites/route.ts` + `.test.ts`
- `apps/web/app/api/apps/[slug]/invites/[id]/route.ts` (DELETE)
- `apps/web/app/api/apps/[slug]/access/route.ts`
- `apps/web/app/api/apps/[slug]/access/[id]/route.ts` (DELETE)
- `apps/web/app/dashboard/apps/[slug]/access/page.tsx`
- `services/worker/src/router/access-gate.ts` + `.test.ts`
- `packages/cli/src/commands/invite.ts` + `.test.ts`

**Modify:**
- `packages/db/src/schema/index.ts` — export new tables
- `packages/db/src/schema/app-access.ts` (new file)
- `packages/db/src/schema/app-invites.ts` (new file)
- `apps/web/app/apps/[slug]/page.tsx` — call `checkAccess`, 404 on denied
- `apps/web/lib/shippie/leaderboards.ts` — already filters `visibility_scope = 'public'`, verify
- `apps/web/app/apps/page.tsx` — already filters, verify
- `apps/web/lib/deploy/wrap.ts` + `apps/web/lib/deploy/index.ts` — support `visibility_scope='private'` at create time
- `services/worker/src/app.ts` — insert access-gate before wrap/static dispatch
- `packages/cli/src/index.ts` — register `invite`, `invites`, `invite revoke`
- `apps/web/app/dashboard/apps/page.tsx` — link to the new access page

---

## Task 1: Schema + types

**Files:**
- Create: `packages/db/migrations/0019_private_apps_and_invites.sql`
- Create: `packages/db/src/schema/app-access.ts`
- Create: `packages/db/src/schema/app-invites.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the migration**

```sql
-- packages/db/migrations/0019_private_apps_and_invites.sql

-- Extend visibility_scope check (if constraint exists)
alter table apps drop constraint if exists apps_visibility_scope_check;
alter table apps add constraint apps_visibility_scope_check
  check (visibility_scope in ('public', 'unlisted', 'private'));

create table app_access (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  email text,
  invited_by uuid references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null check (source in ('owner', 'invite_link', 'invite_email')),
  constraint app_access_user_or_email check (user_id is not null or email is not null),
  unique (app_id, user_id),
  unique (app_id, email)
);
create index app_access_app_active_idx on app_access (app_id) where revoked_at is null;

create table app_invites (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  token text not null unique,
  kind text not null check (kind in ('link', 'email')),
  email text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  revoked_at timestamptz
);
create index app_invites_app_active_idx on app_invites (app_id) where revoked_at is null;
create index app_invites_token_idx on app_invites (token) where revoked_at is null;
```

- [ ] **Step 2: Write the Drizzle tables**

```ts
// packages/db/src/schema/app-access.ts
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { apps } from './apps.ts';
import { users } from './users.ts';

export const appAccess = pgTable(
  'app_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    invitedBy: uuid('invited_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    source: text('source').notNull(),
  },
  (t) => [
    index('app_access_app_active_idx').on(t.appId),
    check('app_access_user_or_email', sql`${t.userId} is not null or ${t.email} is not null`),
  ],
);

export type AppAccess = typeof appAccess.$inferSelect;
export type NewAppAccess = typeof appAccess.$inferInsert;
```

```ts
// packages/db/src/schema/app-invites.ts
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { apps } from './apps.ts';
import { users } from './users.ts';

export const appInvites = pgTable(
  'app_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    kind: text('kind').notNull(),
    email: text('email'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').default(0).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('app_invites_app_active_idx').on(t.appId)],
);

export type AppInvite = typeof appInvites.$inferSelect;
export type NewAppInvite = typeof appInvites.$inferInsert;
```

- [ ] **Step 3: Export from index**

In `packages/db/src/schema/index.ts` add:
```ts
export * from './app-access.ts';
export * from './app-invites.ts';
```

- [ ] **Step 4: Apply + verify**

```bash
bun run --cwd packages/db db:push
psql shippie_dev -c "\d app_access" | head -20
psql shippie_dev -c "\d app_invites" | head -20
```

Expected: both tables visible with listed columns.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "db: app_access + app_invites + visibility_scope=private"
```

---

## Task 2: Invite cookie helpers (HMAC sign + verify)

**Files:**
- Create: `apps/web/lib/access/invite-cookie.ts`
- Create: `apps/web/lib/access/invite-cookie.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/access/invite-cookie.test.ts
import { describe, expect, test } from 'bun:test';
import { signInviteGrant, verifyInviteGrant, inviteCookieName } from './invite-cookie';

const SECRET = 'test-secret-32bytes-aaaaaaaaaaaaaaaa';

describe('invite cookie', () => {
  test('sign + verify roundtrip', async () => {
    const token = await signInviteGrant(
      { sub: 'anon-1', app: 'mevrouw', tok: 'inv-1', src: 'invite_link', exp: Math.floor(Date.now() / 1000) + 60 },
      SECRET,
    );
    const verified = await verifyInviteGrant(token, SECRET);
    expect(verified?.app).toBe('mevrouw');
    expect(verified?.sub).toBe('anon-1');
  });

  test('rejects expired grant', async () => {
    const token = await signInviteGrant(
      { sub: 'a', app: 'x', tok: 't', src: 'invite_link', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    const verified = await verifyInviteGrant(token, SECRET);
    expect(verified).toBeNull();
  });

  test('rejects tampered token', async () => {
    const token = await signInviteGrant(
      { sub: 'a', app: 'x', tok: 't', src: 'invite_link', exp: Math.floor(Date.now() / 1000) + 60 },
      SECRET,
    );
    const tampered = token.slice(0, -2) + 'XX';
    const verified = await verifyInviteGrant(tampered, SECRET);
    expect(verified).toBeNull();
  });

  test('cookie name is slug-scoped', () => {
    expect(inviteCookieName('mevrouw')).toBe('__Secure-shippie_invite_mevrouw');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/lib/access/invite-cookie.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/access/invite-cookie.ts
/**
 * HMAC-signed invite grant cookie. Used on both the apex marketplace
 * domain (during claim) and on {slug}.shippie.app (runtime access gate).
 *
 * Cookie prefix `__Secure-` means Secure + path-root-only. Domain is
 * set to `.shippie.app` so the cookie propagates to subdomains.
 *
 * In dev (*.localhost) the `__Secure-` prefix is a no-op — browsers
 * ignore the prefix requirement when Secure cannot be applied to http.
 */
import { SignJWT, jwtVerify } from 'jose';

export interface InviteGrant {
  sub: string; // anonymous id or userId
  app: string; // app slug
  tok: string; // invite id (for revocation audit)
  src: 'invite_link' | 'invite_email';
  exp: number; // unix seconds
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signInviteGrant(grant: InviteGrant, secret: string): Promise<string> {
  return await new SignJWT({ ...grant })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(grant.exp)
    .sign(secretKey(secret));
}

export async function verifyInviteGrant(
  token: string,
  secret: string,
): Promise<InviteGrant | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (typeof payload.app !== 'string' || typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      app: payload.app,
      tok: String(payload.tok ?? ''),
      src: payload.src === 'invite_email' ? 'invite_email' : 'invite_link',
      exp: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

export function inviteCookieName(slug: string): string {
  return `__Secure-shippie_invite_${slug}`;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/lib/access/invite-cookie.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/access
git commit -m "feat(access): HMAC invite grant cookie sign + verify"
```

---

## Task 3: `checkAccess` helper (control plane)

**Files:**
- Create: `apps/web/lib/access/check.ts`
- Create: `apps/web/lib/access/check.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/access/check.test.ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { checkAccess } from './check';

const MAKER = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';

async function insertApp(slug: string, scope: 'public' | 'unlisted' | 'private'): Promise<string> {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
  const [row] = await db
    .insert(schema.apps)
    .values({
      slug,
      name: slug,
      type: 'app',
      category: 'tools',
      makerId: MAKER,
      sourceType: 'zip',
      visibilityScope: scope,
    })
    .returning({ id: schema.apps.id });
  return row!.id;
}

describe('checkAccess', () => {
  test('public is granted for anyone', async () => {
    const appId = await insertApp('check-pub', 'public');
    const r = await checkAccess({ appId, viewer: {} });
    expect(r).toBe('granted');
  });

  test('private denied for anonymous', async () => {
    const appId = await insertApp('check-priv-anon', 'private');
    const r = await checkAccess({ appId, viewer: {} });
    expect(r).toBe('denied');
  });

  test('private granted for maker', async () => {
    const appId = await insertApp('check-priv-maker', 'private');
    const r = await checkAccess({ appId, viewer: { userId: MAKER } });
    expect(r).toBe('granted');
  });

  test('private granted via app_access row', async () => {
    const appId = await insertApp('check-priv-grant', 'private');
    const db = await getDb();
    await db.insert(schema.appAccess).values({
      appId,
      userId: OTHER,
      source: 'invite_link',
      invitedBy: MAKER,
    });
    const r = await checkAccess({ appId, viewer: { userId: OTHER } });
    expect(r).toBe('granted');
  });

  test('private granted via valid invite cookie', async () => {
    const appId = await insertApp('check-priv-cookie', 'private');
    const r = await checkAccess({
      appId,
      slug: 'check-priv-cookie',
      viewer: { inviteCookie: { app: 'check-priv-cookie', sub: 'anon-1', tok: 't', src: 'invite_link', exp: Math.floor(Date.now() / 1000) + 60 } },
    });
    expect(r).toBe('granted');
  });

  test('private denied if invite cookie app-mismatch', async () => {
    const appId = await insertApp('check-priv-mismatch', 'private');
    const r = await checkAccess({
      appId,
      slug: 'check-priv-mismatch',
      viewer: { inviteCookie: { app: 'some-other-app', sub: 'x', tok: 't', src: 'invite_link', exp: 99999999999 } },
    });
    expect(r).toBe('denied');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/lib/access/check.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/access/check.ts
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import type { InviteGrant } from './invite-cookie';

export interface CheckAccessInput {
  appId: string;
  slug?: string;
  viewer: {
    userId?: string;
    email?: string;
    inviteCookie?: InviteGrant;
  };
}

export type AccessResult = 'granted' | 'denied';

export async function checkAccess(input: CheckAccessInput): Promise<AccessResult> {
  const db = await getDb();
  const [app] = await db
    .select({
      visibilityScope: schema.apps.visibilityScope,
      makerId: schema.apps.makerId,
      slug: schema.apps.slug,
    })
    .from(schema.apps)
    .where(eq(schema.apps.id, input.appId))
    .limit(1);
  if (!app) return 'denied';
  if (app.visibilityScope !== 'private') return 'granted';

  const viewer = input.viewer;

  // Owner always has access
  if (viewer.userId && viewer.userId === app.makerId) return 'granted';

  // Invite cookie (anonymous or signed-in grant)
  if (viewer.inviteCookie) {
    const slug = input.slug ?? app.slug;
    if (viewer.inviteCookie.app === slug) return 'granted';
  }

  // Durable access via user id
  if (viewer.userId) {
    const [row] = await db
      .select({ id: schema.appAccess.id })
      .from(schema.appAccess)
      .where(
        and(
          eq(schema.appAccess.appId, input.appId),
          eq(schema.appAccess.userId, viewer.userId),
          isNull(schema.appAccess.revokedAt),
        ),
      )
      .limit(1);
    if (row) return 'granted';
  }

  // Durable access via email
  if (viewer.email) {
    const [row] = await db
      .select({ id: schema.appAccess.id })
      .from(schema.appAccess)
      .where(
        and(
          eq(schema.appAccess.appId, input.appId),
          eq(schema.appAccess.email, viewer.email),
          isNull(schema.appAccess.revokedAt),
        ),
      )
      .limit(1);
    if (row) return 'granted';
  }

  return 'denied';
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/lib/access/check.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/access/check.ts apps/web/lib/access/check.test.ts
git commit -m "feat(access): checkAccess helper for control-plane gates"
```

---

## Task 4: Invite CRUD helpers

**Files:**
- Create: `apps/web/lib/access/invites.ts`
- Create: `apps/web/lib/access/invites.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/access/invites.test.ts
import { describe, expect, test, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { createLinkInvite, claimInvite, revokeInvite, listInvites } from './invites';

const MAKER = '00000000-0000-0000-0000-000000000001';

async function freshApp(slug: string): Promise<string> {
  const db = await getDb();
  await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
  const [row] = await db
    .insert(schema.apps)
    .values({ slug, name: slug, type: 'app', category: 'tools', makerId: MAKER, sourceType: 'zip', visibilityScope: 'private' })
    .returning({ id: schema.apps.id });
  return row!.id;
}

describe('invites', () => {
  test('createLinkInvite returns url-safe token', async () => {
    const appId = await freshApp('inv-create');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{10,}$/);
  });

  test('claimInvite increments used_count and creates app_access row when signed-in', async () => {
    const appId = await freshApp('inv-claim');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    const result = await claimInvite({ token: inv.token, userId: '00000000-0000-0000-0000-000000000002' });
    expect(result.success).toBe(true);

    const db = await getDb();
    const [row] = await db.select().from(schema.appInvites).where(eq(schema.appInvites.id, inv.id));
    expect(row?.usedCount).toBe(1);
    const [access] = await db.select().from(schema.appAccess).where(eq(schema.appAccess.appId, appId));
    expect(access?.userId).toBe('00000000-0000-0000-0000-000000000002');
  });

  test('claimInvite without userId still increments used_count (anonymous)', async () => {
    const appId = await freshApp('inv-anon');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    const result = await claimInvite({ token: inv.token });
    expect(result.success).toBe(true);
    expect(result.anonymous).toBe(true);
  });

  test('claimInvite rejects revoked', async () => {
    const appId = await freshApp('inv-rev');
    const inv = await createLinkInvite({ appId, createdBy: MAKER });
    await revokeInvite({ id: inv.id, appId, by: MAKER });
    const result = await claimInvite({ token: inv.token });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('revoked_or_expired');
  });

  test('claimInvite rejects when max_uses hit', async () => {
    const appId = await freshApp('inv-max');
    const inv = await createLinkInvite({ appId, createdBy: MAKER, maxUses: 1 });
    await claimInvite({ token: inv.token });
    const second = await claimInvite({ token: inv.token });
    expect(second.success).toBe(false);
    expect(second.reason).toBe('uses_exhausted');
  });

  test('listInvites returns only active invites for the given app', async () => {
    const appId = await freshApp('inv-list');
    await createLinkInvite({ appId, createdBy: MAKER });
    const inv2 = await createLinkInvite({ appId, createdBy: MAKER });
    await revokeInvite({ id: inv2.id, appId, by: MAKER });
    const rows = await listInvites({ appId });
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/lib/access/invites.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/access/invites.ts
import { and, eq, gt, isNull, isNotNull, sql as sqlOp } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';

function randomToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function createLinkInvite(input: {
  appId: string;
  createdBy: string;
  maxUses?: number;
  expiresAt?: Date;
}): Promise<{ id: string; token: string }> {
  const db = await getDb();
  const token = randomToken();
  const [row] = await db
    .insert(schema.appInvites)
    .values({
      appId: input.appId,
      createdBy: input.createdBy,
      token,
      kind: 'link',
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: schema.appInvites.id, token: schema.appInvites.token });
  return row!;
}

export async function claimInvite(input: {
  token: string;
  userId?: string;
}): Promise<
  | { success: true; appId: string; inviteId: string; anonymous: boolean }
  | { success: false; reason: 'not_found' | 'revoked_or_expired' | 'uses_exhausted' }
> {
  const db = await getDb();
  const [inv] = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.token, input.token))
    .limit(1);
  if (!inv) return { success: false, reason: 'not_found' };
  if (inv.revokedAt) return { success: false, reason: 'revoked_or_expired' };
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now())
    return { success: false, reason: 'revoked_or_expired' };
  if (inv.maxUses != null && inv.usedCount >= inv.maxUses)
    return { success: false, reason: 'uses_exhausted' };

  await db
    .update(schema.appInvites)
    .set({ usedCount: sqlOp`${schema.appInvites.usedCount} + 1` })
    .where(eq(schema.appInvites.id, inv.id));

  if (input.userId) {
    await db
      .insert(schema.appAccess)
      .values({
        appId: inv.appId,
        userId: input.userId,
        invitedBy: inv.createdBy,
        source: 'invite_link',
      })
      .onConflictDoNothing({ target: [schema.appAccess.appId, schema.appAccess.userId] });
    return { success: true, appId: inv.appId, inviteId: inv.id, anonymous: false };
  }
  return { success: true, appId: inv.appId, inviteId: inv.id, anonymous: true };
}

export async function revokeInvite(input: {
  id: string;
  appId: string;
  by: string;
}): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .update(schema.appInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.appInvites.id, input.id), eq(schema.appInvites.appId, input.appId)),
    );
  return (result.rowCount ?? 0) > 0;
}

export async function listInvites(input: { appId: string }) {
  const db = await getDb();
  return db
    .select()
    .from(schema.appInvites)
    .where(and(eq(schema.appInvites.appId, input.appId), isNull(schema.appInvites.revokedAt)))
    .orderBy(schema.appInvites.createdAt);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/lib/access/invites.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/access/invites.ts apps/web/lib/access/invites.test.ts
git commit -m "feat(access): invite create/claim/revoke/list helpers"
```

---

## Task 5: API routes — maker CRUD

**Files:**
- Create: `apps/web/app/api/apps/[slug]/invites/route.ts` (GET list, POST create)
- Create: `apps/web/app/api/apps/[slug]/invites/[id]/route.ts` (DELETE)
- Create: `apps/web/app/api/apps/[slug]/invites/route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// apps/web/app/api/apps/[slug]/invites/route.test.ts
import { describe, expect, test, mock } from 'bun:test';

mock.module('@/lib/auth', () => ({
  auth: async () => ({ user: { id: '00000000-0000-0000-0000-000000000001' } }),
}));
mock.module('@/lib/access/invites', () => ({
  createLinkInvite: async () => ({ id: 'inv-1', token: 'abc123def456' }),
  listInvites: async () => [{ id: 'inv-1', token: 'abc123def456', kind: 'link', usedCount: 0 }],
}));
mock.module('@/lib/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ id: 'app-1', makerId: '00000000-0000-0000-0000-000000000001' }] }),
      }),
    }),
  }),
}));

const { GET, POST } = await import('./route');

describe('/api/apps/[slug]/invites', () => {
  test('POST creates and returns url', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'link' }),
      }) as never,
      { params: Promise.resolve({ slug: 'mevrouw' }) } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite.token).toBe('abc123def456');
    expect(body.url).toBe('https://shippie.app/invite/abc123def456');
  });

  test('GET lists invites', async () => {
    const res = await GET(
      new Request('http://x') as never,
      { params: Promise.resolve({ slug: 'mevrouw' }) } as never,
    );
    const body = await res.json();
    expect(body.invites).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
bun test apps/web/app/api/apps/[slug]/invites/route.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// apps/web/app/api/apps/[slug]/invites/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { createLinkInvite, listInvites } from '@/lib/access/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  kind: z.enum(['link', 'email']).default('link'),
  email: z.string().email().optional(),
  max_uses: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
});

async function requireOwner(slug: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!row) return { error: 'not_found' as const };
  if (row.makerId !== userId) return { error: 'forbidden' as const };
  return { appId: row.id };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug } = await ctx.params;
  const gate = await requireOwner(slug, session.user.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.error === 'forbidden' ? 403 : 404 });
  const invites = await listInvites({ appId: gate.appId });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug } = await ctx.params;
  const gate = await requireOwner(slug, session.user.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.error === 'forbidden' ? 403 : 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  if (parsed.data.kind === 'email') {
    return NextResponse.json({ error: 'not_implemented', reason: 'email invites ship in Phase C' }, { status: 501 });
  }

  const invite = await createLinkInvite({
    appId: gate.appId,
    createdBy: session.user.id,
    maxUses: parsed.data.max_uses,
    expiresAt: parsed.data.expires_at ? new Date(parsed.data.expires_at) : undefined,
  });

  const host = process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
  return NextResponse.json({
    invite,
    url: `https://${host}/invite/${invite.token}`,
  });
}
```

```ts
// apps/web/app/api/apps/[slug]/invites/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { revokeInvite } from '@/lib/access/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug, id } = await ctx.params;
  const db = await getDb();
  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== session.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const ok = await revokeInvite({ id, appId: app.id, by: session.user.id });
  return NextResponse.json({ success: ok });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bun test apps/web/app/api/apps/[slug]/invites/route.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/apps
git commit -m "feat(access): /api/apps/:slug/invites CRUD"
```

---

## Task 6: Claim endpoint + `/invite/[token]` page

**Files:**
- Create: `apps/web/app/invite/[token]/page.tsx`
- Create: `apps/web/app/api/invite/[token]/claim/route.ts`
- Create: `apps/web/app/api/invite/[token]/claim/route.test.ts`

- [ ] **Step 1: Claim endpoint test**

```ts
// apps/web/app/api/invite/[token]/claim/route.test.ts
import { describe, expect, test, mock } from 'bun:test';

const mocks = {
  claim: async () => ({ success: true, appId: 'app-1', inviteId: 'inv-1', anonymous: true }),
};

mock.module('@/lib/access/invites', () => ({
  claimInvite: (args: unknown) => mocks.claim.call(null, args as never),
}));
mock.module('@/lib/access/invite-cookie', () => ({
  signInviteGrant: async () => 'signed-token',
  inviteCookieName: (slug: string) => `__Secure-shippie_invite_${slug}`,
}));
mock.module('@/lib/db', () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ slug: 'mevrouw' }] }) }),
    }),
  }),
}));
mock.module('@/lib/auth', () => ({ auth: async () => null }));

const { POST } = await import('./route');

describe('POST /api/invite/:token/claim', () => {
  test('anonymous claim sets cookie + returns redirect', async () => {
    const res = await POST(
      new Request('http://x', { method: 'POST' }) as never,
      { params: Promise.resolve({ token: 'abc' }) } as never,
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('__Secure-shippie_invite_mevrouw');
    const body = await res.json();
    expect(body.redirect_to).toMatch(/mevrouw\./);
  });
});
```

- [ ] **Step 2: Run to verify fail + implement**

Write the route:

```ts
// apps/web/app/api/invite/[token]/claim/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { claimInvite } from '@/lib/access/invites';
import { signInviteGrant, inviteCookieName } from '@/lib/access/invite-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const session = await auth();

  const result = await claimInvite({ token, userId: session?.user?.id });
  if (!result.success) {
    return NextResponse.json({ error: 'claim_failed', reason: result.reason }, { status: 400 });
  }

  const db = await getDb();
  const [app] = await db
    .select({ slug: schema.apps.slug })
    .from(schema.apps)
    .where(eq(schema.apps.id, result.appId))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'app_missing' }, { status: 500 });

  const secret = process.env.SHIPPIE_INVITE_SECRET;
  if (!secret) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const expSec = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  const jwt = await signInviteGrant(
    {
      sub: session?.user?.id ?? `anon-${Math.random().toString(36).slice(2, 10)}`,
      app: app.slug,
      tok: result.inviteId,
      src: 'invite_link',
      exp: expSec,
    },
    secret,
  );

  const cookieName = inviteCookieName(app.slug);
  const host = process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';

  const res = NextResponse.json({
    success: true,
    redirect_to: `https://${app.slug}.${host}/`,
  });
  res.headers.set(
    'set-cookie',
    `${cookieName}=${jwt}; Path=/; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}; Domain=.${host}`,
  );
  return res;
}
```

- [ ] **Step 3: Build the accept page**

```tsx
// apps/web/app/invite/[token]/page.tsx
import Link from 'next/link';
import { eq, and, isNull } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { SiteNav } from '@/app/components/site-nav';
import { ClaimButton } from './claim-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadInvite(token: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.appInvites.id,
      revokedAt: schema.appInvites.revokedAt,
      expiresAt: schema.appInvites.expiresAt,
      maxUses: schema.appInvites.maxUses,
      usedCount: schema.appInvites.usedCount,
      appName: schema.apps.name,
      appSlug: schema.apps.slug,
      appTagline: schema.apps.tagline,
    })
    .from(schema.appInvites)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.appInvites.appId))
    .where(eq(schema.appInvites.token, token))
    .limit(1);
  return row;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadInvite(token);
  const invalid =
    !inv ||
    inv.revokedAt != null ||
    (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) ||
    (inv.maxUses != null && inv.usedCount >= inv.maxUses);

  return (
    <>
      <SiteNav />
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))' }}
      >
        <div className="w-full max-w-md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', textAlign: 'center' }}>
          {invalid ? (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem' }}>Invite expired</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Ask the person who shared this with you for a new link.</p>
              <Link href="/" style={{ color: 'var(--sunset)', fontFamily: 'var(--font-mono)' }}>← shippie.app</Link>
            </>
          ) : (
            <>
              <p className="eyebrow">You&apos;re invited to</p>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', letterSpacing: '-0.02em', margin: 0 }}>
                {inv!.appName}
              </h1>
              {inv!.appTagline && <p style={{ color: 'var(--text-secondary)' }}>{inv!.appTagline}</p>}
              <ClaimButton token={token} />
              <p style={{ fontSize: 12, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                This invite gives you access for 30 days. Sign in to make it permanent.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
```

```tsx
// apps/web/app/invite/[token]/claim-button.tsx
'use client';
import { useState } from 'react';

export function ClaimButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'claiming' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function onClick() {
    setState('claiming');
    const res = await fetch(`/api/invite/${encodeURIComponent(token)}/claim`, { method: 'POST' });
    const j = (await res.json().catch(() => ({}))) as { redirect_to?: string; reason?: string; error?: string };
    if (res.ok && j.redirect_to) {
      window.location.href = j.redirect_to;
      return;
    }
    setState('error');
    setMsg(j.reason ?? j.error ?? 'Claim failed.');
  }

  return (
    <>
      <button onClick={onClick} className="btn-primary" disabled={state === 'claiming'} style={{ justifyContent: 'center', height: 48 }}>
        {state === 'claiming' ? 'Claiming…' : 'Accept invite →'}
      </button>
      {state === 'error' && <p style={{ color: '#c84a2a', fontSize: 'var(--small-size)' }}>{msg}</p>}
    </>
  );
}
```

- [ ] **Step 4: Verify**

```bash
bun test apps/web/app/api/invite/[token]/claim/route.test.ts
# Also hit the page once locally:
open http://localhost:4100/invite/fake-token
# Expected: "Invite expired" message
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/invite apps/web/app/api/invite
git commit -m "feat(access): /invite/[token] claim page + endpoint"
```

---

## Task 7: Gate marketplace + runtime

**Files:**
- Modify: `apps/web/app/apps/[slug]/page.tsx`
- Create: `services/worker/src/router/access-gate.ts`
- Create: `services/worker/src/router/access-gate.test.ts`
- Modify: `services/worker/src/app.ts`

- [ ] **Step 1: Guard the marketplace page**

Add to the top of `apps/web/app/apps/[slug]/page.tsx` (in the server component, before any other DB lookup):

```ts
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { checkAccess } from '@/lib/access/check';
import { verifyInviteGrant, inviteCookieName } from '@/lib/access/invite-cookie';

// ...inside the page component after loading the app row:
async function resolveViewer(appSlug: string) {
  const session = await auth();
  const cookieStore = await cookies();
  const raw = cookieStore.get(inviteCookieName(appSlug))?.value;
  const secret = process.env.SHIPPIE_INVITE_SECRET;
  const grant = raw && secret ? await verifyInviteGrant(raw, secret) : null;
  return {
    userId: session?.user?.id,
    email: session?.user?.email ?? undefined,
    inviteCookie: grant ?? undefined,
  };
}

// Replace or augment the 404 fallback:
const viewer = await resolveViewer(app.slug);
const access = await checkAccess({ appId: app.id, slug: app.slug, viewer });
if (access === 'denied') notFound();
```

- [ ] **Step 2: Worker access-gate test**

```ts
// services/worker/src/router/access-gate.test.ts
import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { accessGate } from './access-gate';
import type { AppBindings } from '../app';

const SECRET = 'test-secret-32bytes-aaaaaaaaaaaaaaaa';
process.env.SHIPPIE_INVITE_SECRET = SECRET;

function appWith(meta: { visibility: 'public' | 'private'; slug: string }) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('slug', meta.slug);
    c.set('traceId', 't');
    await next();
  });
  app.use(
    '*',
    accessGate({
      loadMeta: async () => ({ visibility_scope: meta.visibility, slug: meta.slug }),
    }),
  );
  app.get('*', (c) => c.text('ok'));
  return app;
}

describe('accessGate', () => {
  test('public: serves', async () => {
    const app = appWith({ visibility: 'public', slug: 'pub' });
    const res = await app.request('/');
    expect(res.status).toBe(200);
  });

  test('private: 401 without cookie', async () => {
    const app = appWith({ visibility: 'private', slug: 'priv' });
    const res = await app.request('/');
    expect(res.status).toBe(401);
  });

  test('private: 200 with valid cookie', async () => {
    const { signInviteGrant, inviteCookieName } = await import('../../../apps/web/lib/access/invite-cookie.ts');
    // This import path will differ in the worker package — copy the helper
    // locally OR publish it as a shared package. Tests here use the shared
    // implementation; keep the worker copy byte-identical.
    const token = await signInviteGrant(
      { sub: 'a', app: 'priv', tok: 'x', src: 'invite_link', exp: Math.floor(Date.now() / 1000) + 60 },
      SECRET,
    );
    const app = appWith({ visibility: 'private', slug: 'priv' });
    const res = await app.request('/', {
      headers: { cookie: `${inviteCookieName('priv')}=${token}` },
    });
    expect(res.status).toBe(200);
  });
});
```

**Important:** the access gate runs inside the Worker, which doesn't have `@/lib/access/invite-cookie`. Either (a) publish `signInviteGrant` / `verifyInviteGrant` as a shared package (`packages/access`) OR (b) duplicate the small file into `services/worker/src/`. Prefer (a) for a single source of truth. Add a new package before this step if needed. The test import above assumes the shared-package path is in place.

- [ ] **Step 3: Implement access-gate**

```ts
// services/worker/src/router/access-gate.ts
import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../app';
import { verifyInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';

interface AccessMeta {
  visibility_scope: 'public' | 'unlisted' | 'private';
  slug: string;
}

export function accessGate(deps: {
  loadMeta: (slug: string, env: AppBindings['Bindings']) => Promise<AccessMeta | null>;
}): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (c.req.path.startsWith('/__shippie/')) return next();
    const meta = await deps.loadMeta(c.var.slug, c.env);
    if (!meta) return next();
    if (meta.visibility_scope !== 'private') return next();

    const secret = c.env.INVITE_SECRET ?? process.env.SHIPPIE_INVITE_SECRET;
    if (!secret) return c.text('server misconfigured', 500);

    const cookieHeader = c.req.header('cookie') ?? '';
    const match = cookieHeader.match(new RegExp(`${inviteCookieName(meta.slug)}=([^;]+)`));
    if (match) {
      const grant = await verifyInviteGrant(match[1]!, secret);
      if (grant && grant.app === meta.slug) return next();
    }

    return c.html(
      `<!doctype html><html><head><title>Invite required</title><meta name="robots" content="noindex"></head>
       <body style="font-family:system-ui,sans-serif;padding:3rem;text-align:center">
         <h1>Invite required</h1>
         <p>This app is private. Ask the owner for an invite link.</p>
       </body></html>`,
      401,
    );
  };
}
```

- [ ] **Step 4: Wire into the Worker**

In `services/worker/src/app.ts`, insert before the wrap-dispatch middleware added in Phase A:

```ts
app.use('*', accessGate({
  loadMeta: async (slug, env) => {
    const raw = await env.APP_CONFIG.get(`apps:${slug}:meta`, { type: 'json' });
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as { visibility_scope?: string };
    return {
      slug,
      visibility_scope: r.visibility_scope === 'private' ? 'private' : r.visibility_scope === 'unlisted' ? 'unlisted' : 'public',
    };
  },
}));
```

And in the deploy helpers (`apps/web/lib/deploy/kv.ts`), write `apps:{slug}:meta` alongside the existing CSP/wrap entries, with `visibility_scope` reflected from the DB.

- [ ] **Step 5: Run tests + verify**

```bash
bun test services/worker/src/router/access-gate.test.ts
bun test apps/web
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add services/worker/src apps/web/app/apps apps/web/lib/deploy/kv.ts
git commit -m "feat(access): runtime + marketplace gates for private apps"
```

---

## Task 8: Public-surface filter audit

**Files:**
- Verify-only: `apps/web/lib/shippie/leaderboards.ts`, `apps/web/app/apps/page.tsx`, sitemap, RSS

- [ ] **Step 1: Confirm each public query filters `visibility_scope = 'public'`**

```bash
grep -rn "visibility_scope" apps/web/lib apps/web/app | grep -v test
```

Every hit should be one of:
- `= 'public'` in a public-listing query
- `in ('public', 'unlisted')` in a by-slug listing where the viewer has the URL

If any path allows `'private'` to leak, add the filter and a test.

- [ ] **Step 2: Negative test — seed a private app, assert it doesn't appear**

```ts
// apps/web/lib/shippie/leaderboards.private.test.ts
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { queryNew } from './leaderboards';

const MAKER = '00000000-0000-0000-0000-000000000001';

describe('leaderboards hides private', () => {
  test('queryNew excludes visibility_scope=private', async () => {
    const db = await getDb();
    const slug = 'priv-lead-test';
    await db.delete(schema.apps).where(eq(schema.apps.slug, slug));
    await db.insert(schema.apps).values({
      slug, name: slug, type: 'app', category: 'tools',
      makerId: MAKER, sourceType: 'zip',
      visibilityScope: 'private',
      activeDeployId: null,
    });
    const rows = await queryNew(db, {});
    expect(rows.find((r) => r.slug === slug)).toBeUndefined();
  });
});
```

Run:
```bash
bun test apps/web/lib/shippie/leaderboards.private.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/shippie
git commit -m "test(access): verify leaderboards exclude private apps"
```

---

## Task 9: Dashboard access-management page

**Files:**
- Create: `apps/web/app/dashboard/apps/[slug]/access/page.tsx`

- [ ] **Step 1: Page with invite list + create form**

```tsx
// apps/web/app/dashboard/apps/[slug]/access/page.tsx
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { SiteNav } from '@/app/components/site-nav';
import { CreateInviteForm } from './create-invite-form';
import { InviteRow } from './invite-row';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();

  const db = await getDb();
  const [app] = await db
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app || app.makerId !== session.user.id) notFound();

  const invites = await db
    .select()
    .from(schema.appInvites)
    .where(eq(schema.appInvites.appId, app.id))
    .orderBy(schema.appInvites.createdAt);

  const access = await db
    .select()
    .from(schema.appAccess)
    .where(eq(schema.appAccess.appId, app.id));

  return (
    <>
      <SiteNav />
      <main
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: 'var(--space-xl)',
          paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))',
        }}
      >
        <header style={{ marginBottom: 'var(--space-xl)' }}>
          <p className="eyebrow">Access · {app.name}</p>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', letterSpacing: '-0.02em' }}>
            Who can see this app
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Visibility: <strong>{app.visibilityScope}</strong>.{' '}
            {app.visibilityScope === 'private'
              ? 'Only people on the access list or holding a valid invite can see this app.'
              : 'This app is visible to everyone.'}
          </p>
        </header>

        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 'var(--space-md)' }}>
            Create invite link
          </h2>
          <CreateInviteForm slug={slug} />
        </section>

        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 'var(--space-md)' }}>
            Active invites
          </h2>
          {invites.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>No invites yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {invites.map((inv) => <InviteRow key={inv.id} invite={inv} slug={slug} />)}
            </div>
          )}
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 'var(--space-md)' }}>
            Access list
          </h2>
          {access.length === 0 ? (
            <p style={{ color: 'var(--text-light)' }}>Nobody has claimed yet.</p>
          ) : (
            <ul>
              {access.map((a) => (
                <li key={a.id}>{a.userId ?? a.email} — {a.source} — {a.grantedAt.toISOString()}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
```

```tsx
// apps/web/app/dashboard/apps/[slug]/access/create-invite-form.tsx
'use client';
import { useState } from 'react';

export function CreateInviteForm({ slug }: { slug: string }) {
  const [maxUses, setMaxUses] = useState('');
  const [expiresDays, setExpiresDays] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    const body: Record<string, unknown> = { kind: 'link' };
    if (maxUses) body.max_uses = Number(maxUses);
    if (expiresDays) {
      const d = new Date();
      d.setDate(d.getDate() + Number(expiresDays));
      body.expires_at = d.toISOString();
    }
    const res = await fetch(`/api/apps/${slug}/invites`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j.url) setUrl(j.url); else setError(j.error ?? 'Failed');
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Max uses (optional)</span>
        <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="unlimited" style={fieldStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Expires in (days)</span>
        <input value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="never" style={fieldStyle} />
      </label>
      <button onClick={submit} className="btn-primary" style={{ height: 40 }}>Create link</button>
      {url && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--sunset)' }}>
          {url}
        </p>
      )}
      {error && <p style={{ color: '#c84a2a' }}>{error}</p>}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  height: 40, padding: '0 0.75rem', background: 'transparent',
  border: '1px solid var(--border-default)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 14, width: 140,
};
```

```tsx
// apps/web/app/dashboard/apps/[slug]/access/invite-row.tsx
'use client';
import { useState } from 'react';

export function InviteRow({ invite, slug }: { invite: { id: string; token: string; kind: string; maxUses: number | null; usedCount: number; expiresAt: Date | null }; slug: string }) {
  const [revoked, setRevoked] = useState(false);
  async function revoke() {
    const res = await fetch(`/api/apps/${slug}/invites/${invite.id}`, { method: 'DELETE' });
    if (res.ok) setRevoked(true);
  }
  if (revoked) return null;
  const host = typeof window !== 'undefined' ? window.location.host : 'shippie.app';
  const url = `https://${host}/invite/${invite.token}`;
  const uses = invite.maxUses == null ? 'unlimited' : `${invite.maxUses - invite.usedCount} left`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-sm)', border: '1px solid var(--border-light)' }}>
      <code style={{ fontSize: 13 }}>{url}</code>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{uses}</span>
      <button onClick={() => navigator.clipboard.writeText(url)} className="btn-secondary" style={{ marginLeft: 'auto', height: 32, padding: '0 0.75rem', fontSize: 13 }}>Copy</button>
      <button onClick={revoke} className="btn-secondary" style={{ height: 32, padding: '0 0.75rem', fontSize: 13 }}>Revoke</button>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

```bash
open http://localhost:4100/dashboard/apps/wrap-demo/access
```

Sign in, create an invite, copy the URL, open in an incognito window, claim.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/dashboard/apps
git commit -m "feat(access): /dashboard/apps/:slug/access invite management UI"
```

---

## Task 10: CLI `shippie invite` commands

**Files:**
- Create: `packages/cli/src/commands/invite.ts` + `.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Test + implementation**

```ts
// packages/cli/src/commands/invite.test.ts
import { describe, expect, test, mock } from 'bun:test';

mock.module('../api.js', () => ({
  postJson: async (path: string) => ({ invite: { id: 'i-1', token: 'tok123' }, url: `https://shippie.app${path}` }),
  getJson: async () => ({ invites: [{ id: 'i-1', token: 'tok123', kind: 'link', usedCount: 0, maxUses: null }] }),
  delJson: async () => ({ success: true }),
}));

const { inviteCreate, inviteList, inviteRevoke } = await import('./invite');

describe('invite CLI', () => {
  test('create prints URL', async () => {
    const out: string[] = [];
    await inviteCreate({ slug: 'mevrouw', log: (s) => out.push(s) });
    expect(out.join('\n')).toContain('tok123');
  });

  test('list shows active invites', async () => {
    const out: string[] = [];
    await inviteList({ slug: 'mevrouw', log: (s) => out.push(s) });
    expect(out.join('\n')).toContain('tok123');
  });

  test('revoke calls DELETE', async () => {
    const out: string[] = [];
    await inviteRevoke({ slug: 'mevrouw', id: 'i-1', log: (s) => out.push(s) });
    expect(out.join('\n')).toContain('revoked');
  });
});
```

```ts
// packages/cli/src/commands/invite.ts
import { postJson, getJson, delJson } from '../api.js';

export async function inviteCreate(opts: { slug: string; maxUses?: number; expiresDays?: number; log?: (s: string) => void }) {
  const log = opts.log ?? console.log;
  const body: Record<string, unknown> = { kind: 'link' };
  if (opts.maxUses) body.max_uses = opts.maxUses;
  if (opts.expiresDays) {
    const d = new Date(); d.setDate(d.getDate() + opts.expiresDays);
    body.expires_at = d.toISOString();
  }
  const res = await postJson<{ invite: { id: string; token: string }; url: string }>(
    `/api/apps/${opts.slug}/invites`, body,
  );
  log(`✓ invite created`);
  log(`  url: ${res.url}`);
  log(`  token: ${res.invite.token}`);
}

export async function inviteList(opts: { slug: string; log?: (s: string) => void }) {
  const log = opts.log ?? console.log;
  const res = await getJson<{ invites: Array<{ id: string; token: string; kind: string; usedCount: number; maxUses: number | null }> }>(
    `/api/apps/${opts.slug}/invites`,
  );
  for (const inv of res.invites) {
    const uses = inv.maxUses == null ? 'unlimited' : `${inv.maxUses - inv.usedCount} left`;
    log(`  ${inv.token}  ${inv.kind}  ${uses}`);
  }
}

export async function inviteRevoke(opts: { slug: string; id: string; log?: (s: string) => void }) {
  const log = opts.log ?? console.log;
  await delJson(`/api/apps/${opts.slug}/invites/${opts.id}`);
  log(`✓ revoked`);
}
```

Register in `packages/cli/src/index.ts`:

```ts
if (command === 'invite') {
  const slug = String(args._[1] ?? '');
  if (!slug) throw new Error('usage: shippie invite <slug> [--max-uses N] [--expires D]');
  const { inviteCreate } = await import('./commands/invite.js');
  await inviteCreate({ slug, maxUses: args.maxUses as number | undefined, expiresDays: args.expires as number | undefined });
  return;
}
if (command === 'invites') {
  const slug = String(args._[1] ?? '');
  const { inviteList } = await import('./commands/invite.js');
  await inviteList({ slug });
  return;
}
if (command === 'invite:revoke') {
  const slug = String(args._[1] ?? '');
  const id = String(args._[2] ?? '');
  const { inviteRevoke } = await import('./commands/invite.js');
  await inviteRevoke({ slug, id });
  return;
}
```

(The `api.js` module needs `getJson` and `delJson` — add them if missing, same shape as `postJson`.)

- [ ] **Step 2: Verify + commit**

```bash
bun test packages/cli/src/commands/invite.test.ts
git add packages/cli/src
git commit -m "feat(cli): shippie invite / invites / invite:revoke"
```

---

## Task 11: End-to-end private-invite flow

**Files:**
- Create: `apps/web/e2e/private-invite.spec.ts`

- [ ] **Step 1: Write e2e**

```ts
// apps/web/e2e/private-invite.spec.ts
import { test, expect } from '@playwright/test';

test('private app invite flow', async ({ page, request, context }) => {
  // Sign in as maker
  await page.goto('http://localhost:4100/auth/signin');
  await page.getByText('Dev: sign in as').click();
  await page.waitForURL(/\/dashboard/);
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Wrap something privately (uses Phase A endpoint + Phase B flag)
  const slug = `e2e-priv-${Math.random().toString(36).slice(2, 8)}`;
  const wrapRes = await request.post('http://localhost:4100/api/deploy/wrap', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: {
      slug,
      upstream_url: 'http://localhost:4100/docs',
      name: slug,
      type: 'app',
      category: 'tools',
      visibility_scope: 'private', // Phase B adds this field
    },
  });
  expect(wrapRes.ok()).toBe(true);

  // Private app does NOT appear on /apps
  const appsPage = await request.get('http://localhost:4100/apps');
  expect(await appsPage.text()).not.toContain(slug);

  // Control-plane marketplace page is 404 for anonymous
  const ctxAnon = await request.newContext();
  const anon = await ctxAnon.get(`http://localhost:4100/apps/${slug}`);
  expect(anon.status()).toBe(404);

  // Runtime returns 401
  const runtimeAnon = await request.get('http://localhost:4200/', {
    headers: { host: `${slug}.localhost` },
  });
  expect(runtimeAnon.status()).toBe(401);

  // Maker creates an invite
  const invRes = await request.post(`http://localhost:4100/api/apps/${slug}/invites`, {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: { kind: 'link' },
  });
  const inv = await invRes.json();

  // Anonymous claims invite → gets cookie → can load runtime
  const claimRes = await ctxAnon.post(`http://localhost:4100/api/invite/${inv.invite.token}/claim`);
  expect(claimRes.ok()).toBe(true);

  const claimCookies = (await claimRes.headersArray()).find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '';
  const cookieMatch = claimCookies.match(/__Secure-shippie_invite_[^=]+=[^;]+/);
  expect(cookieMatch).not.toBeNull();

  const runtimeWithCookie = await request.get('http://localhost:4200/', {
    headers: { host: `${slug}.localhost`, cookie: cookieMatch![0] },
  });
  expect(runtimeWithCookie.status()).toBe(200);
  expect(await runtimeWithCookie.text()).toContain('__shippie/sdk.js');
});
```

- [ ] **Step 2: Run + commit**

```bash
bun run --cwd apps/web e2e private-invite.spec.ts
git add apps/web/e2e
git commit -m "test(access): e2e private + invite + runtime gate"
```

---

## Task 12: Final sweep

- [ ] **Step 1: Typecheck**

```bash
bunx tsc --noEmit -p apps/web/tsconfig.json
bunx tsc --noEmit -p services/worker/tsconfig.json
bunx tsc --noEmit -p packages/cli/tsconfig.json
```

Expected: all exit 0.

- [ ] **Step 2: All tests**

```bash
bun test apps/web services/worker packages/cli
```

Expected: green.

- [ ] **Step 3: Manual demo — the mevrouw-shaped end state**

```bash
# 1. wrap a private app
curl -sS -X POST http://localhost:4100/api/deploy/wrap \
  -H "cookie: $(cat ~/.shippie-dev-cookie)" \
  -H 'content-type: application/json' \
  -d '{"slug":"priv-demo","upstream_url":"http://localhost:4100/docs","name":"Priv Demo","type":"app","category":"tools","visibility_scope":"private"}'

# 2. create an invite
curl -sS -X POST http://localhost:4100/api/apps/priv-demo/invites \
  -H "cookie: $(cat ~/.shippie-dev-cookie)" \
  -H 'content-type: application/json' \
  -d '{"kind":"link"}'
# Note the URL.

# 3. open the invite URL in a private browser window, click "Accept invite →"
# 4. confirm the app loads at priv-demo.localhost:4200
# 5. confirm /apps and /leaderboards don't list the app
```

Expected: invited visitor sees + installs the app; uninvited visitors 404 / 401.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: private apps + link invites" --body ...
```

---

## Self-review notes

- All steps have complete code, no placeholders
- `packages/db/src/schema/index.ts` export path verified; if it's a barrel of `export * from './apps.ts'`-style lines, the new lines slot in cleanly
- The invite-cookie helper is duplicated between control plane (`apps/web/lib/access/invite-cookie.ts`) and the worker; Task 7 flags this and recommends a shared `@shippie/access` package. If that package doesn't already exist, add it as a prerequisite before Task 7 (~15 min of work: copy the file, register in workspace, add export).
- `process.env.SHIPPIE_INVITE_SECRET` must be set in both control plane + worker env. Add it to `apps/web/.env.example` and the worker env schema.
- `deploys.sourceKind` / `sourceRef` used in Phase A plan; verify in Phase B too since private static apps reuse the same path.
- Phase C (email invites) explicitly not shipped here. All `kind: 'email'` paths return 501.
