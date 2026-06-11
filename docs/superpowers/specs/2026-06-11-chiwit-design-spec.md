# Chiwit — Design Spec (extracted from ~/Documents/chiwit design/Chiwit.dc.html)

> Authoritative visual source: `/Users/devante/Documents/chiwit design/Chiwit.dc.html` — read it before building.
> Logo asset: `/Users/devante/Documents/chiwit design/uploads/icon.png` (lotus mark, 1.3MB — resize before committing).
> Philosophy: "Small things, done often, grow a life." Prose over metrics. No streaks, no numeric moods, no guilt UI.

## 1. Design tokens

| Token | Hex | Usage |
|---|---|---|
| coral (brand) | `#A84136` | accent, selected mood, active nav, lotus |
| coral pressed | `#86352A` | pressed primary button |
| ink | `#1C1A17` | headlines, primary text |
| paper | `#F7F4EF` | app background |
| page tan | `#EAE5DC` | page/document background |
| card | `#FFFDF9` | card fill |
| card warm | `#FFF8F0` / border `#EDE4D6` | journal prompt card |
| border | `#D3CEC1` | 0.5px card borders |
| divider | `#E2DDD0` | 0.5px row dividers |
| secondary | `#797466` | supporting labels |
| tertiary | `#8F8A7C` | microcopy, inactive nav |
| muted | `#9E988A` | uppercase labels |
| dark neutral | `#2E2B24` | letter/observation body |
| garden coral light | `#E9A687` | light mood bars |
| garden coral dark | `#CC6147` | heavy mood bars |
| garden neutral | `#BDB8AC` | missing days, dots |
| plum | `#8A5470` | medication / body signals |
| amber | `#9A5F30` | shared-data / habit / coffee |

Typography: **Georgia, serif** is the brand voice (greetings 23–24px, headings 21–24px, mood words 17–21px, letter body 15px lh1.85, italic for journal/notes/footers). System sans (`-apple-system, system-ui`) for functional UI: card titles 15px, subtitles 12px, uppercase labels 11px ls0.12em, pills 12px. No webfonts needed — Georgia is a system font.

Layout: cards 16px radius, 0.5px borders, **no shadows, no gradients**. Screen padding 24–36px H; section gaps 24–36px; card padding 16–26px. Bottom nav: 0.5px top border, 14px top / 30px bottom padding, 4 stroke icons 22×22 (active coral, inactive `#8F8A7C`).

Animations: `leafIn` (opacity 0→1, scale .3→1, .5s ease), `bloomIn` (.8s, scale .4→1) when all four little things are done; all interactive transitions 0.4–0.6s ease; mood words fade unselected to 0.38 opacity.

## 2. Screens (main mockups)

Nav tabs: **Today · Garden · Data · You/Letter** (stroke icons).

### Today
- Greeting "evening, sam" (Georgia 23px) — generate from time of day + stored name (optional, ask-free: default no name → "evening.").
- Date line: "wednesday 10 june · **four days of little things this week**" (coral fragment counts logged days this week — NOT a streak; never resets punitively, purely descriptive).
- "TODAY FELT" label → mood words as a prose line: `heavy · low · okay · light · bright` — tap to select; selected = bold + coral; others 0.38 opacity; dots `#BDB8AC`. Stored as the word string. Never numeric.
- "THE LITTLE THINGS" card — 4 rows (medication / water / movement / sleep), each: 20px stroke icon (med = plum pill rotated -30°, water drop, diagonal arrow, crescent moon), 15px title, 12px dynamic subtitle, right toggle (✓ coral when done, empty circle `#D3CEC1`). Water row increments (+ icon), subtitle "3 glasses · little sips add up". Med subtitles: "taken with breakfast" / "whenever you're ready" — skipping logs `{action:"skipped"}`, no red, no guilt.
- Footer note right-aligned Georgia italic 13px: "the day is still open" → "one little thing — a start" → "two little things today — they add up" → "all four, quietly done".
- Journal prompt card (warm cream): "anything worth keeping from today?" Georgia italic; inline input; lotus icon submit.
- Entry points: mic/“speak it” → Voice sheet; "+ a word of your own" → Your Words; evening: a quiet "tomorrow" line.

### Voice capture (sheet)
- 84px circle mic button, 1.5px coral border; caption "eight seconds was enough".
- Transcript card (Georgia italic 15px lh1.7) + lock note "transcribed and parsed on this phone".
- "I HEARD FIVE THINGS — SOUND RIGHT?" — parsed rows: icon + phrase + `category · detail` + coral check. Mood row has a "change" pill that cycles words.
- Primary button full-width coral, Georgia 17px white: "keep all five" (count dynamic).
- Footer: "the voice note itself is gone — unless you want it saved".
- Implementation note: no local whisper exists in the platform — use a textarea + OS keyboard dictation ("speak or type it") feeding the same deterministic parser. The parse-into-things magic is the feature.

