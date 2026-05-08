# Real-Phone Verification Checklist

> One-pass pre-launch verification on iPhone Safari + Android Chrome. Walk through this with both phones in hand. Estimated time: ~3 hours for the full 12-showcase + platform-surface walk; ~60-90 minutes if you skim the polish-batch surfaces and focus on Live Room / Recipe / Journal / Whiteboard / Crewtrip / Hero Trio.

**Pre-requisites:** the platform is deployed (see [`cf-google-deploy.md`](./cf-google-deploy.md)), DNS is propagated, you can `curl -sI https://shippie.app` and get 200.

Set up:

- Phone A: iPhone running iOS 17+, Safari is the default browser.
- Phone B: Android running Chrome 120+ (or Edge / any Chromium).
- Both phones on the same Wi-Fi network for the Connect tests.

---

## Showcase 1 — Live Room (Phase 1 wedge)

1. **Install on phone A** at `https://live-room.shippie.app/` (or the showcase URL once seeded).
   - [ ] Tap install prompt → app icon appears on home screen as a sharp square (no rounded corners on Android; iOS rounds it but the original SVG is square).
   - [ ] Open from home screen — full-screen, no browser chrome, splash screen briefly visible.
2. **Host a room.**
   - [ ] On phone A, tap "Host a room" → see a 6-character join code + QR.
   - [ ] Confirm the URL `https://live-room.shippie.app/?code=ABC123` is correct under the QR.
3. **Join from phone B.**
   - [ ] Open Chrome on phone B → scan the QR with the camera. The app loads in 2-3 seconds.
   - [ ] Phone B sees "Waiting for the host to start…".
4. **Run a 3-question quiz.**
   - [ ] On phone A, tap "Start quiz".
   - [ ] On phone B, the question appears. Tap the BUZZ button — feel the haptic confirm texture; the button scales down with spring physics on press.
   - [ ] On phone A, the host sees the buzz attribution (`peer-id` short hex) within ~30ms.
   - [ ] Tap "Reveal answer" → phone B sees the answer reveal.
   - [ ] Repeat for question 2 and 3. Confirm the scoreboard bars animate with spring physics; the winner row pulses with the milestone texture at end of quiz.
5. **Latency measurement.**
   - [ ] Pull the `room_audit` rows for this match from D1 (`wrangler d1 execute shippie-platform-d1 --command "SELECT * FROM room_audit WHERE room_id='<roomid>' ORDER BY ts;"`).
   - [ ] Compute median + p95 from the timestamp deltas. Capture honestly. Acceptable range: median <30ms, p95 <60ms on local Wi-Fi.
6. **Buzzer fairness video.**
   - [ ] Set up phones side-by-side, both joined to the same room.
   - [ ] Have a third device (laptop) film a video of both phones at the same time.
   - [ ] Hit the BUZZ on both phones at near-identical timestamps. Repeat ~5 times.
   - [ ] Verify the buzzer-fairness rule: the phone with the earlier `Date.now()` always wins, even when network jitter would have flipped a server-side determination. Save the video — it's the launch asset.

Acceptance for Live Room:
- [ ] Two-phone smoke completes
- [ ] Sub-30ms median remote latency confirmed by `room_audit` rows
- [ ] 60-second buzzer-fairness video captured

---

## Showcase 2 — Recipe Saver (Phase 2 — Wrap + Run)

1. **Install on phone A** at `https://recipe.shippie.app/`.
   - [ ] Square icon on home screen.
   - [ ] Splash screen, full-screen launch, no browser chrome.
2. **Add recipes offline.**
   - [ ] Toggle airplane mode on phone A.
   - [ ] Add 3 recipes via the "+" button. Each save fires the `confirm` haptic.
   - [ ] Reload the app. Recipes persist (local SQLite via OPFS).
3. **Wake lock during cooking.**
   - [ ] Open one recipe → tap "Cooking mode".
   - [ ] Confirm the screen does NOT auto-dim or sleep for at least 2 minutes.
