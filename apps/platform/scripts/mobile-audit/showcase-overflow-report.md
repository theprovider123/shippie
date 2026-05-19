# Showcase mobile-overflow report

_Generated 2026-05-19T08:03:08.507Z_

Scanned 62 showcases / 1115 source files.

Findings are review prompts, not automatic failures. Intentional short chips, icon-only controls, print-only tables, and fixed-format canvases may be acceptable.

## Summary

- flex-no-wrap-row: 39
- flex-child-missing-min-width: 30
- nowrap-no-ellipsis: 27
- fixed-width-over-phone: 0
- table-without-overflow-x: 7

## Findings

### flex-child-missing-min-width
- `apps/showcase-breath/src/styles.css:147` — .field
- `apps/showcase-coffee/src/styles.css:263` — .dial-label-row input[type="range"]
- `apps/showcase-coffee/src/styles.css:806` — .field-row .field
- `apps/showcase-cooking/src/styles.css:239` — .field--inline
- `apps/showcase-drawing-telephone/src/styles.css:104` — .join-row input
- `apps/showcase-drawing-telephone/src/styles.css:256` — .caption-row input
- `apps/showcase-habit-tracker/src/styles.css:201` — .add-habit-form input
- `apps/showcase-journal/src/styles.css:305` — .search-form .search-input
- `apps/showcase-journal/src/styles.css:626` — .share-url
- `apps/showcase-meal-planner/src/styles.css:273` — .cooked-row .field
- `apps/showcase-pantry-scanner/src/styles.css:46` — .row input
- `apps/showcase-pitch-forge/src/styles.css:301` — /* Fields */ .field
- `apps/showcase-pitch-forge/src/styles.css:414` — .add-section input
- `apps/showcase-pitch-forge/src/styles.css:415` — .add-section select
- `apps/showcase-pitch-forge/src/styles.css:439` — .section-title-input
- `apps/showcase-pitch-forge/src/styles.css:532` — .snapshot-bar input
- `apps/showcase-read-later/src/styles.css:24` — input[type='url']
- `apps/showcase-receipt-snap/src/styles.css:244` — .row .grow
- `apps/showcase-recipe/src/styles.css:554` — .share-url
- `apps/showcase-restaurant-memory/src/styles.css:147` — .share-url
- `apps/showcase-shopping-list/src/styles.css:37` — input
- `apps/showcase-shopping-list/src/styles.css:99` — .name
- `apps/showcase-shopping-list/src/styles.css:134` — .mesh-controls input
- `apps/showcase-show-and-tell/src/styles.css:37` — .mesh-controls input
- `apps/showcase-show-and-tell/src/styles.css:97` — .compose input
- `apps/showcase-symptom-diary/src/styles.css:289` — .field.flex
- `apps/showcase-symptom-diary/src/styles.css:317` — .form-row .field
- `apps/showcase-tap-counter/src/styles.css:82` — .add-form input
- `apps/showcase-therapy-notes/src/styles.css:415` — .rating-row input[type='range']
- `apps/showcase-voice-memo/src/styles.css:451` — .vm-tag-input

