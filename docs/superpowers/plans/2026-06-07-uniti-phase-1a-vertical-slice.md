# Uniti Phase 1A — Cloudlet Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Work in an isolated worktree off the Shippie repo (`superpowers:using-git-worktrees`). Parent: `2026-06-07-uniti-shippie-private-cloud.md`.

**Goal:** Prove the reusable Shippie-Private-Cloud pattern end-to-end on ONE school: provision a private Uniti instance → office manager logs in → the school's isolated DO+SQLite workspace exists → write ONE append-only event to *that school only* → audit proves the boundary.

**Architecture:** A new `@shippie/cloudlet-contract` package holds the reusable interfaces (implement only the Phase-1A path). The control plane is a new `private_app_instances` table in the existing platform D1 (metadata only — no pupil data). Each school's private data lives in a new `SchoolWorkspace` Durable Object with embedded SQLite. SQLite logic is isolated behind a `WorkspaceStore` class (testable in Node) so we don't need a Workers test pool for unit tests. All of Phase 1A lives inside `apps/platform` (which already has D1 + DO + Lucia + wrangler wired); the dedicated `apps/uniti-school` Worker is deferred to Phase 3.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite) · D1 + Drizzle · Lucia v3 · SvelteKit `+server.ts` · vitest (platform) · bun:test (`@shippie/cloudlet-contract`).

---

## Grounding anchors (read these existing files before starting — match their patterns exactly)
- DB client + schema barrel: `apps/platform/src/lib/server/db/client.ts` (`getDrizzleClient(env.DB)`, `schema`)
- Migrations dir + naming: `apps/platform/drizzle/` (`NNNN_*.sql`; latest is `0055_session_context.sql` → new = `0056_*`)
- Schema example to mirror: `apps/platform/src/lib/server/db/schema/spaces.ts`
- Audit: `apps/platform/src/lib/server/admin/audit.ts` (`recordAudit(db, { actorUserId, action, targetTable, targetId, before?, after? })`)
- Auth in routes: `apps/platform/src/routes/api/deploy/+server.ts` (`resolveRequestUserId(event)`, `platform.env.DB`, rate-limit, `json()`)
- DO example: `apps/platform/src/lib/server/proximity/signal-room.ts` + its binding in `apps/platform/wrangler.toml`
- Package export convention: `packages/local-db/package.json` (exports → `./src/index.ts`; `bun test`)
- Health gate: `bun run health` (typecheck + test + build). Platform tests are **vitest only**.

## Decision to confirm before Task 4 (one open item)
The minimal office-manager UI for this slice lives as platform routes under `apps/platform/src/routes/uniti/*`. The dedicated `apps/uniti-school` Worker app is **deferred to Phase 3** (standing up a second Worker + cross-domain auth is its own task and not needed to prove the boundary). If you want `apps/uniti-school` scaffolded now, that's an added task — flag it; default is platform routes.

## File structure (created/modified)
```
packages/cloudlet-contract/                      [NEW package @shippie/cloudlet-contract]
  package.json · tsconfig.json
  src/index.ts                                   re-exports
  src/roles.ts          Role union + ROLES list
  src/events.ts         WorkspaceEvent type
  src/provisioning.ts   PrivateAppProvisioning, PrivateAppInstance, Branding, ExportManifest
  src/index.test.ts     bun:test shape/exhaustiveness tests

apps/platform/
  drizzle/0056_private_app_instances.sql         [NEW migration — control plane only]
  src/lib/server/db/schema/private-app-instances.ts   [NEW Drizzle schema]
  src/lib/server/db/schema/index.ts              [MODIFY — export new schema]
  src/lib/server/cloudlet/workspace-store.ts     [NEW — SqlExecutor + WorkspaceStore (testable)]
  src/lib/server/cloudlet/workspace-store.test.ts[NEW — vitest, Node sqlite]
  src/lib/server/cloudlet/school-workspace.ts    [NEW — SchoolWorkspace Durable Object]
  src/lib/server/cloudlet/provisioning.ts        [NEW — createPrivateAppInstance]
  src/lib/server/cloudlet/provisioning.test.ts   [NEW — vitest, mocked DB+DO]
  src/lib/server/cloudlet/resolve-instance.ts    [NEW — map user→instance, scope guard]
  src/routes/api/cloudlet/instances/+server.ts             [NEW — POST provision / GET list]
  src/routes/api/cloudlet/instances/[slug]/events/+server.ts [NEW — POST append / GET list (scoped)]
  src/routes/uniti/+page.svelte                  [NEW — minimal office-manager flow]
  wrangler.toml                                  [MODIFY — SCHOOL_WORKSPACE DO binding + migration tag]
```