4. **Your Data panel.**
   - [ ] Open settings → "Your Data" or visit `/__shippie/data` directly.
   - [ ] Confirm storage breakdown shows non-zero usage (DB rows, files).
   - [ ] Tap "Export" → an encrypted `.shippie-backup` file downloads.
   - [ ] Tap "Delete all data on this device" → confirm modal → all recipes gone.
5. **Recovery.**
   - [ ] After delete, navigate back to `https://recipe.shippie.app/` → "no recipes yet" empty state.
   - [ ] Visit `/__shippie/data` again — Your Data panel still loads even with no app data, proving the panel survives a broken/empty state.

---

## Showcase 3 — Journal (Phase 2 — Run + Vault)

1. **Install on phone A** at `https://journal.shippie.app/`.
   - [ ] Square icon, full-screen launch.
2. **Write entries.**
   - [ ] Add 5 journal entries over different days (you may need to spoof the date or just space them in time).
   - [ ] Confirm patina: the most recent entry is brighter than the oldest. The background subtly warms with each entry.
3. **Local sentiment / search.**
   - [ ] If sentiment AI is wired, write entries with clearly different tones (happy, anxious, neutral). Confirm each entry's warmth gradient reflects sentiment.
   - [ ] Use the search box with a free-text query like "the time I felt anxious about the deadline" → semantic recall returns the matching entry even if the exact words don't match.
4. **AI Transparency Ledger.**
   - [ ] Tap settings → "AI activity". Confirm every inference has a `source` field (`webnn-npu`, `webgpu`, or `wasm-cpu`) and that no input text is logged.
5. **Encrypted backup.**
   - [ ] Set a backup passphrase.
   - [ ] Tap "Back up to Drive" — popup opens at `https://shippie.app/oauth/google-drive`. Authorize.
   - [ ] Confirm the popup closes and the panel reports "Backup complete." → check your Google Drive at `Shippie Backups/journal/` — there should be a `.shippie-backup` file (opaque ciphertext).

---

## Showcase 4 — Whiteboard (smoke for Connect)

1. **Open `https://whiteboard.shippie.app/` on both phones.**
2. **Host on A, join on B via QR.** Two-finger pinch zoom + draw on phone A.
3. **Draw on B.** Confirm phone A sees the strokes in real-time. Local stroke 0ms (phone A's own draw), remote stroke <30ms (phone A seeing phone B's draw).
4. **Cross-NAT test.** If you have a second Wi-Fi network, put one phone on each. Confirm WebRTC TURN fallback works (this exercises the Cloudflare Calls integration — currently flagged as "not real-network-tested" in the runbook; this is the test).

---

## Showcase 5 — Crewtrip (camera + canvas wrap share)

1. **Open `https://shippie.app/run/crewtrip/` on phone A as a fresh visit (clear localStorage if needed).**
   - [ ] EntryScreen offers Continue / Start new / Join with code / See demo. NOT auto-dropped into seeded demo.
2. **Start a new trip.** Pick a theme (Coast / Olive / Tangerine / After dark). Confirm Fraunces serif renders + the palette warmth changes the page background.
3. **Camera FAB.** Tap the camera pill in the FAB row → iOS rear camera opens directly (no permission prompt before picker; the prompt fires on first capture). Take a photo.
   - [ ] Memory polaroid appears with ±0.4°/0.7° rotation.
4. **Wrap share image.** Open Wrap tab → tap "Share image".
   - [ ] On iOS Safari: native share sheet opens with a 1080×1350 PNG attached.
   - [ ] On Android: share sheet OR download fallback (browser-dependent).
5. **Word codes.** Note the join code (e.g. `OLIVE-PORCH-07`). Read it aloud — does it parse cleanly?
6. **Phone B joins.** Open the join URL on phone B → confirm the trip name, palette, and 1+ memory replicate.

---

