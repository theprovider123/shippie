# Uniti on Shippie Private Cloud — Master Implementation Plan

> **For agentic workers:** This is a **master/program plan**. It locks architecture, the reusable `@shippie/cloudlet` contracts, and the phase sequence. Each phase marked **→ sub-plan** must be expanded into its own detailed bite-sized spec→plan (via `superpowers:brainstorming` → `superpowers:writing-plans`) *before* implementation with `superpowers:subagent-driven-development`. Do not implement a phase from this document alone — it defines *what* and *exit criteria*, not the per-task TDD steps.

**Goal:** Build a reusable Shippie Private Cloud platform (`@shippie/cloudlet`) and ship Uniti — a classroom-simple, AI-powered teacher adaptation tool — as its first flagship app, with a clickable prototype validating the teacher experience in parallel.

**Architecture:** Three layers, strict separation. **Shippie** delivers the offline-first app shell + branding + installs (no pupil data). **`@shippie/cloudlet`** is the reusable private-cloud layer (tenant provisioning, RBAC, offline sync, AI Broker, audit, files, metering) — built product-agnostic from day one via clean contracts. **Uniti** is the first app consuming the cloudlet (adaptations, pupil feedback, "what works" memory, MIS-ready school setup). Per-school data lives only in that school's isolated workspace; Shippie's platform DB never holds pupil data.

**Tech Stack:** Cloudflare Workers (APIs) · Durable Object + SQLite per school (private workspace + sync coordination) · D1 (control plane: non-sensitive tenant metadata) · R2 (files/exports) · Vectorize (per-school namespace: adaptation memory) · Queues/Workflows (MIS sync, AI jobs, rollups, exports) · Workers AI + external models via AI Gateway (through one AI Broker) · Lucia + Arctic (SSO: Google/Microsoft) · SvelteKit (Shippie app shell) · TypeScript throughout.

---

## REVISION 2026-06-07 (post-feedback) — supersedes conflicting detail below

Three corrections from review, plus grounding from a Shippie-monorepo exploration:

**1. Shippie is ALREADY LIVE — Uniti plugs in as a private app, it does not rebuild Shippie.** Three levels:
- **Shippie Live Platform** — existing public apps, users, deployments, install/update shell, private app distribution. (No pupil data.)
- **Uniti Private App** — a private app *type* listed/installed privately, white-labelled, delivered+updated by Shippie. (No pupil data in Shippie DB.)
- **Uniti School Instance** — one private school: workspace + config + roster + pupil/class data + AI/audit/budget boundary. We need a **repeatable instance factory**.

**2. "Tenant provisioning" → `PrivateAppProvisioning` (an instance factory).** A school is a private *instance* of a Shippie app, not just a tenant. This is the authoritative provisioning contract (the legacy tenant-provisioning naming has been removed from the contracts section below):
```ts
interface PrivateAppProvisioning {
  createPrivateAppInstance(input: {
    appId: string;            // 'uniti'
    tenantName: string;       // 'Greenfield Primary'
    slug: string;             // 'greenfield-primary'
    branding: Branding;
    ownerEmail: string;       // office manager / admin
    region: string;           // 'uk'
    modules: string[];        // ['adaptations','feedback','leadership']
    dataBoundary: 'dedicated-school-workspace';
  }): Promise<PrivateAppInstance>;
  getInstance(instanceId: string): Promise<PrivateAppInstance | null>;
  deprovision(instanceId: string, mode: 'export' | 'erase'): Promise<ExportManifest>;
}
```
It creates: a Shippie **private-app install record** (control plane), the **school workspace** (DO+SQLite), branding/config, an **office-manager invite**, an R2 prefix, an AI budget policy, an audit-log stream, and default roles. Optional custom domain later. **Separation:** Shippie DB = instance metadata only · Uniti workspace (DO+SQLite) = school/pupil/lesson/feedback/adaptation data · AI Broker = keys + model calls server-side only.

**3. Decisions locked:** DO+SQLite-per-school is the default storage/workspace model · target repo = the **Shippie monorepo** (`packages/cloudlet-*`, `apps/uniti-school`; old Uniti kept as reference/IP) · **Phase 1 → Phase 1A vertical slice** (below), not abstract platform work.

