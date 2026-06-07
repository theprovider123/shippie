# Data Processing Agreement (DPA) — Uniti

> Template per UK GDPR Article 28. **[SCHOOL]** and processor details must be
> completed and the agreement signed before processing begins. Not legal advice.

**Controller:** **[SCHOOL]** (the "Controller")
**Processor:** Shippie Ltd, delivering the Uniti private app (the "Processor")
**Effective date:** **[SCHOOL]**

## 1. Subject matter & duration

The Processor processes personal data on behalf of the Controller solely to
provide the Uniti service (lesson-feedback capture, teaching adaptations,
leadership rollups). Duration: the term of the service agreement, plus the
limited period needed for export/erasure on termination.

## 2. Nature & purpose of processing

Hosting and processing pupil and staff data within the **Controller's own
isolated private workspace**; generating structured adaptations via a governed
AI Broker; computing aggregates; providing export and erasure tooling.

## 3. Types of personal data

- Pupils: name, initials, class/year, SEND/EAL/FSM flags, lesson feedback,
  teacher notes, adaptation outcomes.
- Staff: name, email, role.

## 4. Categories of data subject

Pupils and school staff of the Controller.

## 5. Processor obligations (Art. 28(3))

The Processor shall:

1. **(a) Documented instructions** — process only on the Controller's documented
   instructions, including the data-boundary and AI settings configured by the
   school. The Controller controls AI on/off, sensitivity, and retention.
2. **(b) Confidentiality** — ensure persons authorised to process are bound by
   confidentiality.
3. **(c) Security (Art. 32)** — implement the technical measures in Annex A,
   including per-school isolation, encryption in transit, RBAC, audit logging,
   and the safeguarding exclusion control.
4. **(d) Sub-processors** — engage sub-processors only with the Controller's
   general authorisation and under equivalent terms; current sub-processors in
   Annex B. The Controller is informed of changes and may object.
5. **(e) Data subject rights** — assist the Controller via export and erasure
   tooling so it can fulfil access, portability, and erasure requests.
6. **(f) Breach & DPIA support** — assist with Art. 32–36 obligations, including
   breach notification without undue delay and DPIA support (see the DPIA
   template).
7. **(g) Deletion/return** — on termination, at the Controller's choice, export
   all data to the Controller and/or erase it, deleting existing copies unless
   law requires retention.
8. **(h) Audits** — make available the information needed to demonstrate
   compliance and allow audits/inspections.

## 6. International transfers

Data is processed in **[SCHOOL: region, default UK]**. No transfer outside the
agreed region without the Controller's prior written authorisation and an
appropriate Art. 46 transfer mechanism.

## 7. Liability & termination

Per the main service agreement. On termination the export/erasure provisions in
§5(g) apply; the control-plane retains only a non-identifying erasure tombstone
as proof of deletion.

---

## Annex A — Technical & organisational measures

- **Isolation:** each school runs as a dedicated private instance (Durable Object
  + SQLite). The platform database holds instance metadata only — no pupil data.
  Cross-instance access is rejected in code.
- **Access control:** role-based access (8 roles) granted only via verified
  membership; SSO via Lucia/Arctic.
- **AI governance:** all model calls via one AI Broker; no provider key outside
  it; RBAC, AI on/off, budget, **safeguarding exclusion**, pseudonymisation,
  content-hash cache, full audit + eval-log.
- **Safeguarding:** welfare/child-protection content excluded from AI and
  access-restricted in general lists.
- **Auditability:** append-only audit; every privileged action — including any
  break-glass platform-admin access — recorded and visible to the school.
- **Data lifecycle:** configurable retention with deterministic purge of raw
  notes; export and erasure tooling; tombstoned (never silently deleted) roster
  changes.
- **Encryption:** TLS in transit; storage encryption at the platform layer.

## Annex B — Sub-processors

| Sub-processor | Purpose | Location |
|---|---|---|
| Cloudflare, Inc. | Hosting (Workers, Durable Objects/SQLite, D1, R2, KV), AI Gateway | **[SCHOOL: region]** |
| **[Any external AI model provider, only if `allowExternal` enabled]** | AI inference via AI Gateway | **[region]** |

> If the school keeps AI to local Workers AI only (no external models), Annex B
> external providers do not apply.

## Signatures

| Party | Name | Title | Date |
|---|---|---|---|
| Controller (**[SCHOOL]**) | | | |
| Processor (Shippie Ltd) | | | |
