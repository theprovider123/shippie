# Receipt Snap — widen for accounting (FreeAgent-ready / accountant CSV)

> Receipt Snap exists and works (on-device Transformers.js OCR, 41/41 tests
> green, local storage, CSV export). This plan widens it from a "receipt
> scanner" into a **private receipt inbox for accounting** without changing
> the local-first, no-account architecture.
>
> Positioning: not "replace FreeAgent." Not "imports into FreeAgent in one
> tap." **"Snap privately, clean locally, FreeAgent-ready when you choose
> to export."** Useful for the maker who's a freelancer, a small Ltd
> company owner, or just someone whose accountant asks for receipts once a
> quarter.
>
> **Revision history**:
> - 2026-05-19 draft 1 — initial plan
> - 2026-05-19 draft 2 — Codex review applied: softer FreeAgent claims,
>   stronger storage discipline, expanded schema with tax_scheme /
>   export_status / discarded_photo_at, Phase 0 inserted to verify FreeAgent
>   shape before building exports, source/confidence moved to event
>   payloads, demo-fixture as an explicit "Try sample data" button (not
>   auto-pollution), existing `expense-logged` and `dined-out` event names
>   preserved.

---

## What exists today (verified against HEAD)

| Surface | Path | State |
|---|---|---|
| Capture (camera / file / paste) | `components/CaptureSurface.tsx` | ✅ shipped |
| On-device OCR | `lib/ocr-runtime.ts` (Xenova/trocr-base-printed via `/__esm/`) | ✅ shipped |
| Parse receipt fields | `lib/parse-receipt.ts` (vendor, total, date, currency, category, note) | ✅ shipped |
| Review-before-save | `pages/Review.tsx`, `components/ReviewForm.tsx` | ✅ shipped |
| Local persistence | `lib/store.ts` (localStorage; `image_data_url: string \| null`) | ✅ shipped |
| CSV export | `lib/csv.ts` (`date,vendor,total,currency,category,note`) | ✅ shipped |
| Cross-app broadcast | `App.tsx:144` (to Ledger, Restaurant Memory) | ✅ shipped |
| Settings | `pages/Settings.tsx` | ✅ shipped (basic) |
| Tests | csv.test.ts, parse-receipt.test.ts, store.test.ts | ✅ **41/41 green** |

**What it does well already**: snap → on-device OCR → review → save → CSV export → broadcast to Ledger/Restaurant Memory. All in 10-15 seconds, all on-device, no login.