---

## Task 0: Scaffold `@shippie/cloudlet-contract` package

**Files:** Create `packages/cloudlet-contract/{package.json,tsconfig.json,src/index.ts,src/roles.ts,src/events.ts,src/provisioning.ts,src/index.test.ts}`

- [ ] **Step 1: package.json** (mirror `packages/local-db/package.json` exports + test convention)
```json
{
  "name": "@shippie/cloudlet-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": { "test": "bun test", "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.7.0" }
}
```
Add `tsconfig.json` extending the repo base (copy from `packages/local-db/tsconfig.json`).

- [ ] **Step 2: write the failing contract test** `src/index.test.ts`
```ts
import { test, expect } from 'bun:test';
import { ROLES, type Role } from './index';

test('ROLES contains the eight cloudlet roles', () => {
  expect(ROLES).toEqual([
    'owner','school_admin','office_manager','leader',
    'teacher','teaching_assistant','specialist','viewer',
  ]);
});

test('a WorkspaceEvent requires dedupe + tenancy fields', () => {
  const e = {
    clientEventId: 'c1', type: 'feedback.created', instanceId: 'i1',
    actorUserId: 'u1', deviceId: 'd1', createdOfflineAt: '2026-06-07T00:00:00Z',
    schemaVersion: 1, payload: {},
  } satisfies import('./events').WorkspaceEvent;
  expect(e.clientEventId).toBe('c1');
});
```

- [ ] **Step 3: run it, expect FAIL** — `cd packages/cloudlet-contract && bun test` → fails (module not found).

- [ ] **Step 4: implement the types**
`src/roles.ts`:
```ts
export const ROLES = [
  'owner','school_admin','office_manager','leader',
  'teacher','teaching_assistant','specialist','viewer',
] as const;
export type Role = (typeof ROLES)[number];
```
`src/events.ts`:
```ts
export interface WorkspaceEvent {
  clientEventId: string;   // server dedupes on (instanceId, clientEventId)
  type: string;            // e.g. 'feedback.created'
  instanceId: string;      // which school instance
  actorUserId: string;
  deviceId: string;
  createdOfflineAt: string;// ISO, client clock
  schemaVersion: number;
  payload: unknown;
}
```
`src/provisioning.ts`:
```ts
export interface Branding { displayName: string; primaryColor?: string; logoUrl?: string; }
export interface PrivateAppInstance {
  id: string;            // IMMUTABLE instance identity (UUID). The DO derives from `uniti:${id}` — NEVER from slug.
  appId: string;         // 'uniti' (logical app key)
  appRef: string;        // Shippie apps.id row this instance belongs to (the private Uniti app)
  spaceId: string;       // Shippie space (install record) representing this school
  slug: string;          // mutable, human-friendly alias (UNIQUE) — must NOT be the data-boundary identity
  name: string; region: string;
  branding: Branding; ownerEmail: string; modules: string[];
  workspaceDoId: string; createdAt: string;
}
export interface ExportManifest { instanceId: string; files: string[]; generatedAt: string; }
export interface CreatePrivateAppInstanceInput {
  appId: string; tenantName: string; slug: string; branding: Branding;
  ownerEmail: string; region: string; modules: string[];
  dataBoundary: 'dedicated-school-workspace';
}
export interface PrivateAppProvisioning {
  createPrivateAppInstance(input: CreatePrivateAppInstanceInput): Promise<PrivateAppInstance>;
  getInstance(instanceId: string): Promise<PrivateAppInstance | null>;
  deprovision(instanceId: string, mode: 'export' | 'erase'): Promise<ExportManifest>;
}
```
`src/index.ts`:
```ts
export * from './roles';
export * from './events';
export * from './provisioning';
```

- [ ] **Step 5: run it, expect PASS** — `bun test` → green. Then `bun run typecheck`.

- [ ] **Step 6: commit** — `git add packages/cloudlet-contract && git commit -m "feat(cloudlet): contract package — roles, events, provisioning interfaces"`

---

## Task 1: Control-plane table `private_app_instances` (metadata only)

