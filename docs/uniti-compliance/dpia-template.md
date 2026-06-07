# Data Protection Impact Assessment (DPIA) — Uniti

> Template pre-filled for Uniti. Sections marked **[SCHOOL]** must be completed
> by the school's DPO. This DPIA should be reviewed before go-live and whenever
> processing changes materially.

## 1. Overview

| Field | Value |
|---|---|
| Processing activity | Capturing lesson feedback and generating teaching adaptations for pupils |
| Data controller | **[SCHOOL]** (the school / trust) |
| Data processor | Shippie Ltd (delivering the Uniti private app) |
| DPO | **[SCHOOL]** |
| Date / version | **[SCHOOL]** |
| Screening outcome | DPIA required — processing of children's personal data, some special-category-adjacent context, and use of AI. |

## 2. Description of the processing

**What:** Teachers record short, structured feedback per pupil per lesson
("got it" / "nearly" / "needs revisit"), optional notes, and the outcome of
suggested adaptations. From this evidence the app surfaces structured
**adaptation cards** and a per-pupil "what helps" summary.

**Why:** To help teachers adapt teaching to need quickly, and to give leaders a
calm, evidence-based view — improving inclusion and outcomes.

**How / where:** Each school runs as an **isolated private instance**. All pupil
data lives only in that school's private workspace (dedicated Durable Object +
SQLite, in the **[SCHOOL: region, default UK]**). Shippie's platform database
holds instance metadata only — never pupil data.

**Data subjects:** Pupils; staff (as users).

**Data categories:**
- Pupil: name, initials, year/class, SEND/EAL/FSM flags, lesson feedback,
  teacher notes, adaptation outcomes.
- Staff: name, email, role.
- *Excluded by design:* safeguarding/child-protection content is **not** sent to
  any AI model and is access-restricted in general lists (see §6).

**Retention:** Configurable per school (`retention_notes_months`); raw note text
is purged after the chosen window while anonymised aggregates are kept.
**[SCHOOL: state the chosen period and justification.]**

## 3. Necessity & proportionality

- Lawful basis (UK GDPR Art. 6): **[SCHOOL]** — typically *public task* for a
  maintained school / *legitimate interests* otherwise.
- Special category basis if relevant (Art. 9): **[SCHOOL]**.
- Data minimisation: only pedagogical signal is captured; AI receives the
  **minimum relevant** context, pseudonymised, with safeguarding content removed.
- Children's data: see the ICO Children's Code alignment in
  [`alignment-notes.md`](./alignment-notes.md).

## 4. Consultation

- Staff: **[SCHOOL]**
- Parents/pupils (as appropriate / age-appropriate): **[SCHOOL]**
- Processor (Shippie): provides this pack + the DPA.

## 5. Data flows

1. Staff sign in (SSO/Lucia) → resolved to a **verified membership** in their
   school instance.
2. Feedback/notes captured offline → synced into that school's workspace only
   (append-only event log).
3. Adaptation generation: context is built, **safeguarding content excluded**,
   pupil identifiers **pseudonymised**, routed via the AI Broker, result cached
   and audited.
4. Rollups computed within the instance; only non-identifying aggregates may be
   surfaced to leaders.
5. Export/erasure on request (see §7).

## 6. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation (shipped) |
|---|---|---|---|
| Cross-school data leakage | Low | High | Per-school DO+SQLite isolation; `ScopedDb` rejects cross-instance access; control plane holds no pupil data. |
| Safeguarding info sent to AI | Low | High | Safeguarding guard EXCLUDES (not redacts) any welfare/CP signal before any model call; excluded counts are audited. |
| Over-profiling / labelling of children | Med | High | Thresholded "emerging vs established"; evidence-linked; no deficit/diagnosis language; tighter access on per-pupil memory. |
| Unauthorised access | Low | High | RBAC (8 roles); access only via verified membership; any platform-admin (break-glass) access is audited + visible. |
| Re-identification via AI output | Low | Med | Pseudonymise before the model; cache stores pseudonymised output only; re-expand only on return to the authorised caller. |
| Data kept too long | Med | Med | Per-school retention setting + deterministic daily purge of raw notes; aggregates retained. |
| AI cost / unexpected use | Med | Low | Per-school AI on/off + budget; refusals audited; deterministic rules fallback. |
| Inaccurate AI suggestions | Med | Med | Human-in-the-loop: AI proposes, teacher approves/edits/rejects; outcomes tracked (eval loop). |

## 7. Data subject rights

- **Access / portability:** full school export via the Privacy & data screen
  (JSON), owner/school_admin gated.
- **Erasure:** per-pupil erasure (PII purged, anonymised aggregate kept) and
  whole-school erasure (workspace purged; control-plane tombstone retained as
  proof). Both audited.
- **Rectification:** roster updates via MIS/CSV; historic evidence preserved
  against tombstones, never silently deleted.

## 8. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| DPO | **[SCHOOL]** | | Approve / Reject / Revisit |
| SLT | **[SCHOOL]** | | |

**Residual risk accepted by:** **[SCHOOL]**