## Showcase 6 — Receipt Snap (on-device vision)

1. **Open `https://shippie.app/run/receipt-snap/` on phone A.**
2. **Capture a receipt.** Tap the camera button → take a photo of any printed receipt.
   - [ ] iOS first-capture permission prompt fires; allow.
   - [ ] On-device OCR runs — Transformers vision pipeline pulls from `/__esm/` (first run is slow, ~5-10s warmup; subsequent runs <2s).
3. **Verify extraction.** Confirm vendor, line items, total, and confidence score appear. Edit any field that's wrong.
4. **Receipt persists.** Reload page → receipt is still there (local-db / OPFS).
5. **Glance check.** Visit `/glance` afterwards → confirm "1 expense logged" or similar appears in today's headline (intent `expense-logged`).

---

## Showcase 7 — Tab (nearby bill split, no account)

1. **Phone A:** open `https://shippie.app/run/tab/` → tap "+ new tab".
2. **Phone A:** add 3 line items (e.g. "Pizza 12.50", "Beers 8.00", "Tip 4.00"). Tap "Share with the table".
3. **Phone B:** scan QR or tap the share link (Mevrouw 2-party mesh — uses `relay-provider.ts` with PBKDF2 + AES-GCM).
   - [ ] Both phones show the same tab in <10s — no signup, no account.
4. **Phone B:** add an item from their side. Phone A should see it within <5s.
5. **Split view.** Swipe to "Split evenly" or "Per person" and confirm both phones agree on totals.

---

## Showcase 8 — Voice Memo (on-device Whisper)

1. **Open `https://shippie.app/run/voice-memo/` on phone A.**
2. **Hold the record button.** Speak ~10 seconds of clear English. Release.
   - [ ] iOS first-capture: microphone permission prompt fires; allow.
3. **Whisper transcription.** First run downloads model via `/__esm/` proxy — expect a 10-20s "loading model" indicator. Subsequent recordings transcribe in ~3-5s.
   - [ ] Transcript matches what you said (small fillers/hesitations expected).
4. **Confirm staying local.** DevTools Network tab during recording should show NO outbound request to `*.openai.com`, `*.assemblyai.com`, or any external transcription API. Only `/__esm/*` traffic.
5. **Storage.** Recording persists across reload — check `/__shippie/data` for the audio blob (OPFS).

---

## Showcase 9 — Site Visit (offline inspections + print-PDF)

1. **Open `https://shippie.app/run/site-visit/` on phone A.**
2. **Toggle airplane mode.** App should still load (PWA cache).
3. **Add a site → start a visit → use the "Food safety" template.**
   - [ ] Capture 2 photos via the camera FAB.
   - [ ] Tap "Sign" → draw a signature on the canvas pad.
   - [ ] Flag 1 incident with severity + note.
4. **Print PDF.** Tap "Print report" → browser print dialog opens with `@media print` view.
   - [ ] On iOS: "Save to Files" produces a usable PDF.
   - [ ] On Android: "Save as PDF" or print to paper.
5. **Reconnect.** Toggle airplane mode off — confirm the visit's events appear in `/glance` (`visit-completed`, `incident-flagged`).

---

## Showcase 10 — Touch (private follow-up tracker)

1. **Open `https://shippie.app/run/touch/` on phone A.**
2. **Add 5 contacts** with cadence (weekly / fortnightly / monthly / quarterly / yearly).
3. **Mark one as "Touched today".** Confirm the next-touch pill updates.
4. **Weekly review surface.** Open the weekly review screen — "Due this week" / "Overdue" / "Coming up" categories.
5. **CSV export.** Tap export → CSV downloads. Open in a sheet app and confirm it has rows + headers.

---

## Showcase 11 — Pitch Forge (on-device drafting)