**Files:** Create `apps/platform/drizzle/0056_private_app_instances.sql`, `apps/platform/src/lib/server/db/schema/private-app-instances.ts`; Modify the schema barrel (`…/db/schema/index.ts`).

- [ ] **Step 1: migration SQL** `0056_private_app_instances.sql` (NO pupil data — control plane only)
```sql
CREATE TABLE private_app_instances (
  id TEXT PRIMARY KEY,                  -- IMMUTABLE UUID (crypto.randomUUID()); the data-boundary identity. NEVER the slug.
  app_id TEXT NOT NULL,                 -- 'uniti' (logical key)
  app_ref TEXT NOT NULL,                -- FK→apps.id : the Shippie private app row (visibilityScope='private')
  space_id TEXT NOT NULL,               -- FK→spaces.id : the Shippie install record for this school
  slug TEXT NOT NULL UNIQUE,            -- mutable friendly alias ('greenfield-primary')
  name TEXT NOT NULL,                   -- 'Greenfield Primary'
  region TEXT NOT NULL DEFAULT 'uk',
  branding TEXT NOT NULL DEFAULT '{}',  -- JSON
  owner_email TEXT NOT NULL,
  modules TEXT NOT NULL DEFAULT '[]',   -- JSON array
  workspace_do_id TEXT NOT NULL,        -- toString of idFromName(`uniti:${id}`) — derived from the immutable id
  created_by TEXT,                      -- users.id of admin who provisioned
  created_at INTEGER NOT NULL           -- unix ms
);
CREATE INDEX idx_private_app_instances_app ON private_app_instances(app_id);
CREATE INDEX idx_private_app_instances_space ON private_app_instances(space_id);
```

- [ ] **Step 2: Drizzle schema** `private-app-instances.ts` (mirror column style of `spaces.ts`)
```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const privateAppInstances = sqliteTable('private_app_instances', {
  id: text('id').primaryKey(),               // immutable UUID — data-boundary identity
  appId: text('app_id').notNull(),
  appRef: text('app_ref').notNull(),         // → apps.id (private Uniti app)
  spaceId: text('space_id').notNull(),       // → spaces.id (Shippie install record)
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  region: text('region').notNull().default('uk'),
  branding: text('branding', { mode: 'json' }).notNull().$type<import('@shippie/cloudlet-contract').Branding>().default({ displayName: '' }),
  ownerEmail: text('owner_email').notNull(),
  modules: text('modules', { mode: 'json' }).notNull().$type<string[]>().default([]),
  workspaceDoId: text('workspace_do_id').notNull(),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  byApp: index('idx_private_app_instances_app').on(t.appId),
  bySpace: index('idx_private_app_instances_space').on(t.spaceId),
}));
```

- [ ] **Step 3: export it** — add `export * from './private-app-instances';` to the schema barrel so `schema.privateAppInstances` resolves (match how `spaces` is exported).

- [ ] **Step 4: typecheck + apply migration locally** — `cd apps/platform && bun run typecheck`; then apply the migration to local D1 per the repo's drizzle workflow (check `package.json` for the `db:migrate`/`drizzle` script; do NOT invent one — use the existing command).

- [ ] **Step 5: commit** — `git add apps/platform/drizzle/0056_private_app_instances.sql apps/platform/src/lib/server/db/schema && git commit -m "feat(cloudlet): private_app_instances control-plane table"`

---

## Task 2: `WorkspaceStore` (testable SQLite logic) + `SchoolWorkspace` Durable Object

**Files:** Create `workspace-store.ts`, `workspace-store.test.ts`, `school-workspace.ts`; Modify `wrangler.toml`.