### flex-no-wrap-row
- `apps/showcase-body-metrics/src/styles.css:60` — form
- `apps/showcase-care-log/src/styles.css:576` — /* ── Forms ────────────────────────────────────────────────── */ .cl-form-row
- `apps/showcase-care-log/src/styles.css:592` — .cl-form-actions
- `apps/showcase-co-pilot/src/styles.css:626` — /* ── Forms ──────────────────────────────────────────────────── */ .co-form-row
- `apps/showcase-co-pilot/src/styles.css:642` — .co-form-actions
- `apps/showcase-coffee/src/styles.css:341` — .timer-actions
- `apps/showcase-coffee/src/styles.css:805` — .field-row
- `apps/showcase-coffee/src/styles.css:807` — .sheet-actions
- `apps/showcase-coffee/src/styles.css:875` — .bottom-sheet .sheet-actions button
- `apps/showcase-cooking/src/styles.css:518` — .timer-actions
- `apps/showcase-cooking/src/styles.css:613` — /* Done rating form */ .done-form
- `apps/showcase-cooking/src/styles.css:649` — .done-form-actions
- `apps/showcase-crossing/src/styles.css:94` — .row-actions
- `apps/showcase-dough/src/styles.css:241` — /* Form blocks */ .form-block
- `apps/showcase-dough/src/styles.css:643` — .tool-actions
- `apps/showcase-dough/src/styles.css:664` — /* Outcome form */ .outcome-form
- `apps/showcase-drawing-telephone/src/styles.css:160` — .row-actions
- `apps/showcase-five-letter/src/styles.css:180` — .row-actions
- `apps/showcase-habit-tracker/src/styles.css:196` — /* Add habit form ----------------------------------------------------- */ .add-habit-form
- `apps/showcase-habit-tracker/src/styles.css:393` — .form-row
- `apps/showcase-journal/src/styles.css:300` — .search-form
- `apps/showcase-live-room/src/styles.css:112` — form.join-form
- `apps/showcase-lustre/src/styles.css:186` — .row-actions
- `apps/showcase-match-room/src/styles.css:1876` — /* Panel head — title + meta on one row */ .panel-head, .ballot-head, .result-title, .form-foot, .ba
- `apps/showcase-pantry-scanner/src/styles.css:70` — form
- `apps/showcase-quartet/src/styles.css:175` — .row-actions
- `apps/showcase-read-later/src/styles.css:23` — form
- `apps/showcase-receipt-snap/src/styles.css:193` — /* Review form */ .review-form
- `apps/showcase-receipt-snap/src/styles.css:202` — .review-form label
- `apps/showcase-receipt-snap/src/styles.css:247` — .form-actions
- `apps/showcase-restaurant-memory/src/styles.css:37` — form
- `apps/showcase-restaurant-memory/src/styles.css:56` — form .rating, form .photo
- `apps/showcase-shopping-list/src/styles.css:36` — form
- `apps/showcase-show-and-tell/src/styles.css:92` — .compose
- `apps/showcase-sip-log/src/styles.css:620` — .sheet-actions
- `apps/showcase-tab/src/styles.css:335` — /* ── Add item form ──────────────────────────── */ .tab-add-item
- `apps/showcase-tap-counter/src/styles.css:78` — .add-form
- `apps/showcase-tap-counter/src/styles.css:160` — .row-actions
- `apps/showcase-therapy-notes/src/styles.css:129` — .page-actions

### nowrap-no-ellipsis
- `apps/showcase-block-drop/src/styles.css:164` — .toast
- `apps/showcase-care-log/src/styles.css:243` — /* ── Caregiver pill ───────────────────────────────────────── */ .cl-pill
- `apps/showcase-chess/src/styles.css:185` — .move-list li
- `apps/showcase-co-pilot/src/styles.css:277` — /* ── Parent pill (the "a" / "b" tag) ────────────────────────── */ .co-pill
- `apps/showcase-coffee/src/styles.css:484` — /* Tag pills */ .freshness-tag
- `apps/showcase-crewtrip/src/styles.css:526` — .live-strip span
- `apps/showcase-crewtrip/src/styles.css:790` — .soundtrack-card a
- `apps/showcase-crewtrip/src/styles.css:973` — .pulse-summary span
- `apps/showcase-crewtrip/src/styles.css:1323` — .memory-actions button, .memory-actions .file-button
- `apps/showcase-crewtrip/src/styles.css:1692` — .group-chip-row button
- `apps/showcase-crewtrip/src/styles.css:1772` — .team-file
- `apps/showcase-crewtrip/src/styles.css:2861` — .plan-edit-list small
- `apps/showcase-crewtrip/src/styles.css:4876` — .planned-games-list em
- `apps/showcase-crewtrip/src/styles.css:4943` — .locked-event-strip span, .match-pill
- `apps/showcase-daily-puzzle/src/styles.css:55` — .combined
- `apps/showcase-match-room/src/styles.css:984` — .status-pill
- `apps/showcase-match-room/src/styles.css:1013` — .theme-toggle
- `apps/showcase-match-room/src/styles.css:1041` — .profile-chip
- `apps/showcase-pitch-forge/src/styles.css:190` — .status-pill
- `apps/showcase-recipe/src/styles.css:869` — .visually-hidden
- `apps/showcase-restaurant-memory/src/styles.css:110` — .visit-actions .share-btn
- `apps/showcase-stack/src/styles.css:205` — .toast
- `apps/showcase-steep/src/styles.css:445` — .visually-hidden
- `apps/showcase-steep/src/styles.css:686` — .parts-amount
- `apps/showcase-steep/src/styles.css:988` — .inventory-grams
- `apps/showcase-steep/src/styles.css:1046` — .journal-entry-time
- `apps/showcase-voice-memo/src/styles.css:316` — .vm-memo-meta

### table-without-overflow-x
- `apps/showcase-care-log/src/components/PrintView.tsx:52` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-cooking/src/pages/InternalTemps.tsx:21` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-cycle/src/pages/PrintView.tsx:98` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-lift/src/pages/PrintView.tsx:120` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-site-visit/src/pages/PrintView.tsx:90` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-symptom-diary/src/pages/PrintView.tsx:173` — <table> appears in a file with no overflow-x wrapper
- `apps/showcase-therapy-notes/src/pages/PrintView.tsx:127` — <table> appears in a file with no overflow-x wrapper
