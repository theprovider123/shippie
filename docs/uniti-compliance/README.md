# Uniti — Compliance & Trust Pack

> **Shippie delivers the app. Your school cloud holds the data.**

This folder is the compliance + trust pack for Uniti, the AI-powered teacher
adaptation app delivered by Shippie and run as a **private app instance** per
school. It is written for a school's Data Protection Officer (DPO), SLT, and
governors, and is designed so a school can satisfy itself — and an inspector —
that the data-owner boundary is real and provable.

## The data boundary in one paragraph

Each school is provisioned as an isolated **private instance**. All pupil and
classroom data (roster, lessons, feedback, adaptations, notes, audit) lives only
in **that school's own private workspace** (a dedicated Durable Object + SQLite
database, keyed by the school's immutable instance id). Shippie's platform
database holds **instance metadata only** — name, slug, region, branding, the
install record — and **never** holds pupil data. One school's workspace cannot
read another's. All AI calls go through one governed **AI Broker**: no model
provider key is reachable outside it.

## What's in this folder

| File | Purpose |
|---|---|
| [`dpia-template.md`](./dpia-template.md) | Data Protection Impact Assessment template, pre-filled for Uniti — a DPO completes the school-specific sections. |
| [`dpa-template.md`](./dpa-template.md) | Data Processing Agreement template (controller = school, processor = Shippie/Uniti). |
| [`privacy-summary.md`](./privacy-summary.md) | Plain-English "your data stays in your school cloud" summary for staff and parents. |
| [`alignment-notes.md`](./alignment-notes.md) | How Uniti aligns to DfE Generative-AI guidance, KCSIE, and the ICO Children's Code, with the specific controls that satisfy each. |

## Provable controls (where the boundary is enforced in code)

These are the load-bearing controls the documents reference. They are not
aspirational — each maps to shipped, tested code.

- **Isolation** — per-school Durable Object + SQLite (`SchoolWorkspace`); control
  plane (`private_app_instances`) holds metadata only.
- **Export (data ownership)** — `GET /api/cloudlet/instances/[slug]/export`
  streams the school's complete workspace as JSON (owner/school_admin only).
- **Erasure (right to be forgotten)** —
  `POST /api/cloudlet/instances/[slug]/erase`: per-pupil PII purge with an
  anonymised tombstone, or whole-school `deprovision('erase')` behind a typed
  confirmation. The control-plane row is kept as an `erased_at` tombstone so the
  erasure is provable.
- **Retention** — per-school `retention_notes_months` setting; a deterministic
  `applyRetention(now)` purges raw note text after N months (aggregates kept),
  run daily by the `cloudlet-retention` cron.
- **AI governance** — every model call passes RBAC → AI on/off → budget →
  **safeguarding exclusion** → pseudonymisation → cache → audit → eval-log.
- **Safeguarding** — notes that trip the safeguarding guard are EXCLUDED from AI
  *and* access-restricted in general feedback lists.
- **Audit + break-glass** — every privileged action (incl. any platform-admin
  access to a school's data) is written to the audit log and visible on the
  school's **Privacy & data** screen.
- **AI off honoured everywhere** — with AI disabled, the broker refuses (audited)
  and the app falls back to the deterministic rules path.

> Templates are starting points, not legal advice. A school's DPO must review and
> complete them for the school's own circumstances.