- [ ] **Step 1: failing test** `workspace-store.test.ts` (vitest, Node — uses `node:sqlite` or better-sqlite3; check which is already a devDep, prefer the one present)
```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite'; // if unavailable, use better-sqlite3 (check devDeps)
import { WorkspaceStore } from './workspace-store';

function store() {
  const db = new DatabaseSync(':memory:');
  const exec = {
    run: (sql: string, ...a: unknown[]) => { db.prepare(sql).run(...a); },
    all: <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as T[],
  };
  const s = new WorkspaceStore(exec); s.init(); return s;
}
const ev = (id: string) => ({ clientEventId: id, type: 'feedback.created', instanceId: 'i1', actorUserId: 'u1', deviceId: 'd1', createdOfflineAt: '2026-06-07T00:00:00Z', schemaVersion: 1, payload: { got: true } });
const RECEIVED = 1_717_800_000_000; // server receipt time, injected (≠ createdOfflineAt)

describe('WorkspaceStore', () => {
  it('seeds workspace_schema_version = 1 on init', () => {
    expect(store().schemaVersion()).toBe(1);
  });
  it('appends an event and reads it back', () => {
    const s = store(); s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents().map(e => e.clientEventId)).toEqual(['c1']);
  });
  it('is append-only and dedupes by clientEventId', () => {
    const s = store(); s.appendEvent(ev('c1'), RECEIVED); s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents()).toHaveLength(1);
  });
  it('audits with SERVER receipt time, not the client event time', () => {
    const s = store(); s.appendEvent(ev('c1'), RECEIVED);
    const row = s.listAudit().find(a => a.action === 'event.appended');
    expect(row?.at).toBe(RECEIVED);                       // server receipt, not Date.parse(createdOfflineAt)
    expect(row?.at).not.toBe(Date.parse('2026-06-07T00:00:00Z'));
  });
});
```

- [ ] **Step 2: run it, expect FAIL** — `cd apps/platform && bunx vitest run src/lib/server/cloudlet/workspace-store.test.ts` → fails (no module).

