# Regulatory alignment notes — Uniti

How Uniti aligns to the three frameworks that matter most for AI + children's
data in English schools, with the specific shipped controls that satisfy each.
For a DPO/SLT reviewer.

---

## 1. DfE — Generative AI in Education (policy/product expectations)

| Expectation | Uniti control |
|---|---|
| Personal/special-category data protected; not exposed to AI inappropriately | Safeguarding content **excluded** before any model call; pupil identifiers **pseudonymised**; minimum-relevant context only. |
| Schools retain control & oversight | Per-school **AI on/off** + sensitivity + budget; AI off is honoured everywhere (deterministic rules fallback). |
| Human oversight of AI output | AI **proposes** structured adaptation cards; a teacher accepts/edits/rejects; outcomes tracked. No autonomous decisions about pupils. |
| Transparency | Every AI request is **audited** (purpose, model, cached, sensitivity, fields excluded) and visible on the Privacy & data screen. |
| Data stays where it should | Per-school isolated workspace; processing region configurable (default UK); no provider key outside the AI Broker. |
| Reliability / avoiding harmful output | Prompts forbid deficit/diagnosis language; output validated against a schema; eval-log captures teacher edits/verdicts to catch regressions. |

## 2. KCSIE (Keeping Children Safe in Education)

| Principle | Uniti control |
|---|---|
| Safeguarding information handled with care and restricted access | Notes tripping the safeguarding guard are **access-restricted** in general feedback lists (text withheld unless authorised) and **never** sent to AI. |
| Filtering/monitoring does not create new safeguarding risk | The guard **excludes** (does not redact-in-place) welfare/CP signal, so sensitive content cannot leak via AI context. Excluded categories (not content) are logged for oversight. |
| Information sharing is appropriate and recorded | Role-based access; every privileged/break-glass access to pupil data is audited and surfaced to the school. |
| Records support, not replace, professional judgement | Adaptations and "what helps" are evidence-linked suggestions; staff decide. No automated safeguarding decisions are made by the system. |

> Uniti is **not** a safeguarding/CPOMS system and must not be used to record
> formal safeguarding concerns. Its safeguarding handling exists to *protect*
> incidental welfare content captured in teaching notes, by restricting and
> AI-excluding it.

## 3. ICO Age-Appropriate Design Code (Children's Code)

| Standard | Uniti control |
|---|---|
| Best interests of the child | No profiling for commercial purposes; per-pupil memory uses confidence thresholds, evidence links, and no deficit/diagnosis language. |
| Data minimisation | Only pedagogical signal captured; AI gets the minimum, pseudonymised, safeguarding-excluded context. |
| Default settings high-privacy | Default AI sensitivity is **pseudonymised** (never raw identifiers to AI by default); safeguarding exclusion is always on; AI can be off. |
| Data protection by design & default | Isolation, RBAC, audit, and erasure/retention designed in from Phase 1 (tombstones + per-school isolation make erasure real). |
| Profiling | Per-pupil "what helps" only surfaces patterns past an evidence threshold, always evidence-linked, human-authored language, with tighter access than per-lesson feedback. |
| Transparency | Plain-English privacy summary for staff/parents; full audit visibility for administrators. |
| Data sharing | No cross-school sharing (hard isolation); external AI providers only if a school explicitly enables them, under the DPA. |

---

## Control-to-code map (for assurance)

| Control | Where it lives |
|---|---|
| Per-school isolation | `SchoolWorkspace` DO + `WorkspaceStore` (SQLite per instance) |
| AI governance pipeline | `ai-broker.ts` (RBAC → AI on/off → budget → safeguarding → pseudonymise → cache → audit → eval) |
| Safeguarding exclusion + restriction | `excludeSafeguarding` / `scanForSafeguarding` (contract); feedback `safeguarding` flag (`workspace-store.ts`) |
| Export | `GET /api/cloudlet/instances/[slug]/export` + `WorkspaceStore.buildExport` |
| Erasure | `POST /api/cloudlet/instances/[slug]/erase` + `deprovision('erase')` + `erasePupil`/`eraseAll` |
| Retention | `applyRetention(now)` + `cloudlet-retention` cron + `retention_notes_months` setting |
| Audit + break-glass | `recordAudit`, `compliance-view.ts`, `recordBreakGlass` (in `resolve-instance.ts`) |
| Privacy & data screen | `/uniti/privacy` (owner/school_admin) |
