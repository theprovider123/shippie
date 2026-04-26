# Real-Phone Verification Checklist

> One-pass pre-launch verification on iPhone Safari + Android Chrome. Walk through this with both phones in hand. Estimated time: 60-90 minutes.

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

## After all four showcases pass

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