### Garden
- Title "your garden" / "14 days of little things · all on this phone".
- 14 organic bars (40–96px tall, 4px top radius, 5px gap): light coral = lighter days, dark coral = heavier days, missing day = 5px neutral dot, center italic note "a quiet day — gardens rest". X labels "28 may" / "today". Mood→height mapping happens only inside this visualization (bright tallest/lightest), never shown as numbers.
- Observation cards (dismissible ×): icon + sentence + microcopy always ending "· just something noticed" / "worth knowing, nothing more". Examples: "on days you moved, your evening mood tended lighter" (seen across 9 of 11 days); "you wrote on the heavier days — words help carry them"; "late coffees (from lot.) lined up with shorter sleep 3 times" (cross-app, amber icon). Minimum evidence n=7 occurrences before surfacing.
- Woven (full pattern view) lives here below the arc: three-thread prose insights with inline coloured spans (plum=body, coral=mood, amber=habit), e.g. "walking days end lighter. written days end clearer. you do both more often than you think you do." Footer: lock icon + "woven on this phone. the threads never leave your hands."

### Data (transparency)
- Title 2 lines: "nothing hidden,\nnot even from you".
- Legend: coral dot "on this phone — physically can't leave"; plum dot "sealed cloud backup — encrypted · we're blind"; amber dot "you shared this — deliberate · one-off".
- Items card: mood entries / journal & voice notes / medication logs / sunday letters / pattern observations → coral badge "on this phone"; encrypted backup → plum "sealed"; therapy export · <date> → amber "was shared". Badges = 6px dot + 11px text, 999px radius, 0.1-opacity tinted bg.
- Footer Georgia italic: "the key that unlocks your backup lives only on your devices. we hold an envelope we cannot open."

### Sunday Letter (You tab)
- "your week in a letter" / "sunday 7 june · written on this phone".
- Small 7-bar mood arc (15–42px bars).
- Letter card: Georgia 15px lh1.85 prose generated from the week's local data (mood shape, journal fragments, movement, coffee↔sleep cross-signal, med count) — warm, factual, never advising. Sample register: "You had a heavier Tuesday and Wednesday — you wrote 'launch stress' on Tuesday night, which tracks. But you walked both days anyway. … Small things, most days — that's how a week like this gets built."
- Meta: lock + "composed entirely from your local data · never sent anywhere".
- Stat pills (hairline, 999px): "moved 5 days" · "doses 6/7" · "avg 6.8h sleep" · "wrote twice".
- "EARLIER LETTERS" archive list (date + italic first-line preview + chevron).

## 3. Radical concepts (the visionary register — adopt!)
- **Today as a Sentence (Concept A)**: the entire Today is interactive prose — no cards, no icons. "today felt heavy · low · okay · light · bright" with tappable words; habit lines: "your meds, taken with breakfast." / "your meds — whenever you're ready." · "one glass of water, so far." · "you walked. it counted." / "no walk yet — even a short one counts." · "seven hours of sleep, give or take." / "sleep, not logged. no rush." Done lines ink-normal; pending lines `#9E988A` italic. Adopted custom words append as lines, animating in with `leafIn`.
- **Today as a Stem (Concept B)**: central coral stem grows with each logged thing, alternating 25px rotated leaf squares (right `#CC6147` -45°, left `#E9A687` 135°), lotus bloom (`bloomIn`) when all four are done.
- **Tomorrow**: "tomorrow, thursday." + mood-aware carry-forward line + "ONE SMALL INTENTION?" — three tappable Georgia 19px options ("water before coffee" / "step outside early" / "lights out by eleven"); selected bold coral, others fade to 0.35; microcopy "just one. small is the point."
- **Your Words**: custom trackers as words. "the things you track are just words you keep." Categories — Body: period, bloating, migraine, energy · Mind: reading, meditation, worry · Moving: stretching, a run, yoga. "+ a word of your own". Adopted words = coral, others muted italic. Footer: "each word becomes a line in your day — phrased kindly, counted privately."

## 4. Build direction (locked)
Primary Today = **Concept A sentence prose** with the stem-bloom as the all-four-done flourish; little-things card retained nowhere — prose lines ARE the logger. Garden/Data/Letter per main mockups. Tomorrow + Your Words as sub-screens off Today. Voice sheet per above. 4-icon bottom nav.
