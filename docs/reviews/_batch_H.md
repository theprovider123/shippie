### showcase-touch
**Stack:** Vite + React 19, IndexedDB (sqlite-wasm), cross-app intent bridge
**Summary:** Contact manager — people/review/tags/settings tabs; `next-touch.ts` cadence logic; coffee/dinner intents broadcast back as `touch-logged`.

**UI polish:**
- Sentiment chips (`.sentiment-chip.active.pos/neu/neg`, styles.css:357) lack hover affordance on active; add a `:hover` rule.
- Cross-app prompt card uses inline `borderLeft: '3px solid #A86060'` (App.tsx:368); extract to `.card.cross-app-prompt`.

**UX flow:**
- Empty People tab shows tab-switcher only; add an onboarding card when `people.length === 0`.
- Overdue tasks blend in visually; add `.task-row.overdue { border-left: 3px solid #D88882; }`.

**Feature additions:**
- Archive/unarchive toggle on Person detail; soft-delete without losing history.

**Cleanup / tightening:**
- `LogTouchSheet` uses native `prompt()` / `confirm()` (App.tsx:254, 264); replace with the styled sheet backdrop (already in CSS).

---

### showcase-voice-memo
**Stack:** Vite + React 19, Whisper-tiny via Web Worker, localStorage for memos + audio blobs
**Summary:** Hold-to-record memo with local Whisper transcription, tagging, search; dark mode with CSS custom props.

**UI polish:**
- Progress bar `.vm-progress-bar` (styles.css:257) is `height: 4px` with no radius; add `border-radius: 2px`.
- Edited memos lack visual indication; add `.vm-memo-card.is-edited::before { content: '✎ '; color: var(--accent-strong); }`.

**UX flow:**
- Transcription failure surfaces only when user opens the memo; add a Today.tsx red banner: "Transcription failed on memo X — edit by hand".
- Settings shows `modelDownloaded` flag but no Re-download button; add one with toast result.

**Feature additions:**
- Memo playback inline — wire `player` component to show play/pause + waveform scrub on the memo view.

**Cleanup / tightening:**
- `voice.recorded` observation emits only duration (App.tsx:159); add `language: settings.language` so Sense can detect polyglot patterns without storing transcript.

---

### showcase-whiteboard
**Stack:** Vite + React 19, Yjs CRDT, proximity groups (8-char codes), canvas 2D
**Summary:** Collaborative drawing on shared WiFi — room codes, QR invite, replay mode, predictive-paint for instant local feedback.

**UI polish:**
- Inline `border: '1px solid #2A2520'` scattered in 3 places (App.tsx:390, 443, 553); extract to a CSS class or design token.
- SharePanel (App.tsx:553) is a card-on-canvas with shadow but no backdrop; add `.share-panel-backdrop` so it reads as a modal.

**UX flow:**
- Auto-join `?j=CODE` (App.tsx:73) fails silently; add retry button + "Ask for a new QR" fallback.
- Replay mode disabled when `totalStrokes === 0` (App.tsx:467) but the label doesn't reflect the reason; add `(no strokes to replay)`.

**Feature additions:**
- Export-as-JSON snapshot of Yjs doc (currently PNG only) — preserves stroke metadata (creator, timestamp, order).

**Cleanup / tightening:**
- `dangerouslySetInnerHTML` on QR SVG (App.tsx:564) needs a comment explaining `renderQrSvg()` returns trusted in-process SVG, not user input — justify the eslint-disable.

---

### showcase-would-you-rather
**Stack:** Vite + React 19, deterministic daily questions (60-question cycle), localStorage answers, observations
**Summary:** Two-tap daily preference builder — same question across devices for a given date, lifetime A/B bar chart, on-device pattern analysis.

**UI polish:**
- Picked-state styling only changes border weight (App.tsx:85); add `.option.picked { transform: scale(1.002); }` for pressed-in feel.
- Letter badge (`.option .letter`, App.tsx:65) doesn't reflect accent; add `.option.picked .letter { color: inherit; }` so it picks up the option's `--accent-a` or `--accent-b`.

**UX flow:**
- Stats section only renders if `stats.total > 0` (App.tsx:119); first-timers see nothing — add a "You haven't started building your pattern yet" pre-state message.
- "Come back tomorrow" copy (App.tsx:115) doesn't show when "tomorrow" is in their timezone; append `new Date(...).toLocaleDateString()`.

**Feature additions:**
- "Change your answer" button when `todayAnswer` is set — re-emits the observation and lets users flip-flop visibly.

**Cleanup / tightening:**
- Observation emits `choice: 'a' | 'b'` (App.tsx:65) without `question_id`; add it so Sense can correlate answers across days.