**What it doesn't do** (relevant to accounting):
- No `net` / `tax` / `gross` split (just one `total`)
- No payment method (cash / card / bank transfer)
- No receipt-reference / invoice number
- No project / client (for billing-pass-through)
- No reimbursable flag (employee expense vs business cost)
- No supplier separation (supplier = vendor today; an accountant wants supplier as a stable identity)
- No export presets beyond the single simple CSV
- No ZIP export (CSV + images bundled)
- No "discard photo after save" toggle (the field exists; the UX doesn't)

---

## The widening — 6 phases (Phase 0 inserted per Codex review)

### Phase 0 — Verify FreeAgent shape with fake receipts (≈0.5 day, RESEARCH ONLY)

Before writing a single export-format file, run 3 realistic Receipt-Snap test rows through the FreeAgent API sandbox and confirm the field mapping. The verified shapes (from `dev.freeagent.com/docs/expenses` and `.../bank_transactions`, 2026-05-19):

**FreeAgent Expenses API — JSON only, OAuth required.** Not a CSV format. Fields:
- `user` URI (required)
- `category` URL or string (required)
- `dated_on` YYYY-MM-DD (required)
- `gross_value` decimal, **negative for payment, positive for refund** (conditionally required — required unless category is Mileage)
- `currency` 3-letter ISO
- `sales_tax_rate` decimal percentage
- `sales_tax_value` decimal
- `sales_tax_status` one of `TAXABLE` / `EXEMPT` / `OUT_OF_SCOPE`
- `ec_status` one of `UK/Non-EC` / `EC Goods` / `EC Services` / `Reverse Charge` (**required**)
- `description` free text
- `receipt_reference` string
- `attachment` object `{data: base64, file_name, description, content_type}` — max 5 MB; allowed types `image/png`, `image/jpeg`, `image/gif`, `application/x-pdf`

**FreeAgent Bank Transactions — accepts OFX (preferred), QIF, and "some CSV" formats.** Fields when uploading as JSON/XML array (CSV columns map to these names):
- `dated_on` YYYY-MM-DD (required)
- `description` string (optional, defaults to empty)
- `amount` decimal in company's native currency (optional, defaults to 0)
- `fitid` unique transaction ID (optional, defaults to null)
- `transaction_type` string (optional, defaults to `OTHER`)

**Decision points for Phase 0**:
1. Receipts → Expenses: produce a **JSON file** mapping to the Expenses API. Not CSV (FreeAgent expenses-import is API-only).
2. Receipts → Bank transactions: produce a **CSV** matching the bank-import column set, OR an **OFX** file (more reliable per FreeAgent docs).
3. The combined export becomes a **ZIP manifest**: `expenses.json` + `bank.ofx` (or `.csv`) + `receipts/` images + a `manifest.json` summarising what's inside.

**Phase 0 exits when**: a hand-crafted JSON/CSV pair imports cleanly into a sandbox FreeAgent account. Three test receipts: one with VAT, one zero-rated, one exempt. If the API rejects any, fix the mapping before Phase D builds the export.

### Phase A — Schema widening (≈1 day)

Extend `Receipt` in `lib/store.ts`. **All new fields optional** so existing localStorage rows migrate cleanly (any row without the new fields just reads them as `undefined`).

```ts
export interface Receipt {
  // — existing fields (preserved) —
  id: string;
  vendor: string;               // printed name on the receipt
  total_cents: number | null;   // gross today; export layer treats as `gross_cents`
  currency: string;
  category: string;
  occurred_on: string | null;
  captured_at: string;
  note: string;
  image_data_url: string | null; // `null` after discard

  // — accounting fields (all optional) —
  supplier?: string | null;     // accounting supplier override. Defaults to `vendor`
                                // when undefined. Stays a separate field so the
                                // OCR'd vendor on the receipt can differ from the
                                // accountant-facing supplier name without rewriting
                                // the OCR result.
  net_cents?: number | null;    // pre-tax, when extractable
  tax_cents?: number | null;    // tax/VAT amount
  tax_rate_bp?: number | null;  // basis points (2000 = 20% VAT)
  tax_scheme?: 'vat' | 'sales_tax' | 'none' | 'unknown';
                                // explicit so the export layer knows whether to map
                                // to FreeAgent's `sales_tax_*` fields or skip them.
  payment_method?: 'card' | 'cash' | 'bank_transfer' | 'other' | null;
  receipt_ref?: string | null;  // invoice / order number
  project?: string | null;      // free-text project tag
  client?: string | null;       // free-text client tag
  reimbursable?: boolean;       // defaults false

  // — bookkeeping flags —
  export_status?: 'not_exported' | 'exported';  // flips to `exported` after a
                                                // matching export run; reset
                                                // possible via Settings.
  discarded_photo_at?: string | null;  // ISO ts when image_data_url was nulled
                                       // (so audit/UX can say "photo discarded
                                       // 2 weeks ago" rather than just "no photo")
}
```

**Source / confidence moved off the receipt row.** Per Codex's feedback, these belong on the event payload (Phase F), not on every persisted row — they describe how the row was created, which is one-shot context, not steady-state metadata.

**`gross_cents` vs `total_cents` decision**: keep `total_cents` as the field name on the row for backwards compatibility with the 41 existing tests and any persisted localStorage data. The export layer **thinks in gross** — it reads `total_cents` but writes it under the export's preferred name (`gross_value` for FreeAgent, `gross` for the accountant CSV). A future major refactor could rename to `gross_cents`; not necessary now.

**Supplier framing**: kept as an explicit optional override, not auto-defaulted. The export layer falls back to `vendor` when `supplier` is null. This way the OCR'd vendor stays as the source-of-truth for what the receipt actually says, and the accountant gets their preferred stable name without losing the original.

### Phase B — OCR parser updates (≈1 day)

`lib/parse-receipt.ts` already extracts vendor / total / date. Add:

1. **VAT / tax detection** — UK receipts typically show `VAT 20%` or `VAT @ 20.00` or `Tax £4.20`. Regex sweep over the OCR text after total is identified. When found:
   - `tax_cents` = parsed amount
   - `tax_rate_bp` = parsed rate in basis points (`20%` → `2000`)
   - `net_cents` = `total_cents - tax_cents` (or recomputed from rate if more confident)

2. **Receipt reference detection** — `INV-`, `Receipt #`, `Order:`, `Ref:` prefixes are common. Lift the first match.

3. **Payment method hint** — strings like `VISA ****1234`, `MASTERCARD`, `CASH`, `CONTACTLESS` → set `payment_method`. Default to `card` when card-network keywords appear.

Each of these is best-effort. The user can override in review. **Confidence below 0.6 should leave the field empty rather than guess wrong.**

### Phase C — ReviewForm widening (≈1 day)

`components/ReviewForm.tsx` becomes two-mode:

```
[ Quick ] [ Accounting ]    ← mode toggle, top-right
```

- **Quick mode** (default for new installs): same as today — vendor, total, date, category, note.
- **Accounting mode**: expands to show net / tax / tax rate / payment method / receipt ref / project / client / reimbursable toggle. Disclosure-expandable so the form stays short when fields are empty.

Mode preference persists in `Settings`. The two-tap "Quick" toggle keeps the existing audience happy; "Accounting" unlocks the wider form for the audience that needs it. Same data row underneath — just more fields visible.

### Phase D — Export presets + ZIP (≈2 days, after Phase 0 verification)

`lib/csv.ts` becomes `lib/exports/`. The existing `csv.ts` keeps its place as `csv-simple.ts` — the current 6-column shape stays as default for backwards compat with users who've already wired their downstream CSV consumers.

```
lib/exports/
  csv-simple.ts                  — existing 6-col (date,vendor,total,currency,category,note)
  csv-accountant.ts              — wide CSV for human reading
  freeagent-expenses-api.json.ts — JSON shape mapped to FreeAgent's Expenses API fields
                                    (NOT a CSV — FreeAgent expenses-import is API-only)
  freeagent-bank.csv.ts          — CSV matching FreeAgent's bank-import shape
  zip.ts                         — bundle of one or more above + image attachments
```

**csv-simple** (unchanged):
```
date,vendor,total,currency,category,note
```

**csv-accountant** (wide, human-readable):
```
date,supplier,vendor,net,tax,tax_rate,tax_scheme,gross,currency,category,
payment_method,reimbursable,project,client,receipt_ref,note
```

**freeagent-expenses-api.json** maps **per FreeAgent's verified Expenses API shape** (Phase 0). Output is a JSON array of expense objects, one per receipt:

```json
[
  {
    "dated_on": "2026-05-18",
    "gross_value": "-24.30",
    "currency": "GBP",
    "sales_tax_rate": "20.0",
    "sales_tax_value": "-4.05",
    "sales_tax_status": "TAXABLE",
    "ec_status": "UK/Non-EC",
    "description": "Coffee — Hagen's",
    "receipt_reference": "INV-2891",
    "attachment_filename": "2026-05-18_hagens_24.30.jpg"
  }
]
```

Notes:
- `gross_value` is **negative** for payments (FreeAgent convention).
- `user` and `category` URIs aren't filled in by Shippie — the export caller (the user, or a small script) supplies them on import. We surface a placeholder + comment in a README inside the ZIP.
- `attachment_filename` references the image in the ZIP bundle. The user (or their script) base64-encodes the file and attaches it via `attachment.data` on actual API upload.
- **The export is not "one-tap import to FreeAgent."** It's "the JSON your accountant / your tiny upload script needs." Marketing copy must reflect this.

**freeagent-bank.csv** (FreeAgent bank-import shape, verified):
```
dated_on,description,amount,fitid,transaction_type
```
- `fitid` = receipt's `id` (ULID-ish, stable across runs)
- `transaction_type` = `OTHER` (FreeAgent default; expense-vs-refund implied by `amount` sign)
- `amount` is **negative for outgoing** (consistent with bank-statement convention)

**ZIP export** bundles whichever presets the user picked + image attachments. Uses `fflate` (~30KB, browser-native, no Node deps). Structure:
```
receipts-export-2026-05-18.zip
  manifest.json          ← summary: counts, date range, currency mix, formats included
  README.md              ← brief guide on what's inside + how to use each format
  expenses.json          ← FreeAgent Expenses API JSON (if picked)
  bank.csv               ← FreeAgent bank-import CSV (if picked)
  accountant.csv         ← wide CSV (if picked)
  simple.csv             ← legacy 6-col CSV (if picked)
  receipts/
    2026-05-18_hagens_24.30.jpg
    2026-05-17_tesco_8.40.jpg
    ...
```

Filename collisions get an integer suffix. Receipts with `image_data_url: null` (photo discarded) get a line in `manifest.json` noting "photo discarded on YYYY-MM-DD" so the accountant sees the receipt entry exists without a matching image.

Export button becomes a small dropdown: `[Export ▾]` → Quick CSV / Accountant CSV / FreeAgent-ready JSON / FreeAgent bank CSV / ZIP everything. Default stays **Quick CSV** in Quick mode; Accounting mode default is **ZIP everything**.

**Marketing copy for the export menu (Codex-verified softer claims)**:
- ❌ Don't say: "Imports into FreeAgent in one tap."
- ❌ Don't say: "Drop this CSV into FreeAgent."
- ✅ Say: "FreeAgent-ready JSON (Expenses API shape)."
- ✅ Say: "Bank-import CSV (FreeAgent / generic OFX-style)."
- ✅ Say: "Bundle everything for your accountant."

### Phase E — Storage discipline (≈1 day — STRENGTHENED per Codex)

If Receipt Snap becomes "the receipt inbox for accountants," **localStorage is the weak link.** Fine for metadata + a handful of compressed images; not fine for months of receipt photos. This phase ships before any public accounting positioning.

**1. Photo retention defaults differ by mode**:
- **Quick mode**: photos kept by default (people want to see the snap). Show a **visible storage warning early** — at 20 receipts, surface a banner: *"You have ~5 MB of photos saved. Photos live on this device. Consider exporting + discarding photos if you don't need them after review."*
- **Accounting mode**: **photos discarded after save by default.** Settings toggle to flip. The ZIP export can still bundle photos for receipts captured **today or within a user-set retention window** (e.g., 30 days).

**2. Quota awareness in Settings**:
```
Storage on this device
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
47 receipts · 14 MB used · 5 MB safe budget exceeded ⚠
   ↑ exporting drops to ~50 KB
[Bulk-discard all photos] [Export ZIP and discard]
```
The 5 MB number is the browser's reasonable localStorage budget (Safari caps lower than Chrome, but 5 MB is a safe-everywhere line). When over budget, the banner stays sticky until resolved.

**3. Bulk actions**:
- "Discard all photos" — clears every row's `image_data_url`; sets `discarded_photo_at` per row.
- "Export ZIP and discard" — one-shot: ZIP everything, download, then discard all photos. The export is the user's archival copy.

**4. Future-proof escape hatch (NOT shipping in launch widening, but designed)**:
If users need real photo retention beyond ~50 receipts, the next migration moves images out of localStorage into **OPFS (Origin Private File System)** or **IndexedDB**. The shape is straightforward: replace `image_data_url: string | null` on the row with `image_ref: string | null` (a key into OPFS / IDB), and load on demand. This isn't built today, but the schema change above (`discarded_photo_at` + `image_data_url: null` semantics) is forward-compatible — the migration code already knows how to handle a discarded photo. **Defer until the first user hits the wall.**

### Phase F — Cross-app event schema (≈0.5 day — UPDATED per Codex)

Formalize the contract Receipt Snap is already half-using. The existing event names stay — `expense-logged` (Ledger consumes at `App.tsx:147`) and `dined-out` (Restaurant Memory + Atlas consume at `App.tsx:159`). Plus `place.snapped` on the observation bus.

```ts
// In @shippie/iframe-sdk (or a shared @shippie/events package):
interface AppEvent<T = unknown> {
  type: string;             // 'expense-logged' | 'dined-out' | (new) 'receipt-logged'
                            //                                | 'meal-logged'
                            //                                | 'move-logged'
                            //                                | 'sleep-logged'
  source: string;           // app slug, e.g. 'receipt-snap'
  appVersion?: string;      // for compat across deploys (optional — emitters fill if available)
  occurredAt: string;       // ISO timestamp of the event (event time, not logged time)
  confidence?: number;      // 0–1, for AI-derived events. Human input defaults to 1.
  data: T;                  // shape per `type`, schema'd separately
}
```

**Preserve `expense-logged` and `dined-out`.** Ledger already consumes them. Don't rename. **Add** `receipt-logged` only if a downstream consumer asks for a richer payload (e.g., tax breakdown) that `expense-logged`'s "minimal payload" rule doesn't cover. Default to NOT adding `receipt-logged` for the launch widening — the existing two cover the use case.

Move `source` + `confidence` off the receipt row (Phase A) and onto the event payload (here). One-shot context, not persisted-state metadata.

**Demo fixture as an explicit user action** (Codex's key correction):

- Settings page gets a new entry: **"Try sample data"** — a button, not an auto-pollution.
- Tapping it inserts 5 fixed seed receipts spanning ~6 weeks. One per category. One with detected VAT, one without, one zero-rated.
- Settings also gets **"Clear sample data"** which removes any row whose `id` starts with the seed prefix (e.g., `seed-`). Real user receipts untouched.
- Users navigating to the app cold see an empty state with a *"Try sample data to explore the export flow"* call to action. They opt in.

This way the cross-tool insight surface can demonstrate immediately to anyone tapping "Try sample data," without polluting a real user's actual inbox. Honest demo, honest data.

---

## Out of scope for this widening

- **Direct FreeAgent OAuth integration.** FreeAgent's Expenses API does support attachments, but going OAuth means a server-side broker (the user authorises FreeAgent → callback → server stores refresh token). That's a separate surface, separate trust story, separate maintenance burden. Ship the CSV presets first — they cover 95% of real accountant workflows (most accountants want a CSV anyway).
- **Xero / QuickBooks specific presets.** Both support CSV import; FreeAgent's expense shape is close enough that one preset will work for a large portion of users. Add specific presets only when users ask.
- **Line-item extraction.** OCR today extracts header-level fields cleanly; line-item parsing is much harder (variable layouts, multi-column pricing). Marketing language must not over-promise — say "extracts the receipt, you confirm the fields," not "itemises every line."
- **Multi-currency reconciliation.** Each receipt has its own currency; no FX conversion. Out of scope.
- **Bank reconciliation against actual statements.** Out of scope.
- **Mileage / time-based expenses.** Different shape entirely.

---

## Marketing angles (for the launch convo) — softened per Codex

Receipt Snap with the accounting widening fits the "lead with the tool, not the platform" rule:

- For freelancers: *"Snap a receipt. The AI reads it on your phone. Export a FreeAgent-ready bundle when you need to. The receipt stays on your device until you choose."*
- For Ltd company owners: *"Quarterly VAT review without quarterly admin. Snap as you go, export when HMRC asks."*
- For privacy-conscious folks: *"Most receipt scanners send your spending to a server. This one doesn't."*
- For makers: *"OCR runs on your device. The model is open. The code is open. The receipts stay yours."*

**The first-OCR-run note (Codex's correction)**: don't claim "2-3 seconds" in the demo script unless the recording has a warm model already. Cold-start downloads ~95 MB of model the first time. Honest framing:

> *"First scan downloads the private OCR model (~100 MB, one-time). After that, scans are fast and local."*

The on-screen demo for HN / X thread should show **a second scan** (with the model already warm), so the "2 seconds → fields populated" visual is true. The first-run model download can be framed in voiceover or text overlay.

The mobile-native "whoa" moment that survives this honest framing:

- Open Receipt Snap → tap camera → take photo of any receipt → fields populate → tap save → tap Export → ZIP downloads
- All in ~10–15 seconds on a warm model.
- Show it in the HN screen recording with a "second scan" framing.

---

## Build sequence (≈6 days of work, Phase 0 inserted)

| Day | Work |
|---|---|
| 0 | **Phase 0 — Verify FreeAgent shape with 3 fake receipts (research only, no code)** |
| 1 | Phase A — schema widening + backwards-compat migration test |
| 2 | Phase B — OCR parser updates (VAT, ref, payment method) + parser tests |
| 3 | Phase C — ReviewForm Quick/Accounting toggle |
| 4 | Phase D — 4 export presets + ZIP bundle (only after Phase 0 verified) |
| 5 | Phase E — storage discipline (defaults, quota banner, bulk discard, "Try sample data") |
| 5.5 | Phase F — event schema formalization (preserving `expense-logged` / `dined-out`) |

After this work lands, Receipt Snap is a strong HN-lead candidate with a wider story than "free receipt scanner": **"private receipt inbox for freelancers and accountants — works offline, no account, FreeAgent-ready when you choose to export."**

---

## Acceptance criteria (mirroring Codex's tuned set)

The widened Receipt Snap is launch-ready when:

- [ ] Launcher to Receipt Snap interactive in <1s on 3G
- [ ] First useful action (camera open OR file picker OR demo data visible) within 5s
- [ ] OCR result can arrive async — UI doesn't block on it (already true today)
- [ ] No login required at any point — true today, must stay true
- [ ] Offline return works (existing receipts visible, new captures queued for OCR when online — or OCR runs offline too once model is cached)
- [ ] Shareable output: at minimum the CSV download; ideally a single-receipt share-card image
- [ ] 15 of 20 testers tap the camera within 5 seconds of landing
- [ ] All 4 export presets validate against real FreeAgent / accountant tooling (the Codex feedback's "prove the privacy claim with no-network verification" extends here: prove the export claim by importing the CSV into a real FreeAgent sandbox before launch)

---

## Decisions — locked (Codex review 2026-05-19)

1. **Default mode** = Quick (protects existing audience). ✅ locked
2. **Single update** to existing Receipt Snap, no fork. ✅ locked
3. **FreeAgent OAuth** = **deferred, not permanently killed**. Out of launch scope; may revisit when CSV/JSON export proves users want tighter integration. ✅ locked
4. **Xero / QuickBooks** = wait for first user request. ✅ locked
5. **Demo fixture** = 5 seed receipts behind an explicit "Try sample data" button in Settings (not auto-pollution). Includes "Clear sample data" twin button. ✅ locked