### What already exists in Shippie to plug into (do NOT rebuild)
| Need | Plug into (existing) | Files |
|---|---|---|
| School-instance container / private workspace metadata | `@shippie/spaces` + `spaces`/`spaceApps`/`spaceJoinTokens`/`spaceAuditLog` | `apps/platform/src/lib/server/db/schema/spaces.ts` |
| Multi-tenant org + roles + invites + data residency | `organizations`/`organizationMembers`/`organizationInvites` | `…/db/schema/organizations.ts` |
| Private app type | `apps.visibilityScope: 'private'` | `…/db/schema/apps.ts` |
| RBAC primitives | `@shippie/access` | `packages/access/` |
| Audit (before/after) | `recordAudit()` | `…/server/admin/audit.ts` |
| Per-app/user data isolation (code-scoped) | `appData`/`appFiles` | `…/db/schema/app-data.ts` |
| Auth + SSO + sessions | Lucia v3 live + Arctic (Google present) | `…/server/auth/lucia.ts`, `…/auth/google.ts` |
| DB | D1 + Drizzle, `getDrizzleClient(env.DB)`, migrations in `apps/platform/drizzle/NNNN_*.sql` | `…/server/db/client.ts` |
| DO pattern (proven) | `SignalRoom`, `BusPulseSegment` bound in wrangler | `apps/platform/wrangler.toml`, `…/server/proximity/signal-room.ts` |
| API pattern | SvelteKit `+server.ts`, `resolveRequestUserId()` | `apps/platform/src/routes/api/**` |