- [ ] **Step 3: implement `WorkspaceStore`** `workspace-store.ts`
```ts
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

export interface SqlExecutor {
  run(sql: string, ...args: unknown[]): void;
  all<T>(sql: string, ...args: unknown[]): T[];
}
export interface WorkspaceAudit { id: number; action: string; detail: string; at: number; }

const WORKSPACE_SCHEMA_VERSION = 1;

export class WorkspaceStore {
  constructor(private sql: SqlExecutor) {}
  init(): void {
    // events: created_offline_at = CLIENT event time; received_at = SERVER receipt time (separate, amendment #4)
    this.sql.run(`CREATE TABLE IF NOT EXISTS events (
      client_event_id TEXT PRIMARY KEY, type TEXT NOT NULL, instance_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL, device_id TEXT NOT NULL, created_offline_at TEXT NOT NULL,
      received_at INTEGER NOT NULL, schema_version INTEGER NOT NULL, payload TEXT NOT NULL, seq INTEGER NOT NULL)`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS workspace_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)`);
    // workspace_schema_version: clean migration path across hundreds of school workspaces (amendment #3)
    this.sql.run(`CREATE TABLE IF NOT EXISTS workspace_schema_version (version INTEGER NOT NULL)`);
    if ((this.sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM workspace_schema_version`)[0]?.n ?? 0) === 0) {
      this.sql.run(`INSERT INTO workspace_schema_version (version) VALUES (?)`, WORKSPACE_SCHEMA_VERSION);
    }
  }
  schemaVersion(): number { return this.sql.all<{ version: number }>(`SELECT version FROM workspace_schema_version LIMIT 1`)[0]?.version ?? 0; }
  // receivedAt = SERVER/DO receipt time (the DO passes Date.now()); NEVER derived from the client's createdOfflineAt.
  appendEvent(e: WorkspaceEvent, receivedAt: number): { accepted: boolean } {
    const existing = this.sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE client_event_id = ?`, e.clientEventId);
    if ((existing[0]?.n ?? 0) > 0) return { accepted: false };           // dedupe by clientEventId
    const seq = (this.sql.all<{ m: number }>(`SELECT COALESCE(MAX(seq),0) AS m FROM events`)[0]?.m ?? 0) + 1;
    this.sql.run(`INSERT INTO events (client_event_id,type,instance_id,actor_user_id,device_id,created_offline_at,received_at,schema_version,payload,seq)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, e.clientEventId, e.type, e.instanceId, e.actorUserId, e.deviceId, e.createdOfflineAt, receivedAt, e.schemaVersion, JSON.stringify(e.payload), seq);
    this.sql.run(`INSERT INTO workspace_audit (action,detail,at) VALUES (?,?,?)`, 'event.appended', `${e.type}:${e.clientEventId}`, receivedAt);
    return { accepted: true };
  }
  listEvents(): Array<WorkspaceEvent & { receivedAt: number }> {
    return this.sql.all<any>(`SELECT * FROM events ORDER BY seq ASC`).map(r => ({
      clientEventId: r.client_event_id, type: r.type, instanceId: r.instance_id, actorUserId: r.actor_user_id,
      deviceId: r.device_id, createdOfflineAt: r.created_offline_at, receivedAt: r.received_at, schemaVersion: r.schema_version, payload: JSON.parse(r.payload),
    }));
  }
  listAudit(): WorkspaceAudit[] { return this.sql.all<WorkspaceAudit>(`SELECT * FROM workspace_audit ORDER BY id ASC`); }
}
```
> Note: pure & deterministic — `receivedAt` (server receipt) is injected by the DO (`Date.now()`), kept separate from the client's `createdOfflineAt`. Tests pass a fixed `receivedAt`, so no non-determinism.

- [ ] **Step 4: run it, expect PASS** — `bunx vitest run src/lib/server/cloudlet/workspace-store.test.ts` → 3 pass.

- [ ] **Step 5: implement the DO wrapper** `school-workspace.ts` (mirror DO class style of `signal-room.ts`; bind the DO's SQLite to `SqlExecutor`)
```ts
import { DurableObject } from 'cloudflare:workers';
import { WorkspaceStore } from './workspace-store';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

export class SchoolWorkspace extends DurableObject {
  private store: WorkspaceStore;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    const sql = ctx.storage.sql; // DO SQLite
    const exec = {
      run: (q: string, ...a: unknown[]) => { sql.exec(q, ...a); },
      all: <T>(q: string, ...a: unknown[]) => sql.exec(q, ...a).toArray() as T[],
    };
    this.store = new WorkspaceStore(exec);
    this.store.init();
  }
  // RPC methods — callable via the DO stub
  async appendEvent(e: WorkspaceEvent) { return this.store.appendEvent(e, Date.now()); } // server/DO receipt time
  async listEvents() { return this.store.listEvents(); }
  async listAudit() { return this.store.listAudit(); }
  async schemaVersion() { return this.store.schemaVersion(); }
}
```
> `Date.now()` is allowed in a Durable Object (Workers runtime). It is the server receipt time; the pure `WorkspaceStore` stays deterministic because it takes `receivedAt` as a parameter.

- [ ] **Step 6: register the DO** in `apps/platform/wrangler.toml` (mirror the `SignalRoom` binding + add a migrations tag bumping the DO migration list)
```toml
[[durable_objects.bindings]]
name = "SCHOOL_WORKSPACE"
class_name = "SchoolWorkspace"

# add to the existing [[migrations]] list (new tag), with new_sqlite_classes for SQLite-backed DO
[[migrations]]
tag = "v-uniti-1"
new_sqlite_classes = ["SchoolWorkspace"]
```
Export `SchoolWorkspace` from the worker entry so the runtime can find the class (match how `SignalRoom`/`BusPulseSegment` are exported — grep for `export { SignalRoom`).

- [ ] **Step 7: typecheck + commit** — `bun run typecheck` (root or platform); `git add apps/platform/src/lib/server/cloudlet apps/platform/wrangler.toml && git commit -m "feat(cloudlet): SchoolWorkspace DO + testable WorkspaceStore (append-only events + audit)"`

---

## Task 3: Provisioning — `createPrivateAppInstance`

**Files:** Create `provisioning.ts`, `provisioning.test.ts`.

- [ ] **Step 1: failing test** `provisioning.test.ts` (vitest; mock Drizzle insert + DO namespace + recordAudit + the Shippie app/space helpers; verify it generates an IMMUTABLE id, references the Shippie private app + space install record, derives the DO from the id (not the slug), inits the workspace, and audits)
```ts
import { describe, it, expect, vi } from 'vitest';
import { createPrivateAppInstance } from './provisioning';

it('provisions: Shippie app+space install record, control-plane row, DO workspace, audit', async () => {
  const inserted: any[] = [];
  const db = { insert: () => ({ values: (v: any) => { inserted.push(v); return { returning: async () => [v] }; } }) } as any;
  const stub = { listEvents: vi.fn(async () => []) };
  let derivedName = '';
  const ns = { idFromName: (s: string) => { derivedName = s; return { toString: () => `do-${s}` }; }, get: () => stub } as any;
  const audit = vi.fn(async () => {});
  const ensureUnitiApp = vi.fn(async () => ({ appRef: 'app_uniti' }));
  const createSpace = vi.fn(async () => ({ spaceId: 'space_1' }));
  const out = await createPrivateAppInstance(
    { db, schoolWorkspaceNs: ns, recordAudit: audit, ensureUnitiApp, createSpace, newInstanceId: () => 'inst_ABC', actorUserId: 'admin1', now: 1717718400000 },
    { appId: 'uniti', tenantName: 'Greenfield Primary', slug: 'greenfield-primary', branding: { displayName: 'Greenfield Primary' }, ownerEmail: 'office@greenfield.sch.uk', region: 'uk', modules: ['adaptations','feedback'], dataBoundary: 'dedicated-school-workspace' },
  );
  expect(out.id).toBe('inst_ABC');                       // immutable id, NOT derived from slug
  expect(derivedName).toBe('uniti:inst_ABC');            // DO derives from the immutable id, NOT the slug
  expect(out.workspaceDoId).toBe('do-uniti:inst_ABC');
  expect(out.appRef).toBe('app_uniti');                  // references the Shippie private app
  expect(out.spaceId).toBe('space_1');                   // references the Shippie install record (space)
  expect(ensureUnitiApp).toHaveBeenCalled();
  expect(createSpace).toHaveBeenCalled();
  expect(inserted.some((r) => r.slug === 'greenfield-primary' && r.id === 'inst_ABC')).toBe(true);
  expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'private_app_instance.created' }));
});
```

- [ ] **Step 2: run it, expect FAIL** — `bunx vitest run src/lib/server/cloudlet/provisioning.test.ts`.

- [ ] **Step 3: implement** `provisioning.ts` (dependency-injected so it's testable; `now`/`newInstanceId` passed in — no `Date.now()`/`crypto` in the pure fn). The route wires `ensureUnitiApp`/`createSpace` to the real Shippie `apps`/`spaces`/`spaceApps` schema (amendment #6 — this is what makes it "a private app installed through Shippie", not a standalone route).
```ts
import { schema } from '$server/db/client';
import type { CreatePrivateAppInstanceInput, PrivateAppInstance } from '@shippie/cloudlet-contract';

export interface ProvisionDeps {
  db: any;                                  // drizzle client (getDrizzleClient(env.DB))
  schoolWorkspaceNs: DurableObjectNamespace;
  recordAudit: (db: any, e: { actorUserId: string | null; action: string; targetTable: string; targetId: string | null; after?: unknown }) => Promise<unknown>;
  // Shippie private-app model (amendment #6) — route binds these to apps/spaces/spaceApps:
  ensureUnitiApp: (db: any) => Promise<{ appRef: string }>;                 // idempotent: apps row slug='uniti', visibilityScope='private'
  createSpace: (db: any, s: { name: string; createdBy: string | null; appRef: string }) => Promise<{ spaceId: string }>; // spaces + spaceApps install record
  newInstanceId: () => string;             // IMMUTABLE UUID (route: crypto.randomUUID())
  actorUserId: string | null;
  now: number;                              // unix ms (route passes Date.now())
}
export async function createPrivateAppInstance(deps: ProvisionDeps, input: CreatePrivateAppInstanceInput): Promise<PrivateAppInstance> {
  const id = deps.newInstanceId();                                          // IMMUTABLE identity — NEVER the slug
  const { appRef } = await deps.ensureUnitiApp(deps.db);                    // reference the Shippie private app
  const { spaceId } = await deps.createSpace(deps.db, { name: input.tenantName, createdBy: deps.actorUserId, appRef }); // Shippie install record
  const doId = deps.schoolWorkspaceNs.idFromName(`uniti:${id}`).toString(); // DO derives from the immutable id, not the slug
  const row = {
    id, appId: input.appId, appRef, spaceId, slug: input.slug, name: input.tenantName, region: input.region,
    branding: input.branding, ownerEmail: input.ownerEmail, modules: input.modules,
    workspaceDoId: doId, createdBy: deps.actorUserId, createdAt: deps.now,
  };
  await deps.db.insert(schema.privateAppInstances).values(row);
  // init the DO workspace (constructing the stub + first RPC creates the SQLite)
  const stub = deps.schoolWorkspaceNs.get(deps.schoolWorkspaceNs.idFromName(`uniti:${id}`));
  await (stub as any).listEvents();                                         // forces DO construction + init()
  await deps.recordAudit(deps.db, { actorUserId: deps.actorUserId, action: 'private_app_instance.created', targetTable: 'private_app_instances', targetId: id, after: { slug: input.slug, spaceId, appRef } });
  return { id, appId: input.appId, appRef, spaceId, slug: input.slug, name: input.tenantName, region: input.region, branding: input.branding, ownerEmail: input.ownerEmail, modules: input.modules, workspaceDoId: doId, createdAt: new Date(deps.now).toISOString() };
}
```
> The route implements `ensureUnitiApp` (find-or-create the `apps` row, `slug='uniti'`, `visibilityScope='private'`, `type='app'`) and `createSpace` (insert a `spaces` row + a `spaceApps` row linking the space to the Uniti app) using `apps`/`spaces`/`spaceApps` from `…/db/schema`. Match the column names in `spaces.ts`/`apps.ts`.

- [ ] **Step 4: run it, expect PASS**; then `bun run typecheck`.

- [ ] **Step 5: commit** — `git add apps/platform/src/lib/server/cloudlet/provisioning.* && git commit -m "feat(cloudlet): createPrivateAppInstance — control-plane row + DO workspace + audit"`

---

## Task 4: API routes — provision + scoped event append/read

**Files:** Create `instances/+server.ts`, `instances/[slug]/events/+server.ts`, `resolve-instance.ts`.

- [ ] **Step 1: scope guard** `resolve-instance.ts` — return the instance row only if the user is its owner/admin; else `null`.
> ⚠️ **PHASE-1A-ONLY SHORTCUT — DO NOT SHIP TO REAL SCHOOLS.** Matching on `ownerEmail` is a temporary stand-in to prove the boundary. The real model (Phase 2) requires **verified identity (SSO), invites, memberships, and RBAC via `@shippie/access`** — an unverified email must never grant access to a child-data workspace. This function is the single replacement point.
```ts
import { eq } from 'drizzle-orm';
import { schema } from '$server/db/client';
// ⚠️ PHASE-1A-ONLY: ownerEmail match is a temporary boundary proof. Replace with verified
// identity + invites + memberships + RBAC (@shippie/access) before any real school. See plan amendment #5.
export async function resolveInstanceForUser(db: any, slug: string, user: { id: string; email: string; isAdmin: boolean }) {
  const row = await db.query.privateAppInstances.findFirst({ where: eq(schema.privateAppInstances.slug, slug) });
  if (!row) return null;
  if (user.isAdmin || row.ownerEmail.toLowerCase() === user.email.toLowerCase()) return row;
  return null;                              // boundary: not your instance
}
```

- [ ] **Step 2: provision route** `instances/+server.ts` — `POST` (admin only) calls `createPrivateAppInstance`; `GET` lists instances (admin). Match `api/deploy/+server.ts` for auth (`resolveRequestUserId`), `platform.env`, rate-limit, `json()`. Pass `db = getDrizzleClient(env.DB)`, `schoolWorkspaceNs = env.SCHOOL_WORKSPACE`, `recordAudit`, `now = Date.now()`.

- [ ] **Step 3: events route** `instances/[slug]/events/+server.ts`
  - `POST` body = a `WorkspaceEvent` (minus instanceId, set server-side). Resolve user → `resolveInstanceForUser`; if null → 403. Get DO stub by the **immutable id**: `const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`); const stub = env.SCHOOL_WORKSPACE.get(did);` (NOT the slug — slugs can change, the data boundary must not); `await stub.appendEvent({ ...body, instanceId: row.id })`; return result.
  - `GET` → same resolve+scope → derive the stub the same way (`uniti:${row.id}`) → `await stub.listEvents()` → `json({ events })`.

- [ ] **Step 4: route guardrail test** (vitest, source-text + unit on `resolveInstanceForUser`) `resolve-instance.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { resolveInstanceForUser } from './resolve-instance';
const db = (row: any) => ({ query: { privateAppInstances: { findFirst: async () => row } } });
it('denies a user who is neither admin nor owner (the boundary)', async () => {
  const row = { slug: 'a', ownerEmail: 'office@a.uk' };
  expect(await resolveInstanceForUser(db(row), 'a', { id: 'u', email: 'someone@b.uk', isAdmin: false })).toBeNull();
});
it('allows the owner', async () => {
  const row = { slug: 'a', ownerEmail: 'office@a.uk' };
  expect(await resolveInstanceForUser(db(row), 'a', { id: 'u', email: 'office@a.uk', isAdmin: false })).toEqual(row);
});
```

- [ ] **Step 5: run tests + typecheck** — `bunx vitest run src/lib/server/cloudlet` → all green; `bun run typecheck`.

- [ ] **Step 6: commit** — `git add apps/platform/src/routes/api/cloudlet apps/platform/src/lib/server/cloudlet/resolve-instance.* && git commit -m "feat(cloudlet): provision + scoped event API (instance boundary guard)"`

---

## Task 5: Minimal office-manager flow (platform routes)

**Files:** Create `apps/platform/src/routes/uniti/+page.svelte` (+ a `+page.server.ts` load).

- [ ] **Step 1:** `+page.server.ts` — require `locals.user` (redirect to `/auth/login` if absent); load the instance(s) the user owns via `resolveInstanceForUser` over their email; expose `{ user, instance }`.

- [ ] **Step 2:** `+page.svelte` — if no instance: show "No school yet — ask your admin to provision one." If instance: show the school name (branding.displayName) + a single button "Record a test event" that `POST`s one `WorkspaceEvent` (`type:'feedback.created'`, a random-by-time `clientEventId`, `deviceId:'web'`) to `/api/cloudlet/instances/<slug>/events`, then lists events from the `GET`. Plain, on-brand, no jargon. (This is the slice's "open it through Shippie → office manager logs in → write one event" proof, in UI.)

- [ ] **Step 3:** manual run (the integration proof — see `bundled:run`): `cd apps/platform && bun run dev`, then:
  1. As an admin, `POST /api/cloudlet/instances` to provision **two** schools (`greenfield-primary`, `oakwood-junior`) with different `ownerEmail`s.
  2. Sign in as Greenfield's office manager → `/uniti` → record one event → confirm it lists.
  3. `GET /api/cloudlet/instances/oakwood-junior/events` as Greenfield's office manager → **expect 403** (boundary).
  4. Sign in as Oakwood's office manager → `/uniti` → **expect 0 events** (Greenfield's event is not visible — DO isolation proven).
  5. Confirm a `private_app_instance.created` row exists in the platform audit log, and the event + `event.appended` audit live only in Greenfield's DO.

- [ ] **Step 4: commit** — `git add apps/platform/src/routes/uniti && git commit -m "feat(uniti): minimal office-manager flow — provision→login→one event, boundary proven"`

---

## Final: health gate + exit criteria

- [ ] **Run the full gate** — `bun run health` from the repo root. Expected: typecheck + test + build all green (new vitest specs + the `@shippie/cloudlet-contract` bun:test included).
- [ ] **Then:** use `superpowers:finishing-a-development-branch`.

**Exit criteria (the slice is done when ALL hold):**
1. `createPrivateAppInstance` writes a control-plane row in platform D1 **and** provisions a per-school `SchoolWorkspace` DO — verified by Task 3 test + the manual run.
2. An office manager signs in (Lucia) and reaches their school via `/uniti`.
3. One append-only event writes to **that school's DO+SQLite only**; re-posting the same `clientEventId` is de-duped.
4. A different school's office manager gets **403 / 0 events** for the first school — the boundary holds (Task 4 test + manual run steps 3–4).
5. The provision action is in the **platform audit log**; the event is in the **DO's workspace audit** — separation of control-plane vs workspace data is demonstrable.
6. `bun run health` green; no pupil/school data in platform D1 (only the instance metadata row).

## Self-review
- **Coverage:** the user's Phase-1A list (PrivateAppProvisioning · WorkspaceStore · AuditLog · one append-only event · one API · one minimal client/admin flow) + the boundary proof are all covered; RBAC/InviteSystem are stubbed to the slice-sized path (owner/admin check) with a note that Phase 2 swaps in `@shippie/access` + real invites. ✓
- **Grounding:** every platform touchpoint cites an existing file to match (client, audit, auth, DO, wrangler). DO SQLite logic is isolated in `WorkspaceStore` so it's unit-testable in Node (no Workers test pool needed). ✓
- **Determinism:** no `Date.now()`/`Math.random()` inside pure functions/tests — wall-clock is injected (`now`, `createdOfflineAt`). ✓
- **Type consistency:** `WorkspaceEvent`, `PrivateAppInstance`, `Role`, `workspaceDoId`/`workspace_do_id`, `instanceId`/`instance_id` used consistently across contract → store → DO → provisioning → routes. ✓
- **Known deferrals (explicit, not placeholders):** real RBAC + invites (Phase 2), `apps/uniti-school` dedicated Worker (Phase 3), offline outbox/upcasters (Phase 4), Workers-pool integration test for true two-DO isolation (manual run covers it now). ✓
