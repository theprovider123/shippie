# Showcase Local Tool Audit

Generated: 2026-05-30T08:35:28.969Z

This is the launch ledger for first-party showcases. It does not replace the deploy-time Local Tool policy scanner; it records the current slate so we know which tools are ready for the public launcher, which belong in Labs, and which need conversion before launch.

## Summary

- archived: 32
- labs: 8
- launch: 28

## Rulings

- **launch**: policy passes, source can appear in the public launcher.
- **labs** / **archived**: policy passes or is reviewable, but the tool intentionally lives outside the main launch grid.
- **fix-passport**: policy passes, but a local-data tool needs an explicit `data_passport` before launch.
- **convert**: policy found a blocker. Convert cloud/auth/tracking/user-data egress to Shippie local primitives before marketplace launch.

| Showcase | Surface | Ruling | Policy | Data Passport | Capability Hints | Findings |
|---|---:|---|---|---|---|---|
| atlas | archived | archived | eligible-reference-network (0 blocks, 0 warns) | atlas/atlas.v1 | worksOffline, reference:tile.openstreetmap.org,wiki.openstreetmap.org, privateRelay, sharesIntents, localDb, localFiles | — |
| block-drop | arcade | launch | eligible-local (0 blocks, 0 warns) | block-drop/block-drop.v1 | worksOffline, localDb | — |
| body-metrics | archived | archived | eligible-reference-network (0 blocks, 0 warns) | body-metrics/body-metrics.v1 | worksOffline, reference:github.com, sharesIntents, localDb | — |
| breath | archived | archived | eligible-local (0 blocks, 0 warns) | breath/breath.v1 | worksOffline, sharesIntents, localDb | — |
| bricks | arcade | launch | eligible-local (0 blocks, 0 warns) | bricks/bricks.v1 | worksOffline, localDb | — |
| bulwark | arcade | launch | eligible-local (0 blocks, 0 warns) | bulwark/bulwark.v1 | privateRelay | — |
| care-log | archived | archived | eligible-local (0 blocks, 0 warns) | care-log/care-log.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| chess | arcade | launch | eligible-local (0 blocks, 0 warns) | chess/chess.v1 | worksOffline, localDb | — |
| chiwit | archived | archived | eligible-local (0 blocks, 0 warns) | chiwit/chiwit.v1 | worksOffline, sharesIntents, localDb | — |
| co-pilot | featured | launch | eligible-local (0 blocks, 0 warns) | co-pilot/co-pilot.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| coffee | featured | launch | eligible-local (0 blocks, 0 warns) | coffee/coffee.v1 | worksOffline, sharesIntents, localDb | — |
| colour-of-day | archived | archived | eligible-local (0 blocks, 0 warns) | colour-of-day/colour-of-day.v1 | worksOffline, localDb | — |
| cooking | archived | archived | eligible-local (0 blocks, 0 warns) | cooking/cooking.v1 | worksOffline, sharesIntents, localDb | — |
| crewtrip | labs | labs | eligible-reference-network (0 blocks, 0 warns) | crewtrip/crewtrip.v1 | worksOffline, reference:open.spotify.com, privateRelay, localDb, localFiles | — |
| crossing | archived | archived | eligible-local (0 blocks, 0 warns) | crossing/crossing.v1 | worksOffline, localDb | — |
| cycle | featured | launch | eligible-local (0 blocks, 0 warns) | cycle/cycle.v2 | worksOffline, privateRelay, sharesIntents, localDb | — |
| daily-puzzle | arcade | launch | eligible-local (0 blocks, 0 warns) | daily-puzzle/daily-puzzle.v1 | worksOffline, localDb | — |
| dough | featured | launch | eligible-local (0 blocks, 0 warns) | dough/dough.v1 | worksOffline, sharesIntents, localDb | — |
| drawing-telephone | arcade | launch | eligible-local (0 blocks, 0 warns) | drawing-telephone/drawing-telephone.v1 | worksOffline, privateRelay, localDb | — |
| drift | archived | archived | eligible-local (0 blocks, 0 warns) | drift/drift.v1 | worksOffline, localDb | — |
| five-letter | archived | archived | eligible-local (0 blocks, 0 warns) | five-letter/five-letter.v1 | worksOffline, localDb | — |
| golazo | labs | labs | eligible-local (0 blocks, 0 warns) | golazo/golazo.v1 | worksOffline, localDb | — |
| habit-tracker | featured | launch | eligible-local (0 blocks, 0 warns) | habit-tracker/habit-tracker.v2 | worksOffline, sharesIntents, localDb | — |
| hearth | archived | archived | eligible-local (0 blocks, 0 warns) | hearth/hearth.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| invaders | arcade | launch | eligible-local (0 blocks, 0 warns) | invaders/invaders.v1 | worksOffline, localDb | — |
| journal | featured | launch | eligible-local (0 blocks, 0 warns) | journal/journal.v1 | worksOffline, localAi, sharesIntents, localDb | — |
| ledger | featured | launch | eligible-local (0 blocks, 0 warns) | ledger/ledger.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| lift | featured | launch | eligible-local (0 blocks, 0 warns) | lift/lift.v1 | worksOffline, sharesIntents, localDb | — |
| live-room | archived | archived | eligible-local (0 blocks, 0 warns) | live-room/live-room.v1 | privateRelay | — |
| lustre | archived | archived | eligible-local (0 blocks, 0 warns) | lustre/lustre.v1 | worksOffline, localDb | — |
| match-room | labs | labs | eligible-local (0 blocks, 0 warns) | match-room/match-room.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| maze | archived | archived | eligible-local (0 blocks, 0 warns) | maze/maze.v1 | worksOffline, localDb | — |
| meal-planner | archived | archived | eligible-local (0 blocks, 0 warns) | meal-planner/meal-planner.v1 | worksOffline, sharesIntents, localDb | — |
| memory-grid | archived | archived | eligible-local (0 blocks, 0 warns) | memory-grid/memory-grid.v1 | worksOffline, localDb | — |
| mevrouw | labs | labs | eligible-local (0 blocks, 0 warns) | mevrouw/mevrouw.v1 | worksOffline, secureBackup, privateRelay, localDb | — |
| mise | featured | launch | eligible-local (0 blocks, 0 warns) | mise/mise.v1 | worksOffline, sharesIntents, localDb | — |
| move | archived | archived | eligible-local (0 blocks, 0 warns) | move/move.v1 | worksOffline, sharesIntents, localDb | — |
| palate | featured | launch | eligible-local (0 blocks, 0 warns) | palate/palate.v1 | worksOffline, sharesIntents, localDb | — |
| pantry-scanner | archived | archived | eligible-reference-network (0 blocks, 0 warns) | pantry-scanner/pantry-scanner.v1 | worksOffline, reference:world.openfoodfacts.org, sharesIntents, localDb | — |
| parade-companion | labs | labs | eligible-reference-network (0 blocks, 0 warns) | parade-companion/parade-companion.v1 | worksOffline, reference:github.com,help.arsenal.com,shippie.local,tfl.gov.uk,www.arsenal.com, privateRelay, localDb | — |
| photo-a-day | archived | archived | eligible-local (0 blocks, 0 warns) | photo-a-day/photo-a-day.v1 | worksOffline, localDb | — |
| pitch-forge | archived | archived | eligible-local (0 blocks, 0 warns) | pitch-forge/pitch-forge.v1 | worksOffline, sharesIntents, localDb | — |
| quartet | archived | archived | eligible-local (0 blocks, 0 warns) | quartet/quartet.v1 | worksOffline, localDb | — |
| quiet | featured | launch | eligible-local (0 blocks, 0 warns) | quiet/quiet.v1 | worksOffline, sharesIntents, localDb | — |
| reaction | archived | archived | eligible-local (0 blocks, 0 warns) | reaction/reaction.v1 | worksOffline, localDb | — |
| read-later | archived | archived | eligible-local (0 blocks, 0 warns) | read-later/read-later.v1 | worksOffline, localAi, sharesIntents, localDb | — |
| receipt-snap | featured | launch | eligible-local (0 blocks, 0 warns) | receipt-snap/receipt-snap.v1 | worksOffline, sharesIntents, localDb | — |
| restaurant-memory | labs | labs | eligible-local (0 blocks, 0 warns) | restaurant-memory/restaurant-memory.v1 | worksOffline, sharesIntents, localDb | — |
| shopping-list | archived | archived | eligible-local (0 blocks, 0 warns) | shopping-list/shopping-list.v1 | worksOffline, localAi, privateRelay, sharesIntents, localDb | — |
| show-and-tell | archived | archived | eligible-local (0 blocks, 0 warns) | show-and-tell/show-and-tell.v1 | privateRelay | — |
| sip-log | archived | archived | eligible-local (0 blocks, 0 warns) | sip-log/sip-log.v1 | worksOffline, sharesIntents, localDb | — |
| site-visit | archived | archived | eligible-local (0 blocks, 0 warns) | site-visit/site-visit.v1 | worksOffline, sharesIntents, localDb, localFiles | — |
| sleep | featured | launch | eligible-local (0 blocks, 0 warns) | sleep/sleep.v1 | worksOffline, sharesIntents, localDb | — |
| snake | arcade | launch | eligible-local (0 blocks, 0 warns) | snake/snake.v1 | worksOffline, localDb | — |
| snap-and-forget | labs | labs | eligible-local (0 blocks, 0 warns) | snap-and-forget/snap-and-forget.v1 | worksOffline, localDb | — |
| stack | arcade | launch | eligible-local (0 blocks, 0 warns) | stack/stack.v1 | worksOffline, localDb | — |
| steep | featured | launch | eligible-local (0 blocks, 0 warns) | steep/steep.v1 | worksOffline, secureBackup, sharesIntents, localDb | — |
| story-studio | archived | archived | eligible-local (0 blocks, 0 warns) | story-studio/story-studio.v1 | worksOffline, sharesIntents, localDb, localFiles | — |
| sudoku | archived | archived | eligible-reference-network (0 blocks, 0 warns) | sudoku/sudoku.v1 | reference:github.com | — |
| symptom-diary | featured | launch | eligible-local (0 blocks, 0 warns) | symptom-diary/symptom-diary.v1 | worksOffline, sharesIntents, localDb | — |
| tab | featured | launch | eligible-local (0 blocks, 0 warns) | tab/tab.v1 | worksOffline, privateRelay, sharesIntents, localDb | — |
| tap-counter | labs | labs | eligible-local (0 blocks, 0 warns) | tap-counter/tap-counter.v1 | worksOffline, localDb | — |
| therapy-notes | featured | launch | eligible-local (0 blocks, 0 warns) | therapy-notes/therapy-notes.v1 | worksOffline, sharesIntents, localDb | — |
| touch | archived | archived | eligible-local (0 blocks, 0 warns) | touch/touch.v1 | worksOffline, sharesIntents, localDb | — |
| voice-memo | featured | launch | eligible-local (0 blocks, 0 warns) | voice-memo/voice-memo.v1 | worksOffline, sharesIntents, localDb, localFiles | — |
| whiteboard | arcade | launch | eligible-local (0 blocks, 0 warns) | whiteboard/whiteboard.v1 | privateRelay | — |
| world-cup-fantasy | archived | archived | eligible-local (0 blocks, 0 warns) | world-cup-fantasy/world-cup-fantasy.v1 | worksOffline, sharesIntents, localDb | — |
| would-you-rather | archived | archived | eligible-local (0 blocks, 0 warns) | would-you-rather/would-you-rather.v1 | worksOffline, localDb | — |
