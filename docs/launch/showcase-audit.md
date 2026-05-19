# Showcase Local Tool Audit

Generated: 2026-05-19T14:37:31.470Z

This is the launch ledger for first-party showcases. It does not replace the deploy-time Local Tool policy scanner; it records the current slate so we know which tools are ready for the public launcher, which belong in Labs, and which need conversion before launch.

## Summary

- archived: 34
- launch: 30

## Rulings

- **launch**: policy passes, source can appear in the public launcher.
- **labs** / **archived**: policy passes or is reviewable, but the tool intentionally lives outside the main launch grid.
- **fix-passport**: policy passes, but a local-data tool needs an explicit `data_passport` before launch.
- **convert**: policy found a blocker. Convert cloud/auth/tracking/user-data egress to Shippie local primitives before marketplace launch.

| Showcase | Surface | Ruling | Policy | Data Passport | Capability Hints | Findings |
|---|---:|---|---|---|---|---|
| atlas | archived | archived | eligible-reference-network (0 blocks, 0 warns) | atlas/atlas.v1 | worksOffline, reference:tile.openstreetmap.org,wiki.openstreetmap.org, privateRelay, sharesIntents, localDb, localFiles | — |
| block-drop | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | block-drop/block-drop.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| body-metrics | archived | archived | eligible-reference-network (0 blocks, 0 warns) | body-metrics/body-metrics.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com,github.com, sharesIntents, localDb | — |
| breath | archived | archived | eligible-reference-network (0 blocks, 0 warns) | breath/breath.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| bricks | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | bricks/bricks.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| bulwark | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | bulwark/bulwark.v1 | reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay | — |
| care-log | archived | archived | eligible-local (0 blocks, 0 warns) | care-log/care-log.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| chess | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | chess/chess.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| chiwit | featured | launch | eligible-local (0 blocks, 0 warns) | chiwit/chiwit.v1 | worksOffline, sharesIntents, localDb | — |
| co-pilot | featured | launch | eligible-local (0 blocks, 0 warns) | co-pilot/co-pilot.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| coffee | featured | launch | eligible-reference-network (0 blocks, 0 warns) | coffee/coffee.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| colour-of-day | archived | archived | eligible-reference-network (0 blocks, 0 warns) | colour-of-day/colour-of-day.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| cooking | archived | archived | eligible-reference-network (0 blocks, 0 warns) | cooking/cooking.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| crewtrip | featured | launch | eligible-reference-network (0 blocks, 0 warns) | crewtrip/crewtrip.v1 | worksOffline, reference:music.apple.com,open.spotify.com,soundcloud.com, privateRelay, localDb, localFiles | — |
| crossing | archived | archived | eligible-reference-network (0 blocks, 0 warns) | crossing/crossing.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| cycle | featured | launch | eligible-reference-network (0 blocks, 0 warns) | cycle/cycle.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, sharesIntents, localDb | — |
| daily-puzzle | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | daily-puzzle/daily-puzzle.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| dough | featured | launch | eligible-reference-network (0 blocks, 0 warns) | dough/dough.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| drawing-telephone | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | drawing-telephone/drawing-telephone.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, localDb | — |
| drift | archived | archived | eligible-reference-network (0 blocks, 0 warns) | drift/drift.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| five-letter | archived | archived | eligible-reference-network (0 blocks, 0 warns) | five-letter/five-letter.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| habit-tracker | archived | archived | eligible-reference-network (0 blocks, 0 warns) | habit-tracker/habit-tracker.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| hearth | archived | archived | eligible-local (0 blocks, 0 warns) | hearth/hearth.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| invaders | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | invaders/invaders.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| journal | archived | archived | eligible-reference-network (0 blocks, 0 warns) | journal/journal.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localAi, sharesIntents, localDb | — |
| ledger | featured | launch | eligible-reference-network (0 blocks, 0 warns) | ledger/ledger.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, sharesIntents, localDb | — |
| lift | featured | launch | eligible-reference-network (0 blocks, 0 warns) | lift/lift.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| live-room | archived | archived | eligible-reference-network (0 blocks, 0 warns) | live-room/live-room.v1 | reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay | — |
| lustre | archived | archived | eligible-reference-network (0 blocks, 0 warns) | lustre/lustre.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| match-room | featured | launch | eligible-reference-network (0 blocks, 0 warns) | match-room/match-room.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, sharesIntents, localDb | — |
| maze | archived | archived | eligible-reference-network (0 blocks, 0 warns) | maze/maze.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| meal-planner | archived | archived | eligible-reference-network (0 blocks, 0 warns) | meal-planner/meal-planner.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| memory-grid | archived | archived | eligible-reference-network (0 blocks, 0 warns) | memory-grid/memory-grid.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| mevrouw | featured | launch | eligible-reference-network (0 blocks, 0 warns) | mevrouw/mevrouw.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, localDb | — |
| move | archived | archived | eligible-local (0 blocks, 0 warns) | move/move.v1 | worksOffline, sharesIntents, localDb | — |
| palate | featured | launch | eligible-reference-network (0 blocks, 0 warns) | palate/palate.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com,world.openfoodfacts.org, sharesIntents, localDb | — |
| pantry-scanner | archived | archived | eligible-reference-network (0 blocks, 0 warns) | pantry-scanner/pantry-scanner.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com,world.openfoodfacts.org, sharesIntents, localDb | — |
| photo-a-day | archived | archived | eligible-reference-network (0 blocks, 0 warns) | photo-a-day/photo-a-day.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| pitch-forge | archived | archived | eligible-reference-network (0 blocks, 0 warns) | pitch-forge/pitch-forge.v1 | worksOffline, reference:example.com,fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| quartet | archived | archived | eligible-reference-network (0 blocks, 0 warns) | quartet/quartet.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| quiet | archived | archived | eligible-local (0 blocks, 0 warns) | quiet/quiet.v1 | worksOffline, sharesIntents, localDb | — |
| reaction | archived | archived | eligible-reference-network (0 blocks, 0 warns) | reaction/reaction.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| read-later | archived | archived | eligible-reference-network (0 blocks, 0 warns) | read-later/read-later.v1 | worksOffline, reference:example.com,fonts.googleapis.com,fonts.gstatic.com, localAi, sharesIntents, localDb | — |
| receipt-snap | featured | launch | eligible-reference-network (0 blocks, 0 warns) | receipt-snap/receipt-snap.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| restaurant-memory | featured | launch | eligible-reference-network (0 blocks, 0 warns) | restaurant-memory/restaurant-memory.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| shopping-list | archived | archived | eligible-reference-network (0 blocks, 0 warns) | shopping-list/shopping-list.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localAi, privateRelay, sharesIntents, localDb | — |
| show-and-tell | archived | archived | eligible-reference-network (0 blocks, 0 warns) | show-and-tell/show-and-tell.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay, localDb | — |
| sip-log | archived | archived | eligible-reference-network (0 blocks, 0 warns) | sip-log/sip-log.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| site-visit | archived | archived | eligible-reference-network (0 blocks, 0 warns) | site-visit/site-visit.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb, localFiles | — |
| snake | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | snake/snake.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| snap-and-forget | featured | launch | eligible-reference-network (0 blocks, 0 warns) | snap-and-forget/snap-and-forget.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| stack | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | stack/stack.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| steep | featured | launch | eligible-reference-network (0 blocks, 0 warns) | steep/steep.v1 | worksOffline, secureBackup, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| story-studio | archived | archived | eligible-local (0 blocks, 0 warns) | story-studio/story-studio.v1 | worksOffline, sharesIntents, localDb, localFiles | — |
| sudoku | archived | archived | eligible-reference-network (0 blocks, 0 warns) | sudoku/sudoku.v1 | reference:fonts.googleapis.com,fonts.gstatic.com,github.com | — |
| symptom-diary | featured | launch | eligible-local (0 blocks, 0 warns) | symptom-diary/symptom-diary.v1 | worksOffline, sharesIntents, localDb | — |
| tab | featured | launch | eligible-local (0 blocks, 0 warns) | tab/tab.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| tap-counter | featured | launch | eligible-reference-network (0 blocks, 0 warns) | tap-counter/tap-counter.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
| therapy-notes | featured | launch | eligible-local (0 blocks, 0 warns) | therapy-notes/therapy-notes.v1 | worksOffline, sharesIntents, localDb | — |
| touch | archived | archived | eligible-reference-network (0 blocks, 0 warns) | touch/touch.v1 | worksOffline, reference:...,fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| voice-memo | featured | launch | eligible-reference-network (0 blocks, 0 warns) | voice-memo/voice-memo.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb, localFiles | — |
| whiteboard | arcade | launch | eligible-reference-network (0 blocks, 0 warns) | whiteboard/whiteboard.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, privateRelay | — |
| world-cup-fantasy | archived | archived | eligible-reference-network (0 blocks, 0 warns) | world-cup-fantasy/world-cup-fantasy.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, sharesIntents, localDb | — |
| would-you-rather | archived | archived | eligible-reference-network (0 blocks, 0 warns) | would-you-rather/would-you-rather.v1 | worksOffline, reference:fonts.googleapis.com,fonts.gstatic.com, localDb | — |