### Greenfield (build, reusable-first)
Private-app **installation registry** + `appType` · the **`createPrivateAppInstance` factory** · **`SchoolWorkspace` DO+SQLite** (per-school data store — today's DOs are ephemeral coordinators, not tenant stores) · **FeatureFlags** · **AI Broker**.

### Phase 1A — Cloudlet vertical slice (the new Phase 1; full plan in a sibling file)
Prove the reusable pattern end-to-end on ONE school: **provision one private Uniti instance → open it through Shippie → invite office manager → office manager logs in (Lucia) → the school's DO+SQLite workspace exists → write ONE append-only event to *that school only* → audit proves the boundary (a read scoped to another instance cannot see it).** Define all reusable contracts; implement only the Uniti-sized path this slice exercises. Detailed bite-sized plan: `2026-06-07-uniti-phase-1a-vertical-slice.md`.

> Testing: `apps/platform` = **vitest only** (never bun:test); packages (e.g. `@shippie/cloudlet-contract`) = bun:test. Green-light = `bun run health`.

---

## North Star

**Teacher experience:** "Open today's class, see who needs what, tap what happened, get the next best adaptation." Tiny and obvious — no dashboards until useful, no AI prompt boxes, no technical words.

**Infra experience:** Multi-tenant, private, offline-first, AI-governed, reusable across future Shippie apps from day one.

**The product line:** *"Shippie delivers the app. Your school cloud holds the data."*

## Three parallel tracks
1. **Clickable prototype** — teacher look/feel + habit validation (gated on the Claude Design ZIP).
2. **Reusable Shippie Private Cloud (`@shippie/cloudlet`)** — tenant setup, sync, roles, AI Broker, audit, files. Product-agnostic.
3. **Uniti flagship app** — adaptations, pupil feedback, progress memory, MIS-ready school setup.

The discipline that makes Track 2 reusable without slowing Track 3: **reusable *surface* (frozen contracts), Uniti-sized *depth* (implement only what Uniti needs now).** Build the interface for every primitive; implement only the paths Uniti exercises.

---

## The `@shippie/cloudlet` contracts (build these as the platform's frozen public API)

Package `@shippie/cloudlet`. Every Uniti server route depends on these interfaces, never on the underlying Cloudflare primitives directly. This is the reusable layer.

```ts
// ---- Identity & tenancy --------------------------------------------------
type Role =
  | 'owner' | 'school_admin' | 'office_manager' | 'leader'
  | 'teacher' | 'teaching_assistant' | 'specialist' | 'viewer';

interface AuthContext { instanceId: string; userId: string; roles: Role[]; deviceId?: string; }

// 1. PrivateAppProvisioning — see the REVISION block at the top of this doc for the authoritative contract
//    (createPrivateAppInstance / getInstance / deprovision). `instanceId` is the IMMUTABLE identity; the DO
//    derives from `uniti:${instanceId}`; `slug` is a mutable alias and is NEVER the data-boundary identity.

// 2. WorkspaceStore — the ONLY way app code touches school data; every query auto-scoped to instanceId
interface WorkspaceStore { forInstance(instanceId: string): ScopedDb; } // ScopedDb rejects cross-instance access

// 3. RBAC
interface RBAC {
  can(ctx: AuthContext, action: string, resource: { type: string; id?: string }): boolean;
  assignRole(instanceId: string, userId: string, role: Role): Promise<void>;
  rolesFor(instanceId: string, userId: string): Promise<Role[]>;
}

// 4. InviteSystem
interface InviteSystem {
  invite(instanceId: string, email: string, role: Role, scope?: { classIds?: string[] }): Promise<Invite>;
  accept(token: string, identity: { userId: string; email: string }): Promise<Membership>;
  revoke(inviteId: string): Promise<void>;
}

// 5. OfflineSync — append-only event log; the reusable heart of every Shippie private app
interface SyncEvent {
  clientEventId: string;      // server dedupes on this
  type: string;               // e.g. 'feedback.created'
  instanceId: string; userId: string; deviceId: string;
  createdOfflineAt: string;   // ISO; client clock
  schemaVersion: number;      // upcast on read if behind
  payload: unknown;
}
interface OfflineSync {
  push(instanceId: string, events: SyncEvent[]): Promise<{ accepted: string[]; duplicates: string[] }>;
  pull(instanceId: string, cursor: string | null): Promise<{ events: SyncEvent[]; cursor: string }>;
  registerUpcaster(type: string, fromVersion: number, fn: (e: SyncEvent) => SyncEvent): void;
}
// Client SDK (in the Shippie shell): Outbox { enqueue(e); flush(); pendingCount(): number; status(): 'offline'|'syncing'|'synced'; }

// 6. AuditLog — who/what/when/why, per tenant, append-only
interface AuditLog {
  record(e: { instanceId: string; actorId: string; action: string; resource?: string; reason?: string; meta?: object }): Promise<void>;
  query(instanceId: string, filter: { action?: string; from?: string; to?: string }): Promise<AuditEntry[]>;
}

// 7. FileStore
interface FileStore {
  putUpload(instanceId: string, file: Blob, meta: object): Promise<FileRef>;
  getSignedUrl(instanceId: string, ref: FileRef, ttlSeconds: number): Promise<string>;
  exportAll(instanceId: string): Promise<ExportManifest>;
}

// 8. FeatureFlags — modules per school, no code forks
interface FeatureFlags { isEnabled(instanceId: string, moduleKey: string): Promise<boolean>; set(instanceId: string, moduleKey: string, on: boolean): Promise<void>; }

// 9. UsageMetering
type Metric = 'ai_tokens' | 'storage_bytes' | 'sync_events' | 'active_user';
interface UsageMetering { record(instanceId: string, metric: Metric, n: number): Promise<void>; usage(instanceId: string, period: { from: string; to: string }): Promise<UsageReport>; }

// 10. AIBroker — ALL model calls go through here. No provider keys outside this service. The crown jewel.
type Sensitivity = 'group' | 'pseudonymised' | 'identified';
interface AIRequest {
  appId: string; instanceId: string; userId: string;
  purpose: string;                 // e.g. 'adaptation.generate'
  sensitivity: Sensitivity;        // governs redaction/pseudonymisation
  inputRefs: Array<{ kind: string; id: string }>;
  modelPolicy?: { tier: 'local' | 'standard' | 'premium'; allowExternal?: boolean };
  budgetPolicy?: { perRequestTokenCap?: number };
}
interface AIResult<T> { data: T; model: string; cached: boolean; tokens: number; auditId: string; }
interface AIBroker {
  // checks role+consent+AI-setting+budget → safeguarding guard → pseudonymise/redact → route → cache(content-hash) → audit → eval-log
  request<T>(req: AIRequest, outputSchema: object): Promise<AIResult<T>>;
}
```

## Core Uniti domain objects

```ts
// Structured adaptation card (NOT free-form AI text)
interface AdaptationCard {
  id: string; instanceId: string;
  target: { kind: 'pupil' | 'group' | 'class'; ids: string[] };
  objective: string;            // curriculum/scheme objective ref
  need: string;                 // the barrier, teacher-language
  strategy: string;             // one practical move
  teacherAction: string;        // what to do in the room
  whyThis: string;              // reason
  evidence: Array<{ lessonId: string; date: string; note: string }>;
  confidence: 'emerging' | 'established';
  reviewState: 'suggested' | 'accepted' | 'edited' | 'rejected';
  outcome?: 'worked' | 'partly' | 'did_not_work' | 'surprised';
  schemaVersion: number;
}

// Uniti offline event types (all flow through OfflineSync)
// 'feedback.created' | 'adaptation.accepted' | 'adaptation.rejected'
// | 'adaptation.outcome_recorded' | 'note.created' | 'lesson.completed'

// Derived per-pupil "What Works" (aggregate-first, AI-narrated, evidence-linked)
interface PupilWhatWorks {
  pupilId: string; instanceId: string;
  recurringNeeds: Array<{ need: string; count: number; lastSeen: string; crossSubject: boolean }>;
  strategiesThatWork: Array<{ strategy: string; successRate: number; n: number }>;
  strategiesThatDidnt: Array<{ strategy: string; n: number }>;
  objectivesToRevisit: string[];
  confidenceTrend: 'improving' | 'steady' | 'dipping';
  evidenceRefs: Array<{ lessonId: string; date: string }>;
  confidence: 'emerging' | 'established';
  computedAt: string;
}
```

---

## Phase-by-phase plan

Each phase lists **Goal · Deliverables · Reusable/Uniti split · Exit criteria (testable) · Depends on / risk**. Phases marked **→ sub-plan** need full bite-sized expansion before build.

### Phase 0 — Product shape + clickable prototype  → sub-plan
- **Goal:** Validate the teacher habit and lock the look/feel before heavy build.
- **Deliverables:** Shippie-ready design system derived from the Claude Design ZIP; clickable prototype covering: school-branded login, Teacher "Today", visual Class Map, Adaptation Cards, one-tap Pupil Feedback drawer, "What Works" summary, simple Leadership view, Office-manager setup, Privacy/AI controls.
- **Split:** Prototype only (no backend). Design tokens land in the Shippie shell.
- **Exit criteria:** 2–3 design-partner teachers complete the open→tap→understand→improve loop unaided; "would use after a lesson" confirmed; design system tokens exported.
- **Depends on / risk:** **GATING INPUT — the Claude Design ZIP (user to upload).** Risk: teachers find it heavy → iterate before building.

### Phase 1 — Reusable private-cloud foundation (`@shippie/cloudlet`)  → sub-plan
- **Goal:** Stand up the platform layer with frozen contracts; implement only paths Uniti needs.
- **Deliverables:** the 10 contracts above implemented minimally — `PrivateAppProvisioning.createPrivateAppInstance` (DO+D1+Vectorize ns+R2 prefix), `WorkspaceStore` scoped handle, `RBAC` (seed 4 roles: teacher/school_admin/leader/office_manager; interface supports all 8), `AuditLog`, `FeatureFlags`. Control-plane schema (private-app **instance** registry, no pupil data).
- **Split:** 100% reusable platform.
- **Exit criteria:** `createPrivateAppInstance()` provisions an isolated workspace; a cross-instance read is rejected by `ScopedDb`; RBAC denies an unauthorised action; every privileged call writes an audit entry; contracts have a parity/contract test.
- **Depends on / risk:** Cloudflare account/provisioning. Risk: **schema migration across N school DBs** — define the migration runner now (versioned migrations applied per workspace via Queue/Workflow); **cross-tenant analytics** — rollups pushed to control plane, never cross-DO queries.

### Phase 2 — School setup (onboarding)  → sub-plan
- **Goal:** Onboarding that feels magical; two setup paths.
- **Deliverables:** Managed setup (we create school, branding, first admin, roster); office-manager self-setup (invite staff, check classes, assign roles); SSO architecture (Google/Microsoft via Lucia+Arctic) wired; the 5-step visible flow (School → Staff → Pupils/classes → Privacy+AI → Ready) as green-tick checklists.
- **Split:** InviteSystem + RBAC + PrivateAppProvisioning reusable; the setup *screens* are Uniti.
- **Exit criteria:** an office manager invites a teacher, who signs in via SSO and sees their classes; privacy/AI defaults set per school; no technical jargon in the UI.
- **Depends on / risk:** SSO app registration (Google/MS). Risk: SSO consent/admin-approval lead time.

### Phase 3 — Uniti teacher MVP (first usable product)  → sub-plan
- **Goal:** The core loop, brutally simple, working *without* AI first.
- **Deliverables:** screens — Today, Class Map, Lesson Adaptations, Pupil Feedback drawer, What Works summary (placeholder), Sync status. Adaptation cards **rules-based/manual** at first. CSV/manual roster import.
- **Split:** OfflineSync (Phase 4 contract) consumed; screens are Uniti.
- **Exit criteria:** a teacher opens a lesson, sees the class map, captures one-tap feedback for a class in <2 minutes, marks an adaptation outcome — fully offline — and it persists.
- **Depends on / risk:** Phase 0 design + Phase 1 foundation. Risk: capture friction → keep it ≤2 taps.

### Phase 4 — Offline sync engine  → sub-plan
- **Goal:** Robust append-only event sync; reusable across future apps.
- **Deliverables:** `OfflineSync` server (DO-coordinated dedupe by `clientEventId`, ordering by device seq + `createdOfflineAt`, schema-version upcasters); client `Outbox` (Service-Worker Background Sync, backoff, pending count); conflict policy (feedback append-only; roster changes never delete historic evidence — attach to tombstones); status strings ("Saved offline" / "Syncing" / "Synced to school cloud").
- **Split:** 100% reusable platform.
- **Exit criteria:** events captured offline across an app-version bump sync without loss; duplicates de-duped; a removed pupil's offline feedback is preserved against a tombstone; no overwrite of feedback.
- **Depends on / risk:** Phase 1. Risk: clock skew/ordering — keep events commutative (append-only).

### Phase 5 — AI Broker + structured adaptation engine  → sub-plan
- **Goal:** All AI behind one governed service; adaptations as structured objects.
- **Deliverables:** `AIBroker.request()` — consent/AI-setting/role/budget checks → safeguarding guard (exclusion-as-safe-default) → pseudonymise/redact → model routing (Workers AI ↔ external via AI Gateway) → content-hash cache → audit → eval-log. Context builder (minimum relevant data) + pseudonymiser. AdaptationCard generation returning the structured object; rules layer (no deficit/diagnosis language).
- **Split:** AIBroker reusable; adaptation prompts/objects are Uniti (but the *pattern* — AI proposes structured actions, human approves, outcomes tracked — is reusable).
- **Exit criteria:** no provider key reachable outside the Broker; a call with AI disabled or over budget is refused + audited; a sensitive note is excluded from the model; output validates against `AdaptationCard` schema; eval signal (teacher edit-distance + verdict) recorded.
- **Depends on / risk:** Phase 1 + 3. Risk: **AI cost** — aggregate-first/AI-second + caching + per-school budgets; **quality** — golden set + the eval loop so prompt changes don't regress.

### Phase 6 — Pupil "What Works" memory (the moat)  → sub-plan
- **Goal:** Longitudinal per-pupil "what helps," evidence-linked, safe.
- **Deliverables:** rolling aggregates per pupil (recurring needs w/ recency+spread, strategy success rates, objective trajectories, confidence trend) computed cheaply on sync; AI narrative (via Broker) over aggregates with **confidence thresholds** (emerging vs established) and **evidence links**; per-school Vectorize ns for retrieval + cold-start seed (EEF adaptive-teaching strategies); **pre-seeds Phase 5 cards** for the next lesson. Teacher-owned language only ("What helps Maya", "Worked recently", "Emerging pattern").
- **Split:** the generic primitive — *longitudinal entity profile from an event log + thresholded AI synthesis with evidence links* — is reusable; the pupil specifics are Uniti.
- **Exit criteria:** a pattern only surfaces past the evidence threshold, always with linked lessons; no deficit/diagnostic language; tighter access scope than per-lesson feedback; profile pre-seeds the next lesson's cards.
- **Depends on / risk:** Phase 4 + 5 data accrual. Risk: over-profiling/labelling → thresholds + evidence-links + human authorship + no-deficit rules.

### Phase 7 — MIS + whole-school scale  → sub-plan
- **Goal:** Zero-setup rostering at scale; never block pilots.
- **Deliverables:** `DataSourceAdapter` interface; `ManualImportAdapter` + `CSVAdapter` first; `MISAdapter` then a **Wonde** provider (Arbor/SIMS/Bromcom behind the same interface later). Sync policy: MIS wins for rosters; historic feedback preserved; leavers deactivated not deleted; class changes audited; import preview before apply.
- **Split:** the adapter interface + sync policy reusable; provider adapters Uniti-first.
- **Exit criteria:** a CSV roster imports with preview + rollback; a Wonde sync updates roster without losing feedback; leavers deactivate.
- **Depends on / risk:** **GATING — Wonde commercial access/pricing validation** (do before locking). Risk: per-school MIS authorisation lead time → CSV/SSO covers pilots.

### Phase 8 — Leadership rollups  → sub-plan
- **Goal:** Calm evidence, not noisy analytics.
- **Deliverables:** objective progress; pupils needing revisit; adaptations used; strategies working across groups; inclusion patterns; exportable summaries — built from the same evidence, rolled up to the control plane.
- **Split:** rollup mechanism reusable; views Uniti.
- **Exit criteria:** a leader sees group progress + an exportable summary; wording says "lesson feedback evidence", not "attainment", unless real assessment data backs it.
- **Depends on / risk:** Phase 4–6 data. Risk: over-claiming validity — guard wording.

### Phase 9 — Compliance + trust (cross-cutting — DESIGNED FROM PHASE 0)
- **Goal:** School-owned data boundary, provable.
- **Deliverables:** DPIA/DPA templates; data-retention settings; export + deletion tooling; AI audit logs; consent controls; safeguarding exclusion from AI; break-glass access audit; documented private-data boundary. Align to DfE GenAI guidance, KCSIE, ICO Children's Code.
- **Split:** all reusable platform.
- **Exit criteria:** a school can export + delete all its data; every AI call + sensitive access is audited; DPIA/DPA ready for a DPO; AI-off mode honoured everywhere.
- **Depends on / risk:** designed Phase 0, *tooling* lands here. Risk: retrofitting → the data model must support erasure (tombstones, per-school isolation) from Phase 1.

---

## Final build order
1. Prototype from Claude Design ZIP (Phase 0)
2. Reusable private-cloud foundation (Phase 1)
3. School setup, roles, invites, branding (Phase 2)
4. Teacher MVP with class map + feedback (Phase 3)
5. Offline sync engine (Phase 4)
6. Structured adaptation cards (Phase 3/5 boundary)
7. AI Broker (Phase 5)
8. AI-generated adaptations (Phase 5)
9. Pupil "What Works" memory (Phase 6)
10. MIS provider integration (Phase 7)
11. Leadership rollups (Phase 8)
12. Export, retention, compliance pack (Phase 9 tooling)

Compliance (Phase 9 *design*) and the cloudlet contracts are cross-cutting and start at step 1.

## Decomposition → each gets its own spec→plan
Build in this dependency order; expand each into a full bite-sized plan when reached:
- **First buildable now:** Phase 1 (cloudlet foundation) — *not* gated on any external input. Recommended starting point.
- **Parallel, once ZIP arrives:** Phase 0 (prototype).
- Then Phase 2 → 3 → 4 → 5 → 6, with Phase 7 (MIS) gated on Wonde validation and Phase 8–9 following data accrual.

## Open inputs / decisions before/at each gate
- **Claude Design ZIP** (gates Phase 0).
- **Wonde commercial access + pricing** (gates Phase 7 provider; CSV covers earlier).
- **Default AI sensitivity mode** — `pseudonymised` per-pupil context vs strict `group`-only (set per-school default in Phase 5).
- **Tenant store**: confirm DO+SQLite per school (recommended) vs D1-per-school — affects Phase 1 migration runner.
- **Target repo** for `@shippie/cloudlet` + Uniti (likely the Shippie monorepo; this plan currently lives in the vault — move into the repo's `docs/superpowers/plans/` once chosen).

---

## Self-review
- **Coverage:** all of the user's Phases 0–9 + the 10 reusable modules + the 3 tracks + the structured adaptation/pupil objects are represented, with the "reject extract-later / reusable-from-day-one" decision baked into the architecture and contracts. ✓
- **Reusable-vs-Uniti split** is explicit per phase (the core discipline). ✓
- **Gating inputs** (ZIP, Wonde) and **cross-cutting compliance** are flagged, not buried. ✓
- **Type consistency:** `instanceId` used throughout; `SyncEvent.clientEventId` matches the dedupe rule; `AdaptationCard.reviewState/outcome` align with the event types; `PupilWhatWorks` feeds Phase 5 pre-seeding. ✓
- **Known deferral:** per-phase bite-sized TDD steps are intentionally deferred to each sub-plan (scope-check) — this document is the program plan + frozen contracts, not the task list.
