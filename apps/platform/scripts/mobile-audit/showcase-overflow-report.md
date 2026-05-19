# Showcase mobile-overflow report

_Generated 2026-05-19T14:57:18.521Z_

Scanned 64 showcases / 1151 source files.

Findings are review prompts, not automatic failures. Intentional short chips, icon-only controls, print-only tables, and fixed-format canvases may be acceptable.

## Summary

- flex-no-wrap-row: 0
- flex-child-missing-min-width: 0
- nowrap-no-ellipsis: 26
- fixed-width-over-phone: 0
- table-without-overflow-x: 7

## Findings

### nowrap-no-ellipsis
- `apps/showcase-block-drop/src/styles.css:175` — .toast
- `apps/showcase-care-log/src/styles.css:243` — /* ── Caregiver pill ───────────────────────────────────────── */ .cl-pill
- `apps/showcase-chess/src/styles.css:196` — .move-list li
- `apps/showcase-co-pilot/src/styles.css:277` — /* ── Parent pill (the "a" / "b" tag) ────────────────────────── */ .co-pill
- `apps/showcase-coffee/src/styles.css:519` — /* Tag pills */ .freshness-tag
- `apps/showcase-crewtrip/src/styles.css:526` — .live-strip span
- `apps/showcase-crewtrip/src/styles.css:790` — .soundtrack-card a
- `apps/showcase-crewtrip/src/styles.css:973` — .pulse-summary span
- `apps/showcase-crewtrip/src/styles.css:1323` — .memory-actions button, .memory-actions .file-button
- `apps/showcase-crewtrip/src/styles.css:1692` — .group-chip-row button
- `apps/showcase-crewtrip/src/styles.css:1772` — .team-file
- `apps/showcase-crewtrip/src/styles.css:2861` — .plan-edit-list small
- `apps/showcase-crewtrip/src/styles.css:4876` — .planned-games-list em
- `apps/showcase-crewtrip/src/styles.css:4943` — .locked-event-strip span, .match-pill
- `apps/showcase-daily-puzzle/src/styles.css:66` — .combined
- `apps/showcase-match-room/src/styles.css:712` — .status-pill
- `apps/showcase-pitch-forge/src/styles.css:190` — .status-pill
- `apps/showcase-receipt-snap/src/styles.css:534` — .visually-hidden
- `apps/showcase-restaurant-memory/src/styles.css:143` — .visit-actions .share-btn
- `apps/showcase-stack/src/styles.css:216` — .toast
- `apps/showcase-steep/src/styles.css:445` — .visually-hidden
- `apps/showcase-steep/src/styles.css:686` — .parts-amount
- `apps/showcase-steep/src/styles.css:988` — .inventory-grams
- `apps/showcase-steep/src/styles.css:1046` — .journal-entry-time
- `apps/showcase-voice-memo/src/styles.css:316` — .vm-memo-meta
- `apps/showcase-world-cup-fantasy/src/styles.css:122` — .fantasy-topbar > span

### table-without-overflow-x
- `apps/showcase-care-log/src/components/PrintView.tsx:52` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-cooking/src/pages/InternalTemps.tsx:21` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-cycle/src/pages/PrintView.tsx:98` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-lift/src/pages/PrintView.tsx:120` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-site-visit/src/pages/PrintView.tsx:90` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-symptom-diary/src/pages/PrintView.tsx:173` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-therapy-notes/src/pages/PrintView.tsx:127` — <table> appears in a file with no overflow-x wrapper