1. **Open `https://shippie.app/run/pitch-forge/` on phone A.**
2. **Pick the "Grant" template.** Fill in 3 prompts (problem / solution / ask).
3. **Tap "Draft".**
   - [ ] First run: model warmup via `/__esm/` (~10-15s). Show progress.
   - [ ] Subsequent runs: ~3-5s.
   - [ ] DevTools Network: no outbound to OpenAI / Anthropic / etc. Only `/__esm/`.
4. **Edit + snapshot.** Edit the draft → tap "Save version".
5. **Diff compare.** Open versions panel → diff old vs new shows line-level changes.
6. **Print PDF.** Tap "Print" → @media print produces a usable handoff document.

---

## Showcase 12 — Care Log (caregiver mesh, solo by default)

1. **Open `https://shippie.app/run/care-log/` on phone A.**
2. **Solo flow first.**
   - [ ] First-run: prompt to identify primary caregiver (you).
   - [ ] Add 1 medication + dose + schedule.
   - [ ] Mark dose as "given" — log entry timestamps.
   - [ ] Add 1 symptom record.
3. **Co-caregiver pairing (optional).** Tap "Share with another caregiver" → 8-char pair code generated (Mevrouw template).
4. **Phone B joins.** Enter pair code on phone B → both phones share state E2E-encrypted.
5. **Handover.** Phone A taps "Generate handover note" → produces auditable list of meds-given + symptoms-logged-since-last-handover. Print or share.

---

## Platform surface — /glance + /today

1. **After running 3+ of the above showcases, open `https://shippie.app/glance` on phone A.**
   - [ ] One-sentence headline reflects today's activity ("Today: 1 receipt, 1 voice memo, and a site visit").
   - [ ] 7-day sparklines render for each app that's seen activity.
   - [ ] "Gone quiet" panel shows apps not used in ≥7 days (will be empty on first visit).
2. **Open `https://shippie.app/today`.**
   - [ ] Same data, log-shape per-app cards with drilldowns.
3. **Verify privacy.** DevTools Network on `/glance` load — only platform asset requests, NO outbound POST to anything that looks like analytics. The aggregator runs on-device against IndexedDB.

---

## After all twelve showcases pass

- [ ] **Public listing pages** at `/apps/recipe`, `/apps/journal`, `/apps/whiteboard`, `/apps/live-room` show **proven** Capability Proof Badges (filled sage-green pills with ✓) once the daily 4am rollup has run at least once. Allow 24 hours after the smoke for badges to appear.
- [ ] **Maker dashboard** at `/dashboard/apps/[slug]/proof` shows per-event distinct-device counts and pending-badge progress.
- [ ] **Maker dashboard** at `/dashboard/apps/[slug]/enhancements` shows the auto-detected enhancements.
- [ ] **Buzzer-fairness demo video** is captured + edited to 60 seconds.

When this checklist passes, Phase 1 + Phase 2 acceptance are met.

---

## What to do if something fails

| Symptom | Likely cause |
|---|---|
| Install prompt doesn't appear | Manifest missing icons / theme color / display mode. Check `/__shippie/manifest.json` directly. |
| Buzzer haptics don't fire on iPhone | iOS only supports the Vibration API since iOS 17.4 with `navigator.vibrate`. Confirm OS version. |
| Two phones can't see each other in a room | SignalRoom DO not deployed (`wrangler deployments list` for the platform). Or DNS for `proximity.shippie.app` not propagated. Check the Wrangler tail (`wrangler tail`) during the join attempt. |
| Backup popup hangs | `OAUTH_COORDINATOR_SECRET` or `GOOGLE_DRIVE_CLIENT_*` env vars missing. Check Pages → shippie-platform → Environment variables. |
| Capability Proof Badges don't appear | The daily cron (`0 4 * * *`) hasn't run yet. Or proof events haven't reached threshold (3 distinct devices). Use this checklist itself across two phones to prime the data. |
| `/__shippie/data` returns 500 | Worker logs (`wrangler tail`) for the actual error. Most likely a binding mismatch in `wrangler.toml`. |
