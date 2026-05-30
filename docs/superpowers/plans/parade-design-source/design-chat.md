# Arsenal Branding

_Started 2026-05-22 10:59 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Parade"
Project is currently empty (no files)
Current date is now May 22, 2026
</system-info>

<default aesthetic>
If no references, art direction or design systems were provided, use this default professional modern, minimal aesthetic as a base. Declare your choice out loud so you stick to it. Guidance:
- Choose a type pairing from web-safe or bundled local fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are files in the project already.
</default aesthetic>

<pasted_text name="Pasted text (92 lines)">
Design a mobile-first web app called "Arsenal Victory Parade 2025" — a Shippie tool that works completely offline for fans at the victory parade with zero phone signal.
Brand context:
This is a tool on Shippie, an open-source local-first platform. Shippie's brand is warm, counterculture, anti-corporate. The design should blend Shippie's identity with Arsenal's celebration energy.
Colour palette:

Primary dark: #14120F (warm black)
Cream: #F5EFE4 (warm white for text and backgrounds)
Arsenal red: #EF0107 (used sparingly — accents, celebration moments)
Arsenal gold: #EDBB4A (trophy, champion highlights)
Shippie sage: #5E7B5C (secondary accents, calm elements)
Sunset orange: #E8603C (Shippie energy accent)

Typography:

Display/headers: Fraunces (serif, warm, celebratory)
Body text: General Sans (clean, readable)
Data/labels/small text: JetBrains Mono (techy, gives a local-first feel — use this aggressively for coordinates, times, distances, stats)

Design principles:

Dark mode default (matches the Shippie aesthetic and looks premium)
Sharp corners on cards and containers (no border-radius — Shippie's signature)
Minimal UI — every screen has ONE primary action
Dense information without feeling cluttered
The app should feel like a beautiful utility, not a sports app. No stock football imagery. No gradients. No glossy effects. Clean, warm, functional.

Design these 5 screens:
Screen 1: Home / parade map (the main screen, 70% of the app)
A full-bleed vector-style map of the parade route from Drayton Park to Islington Town Hall. The map should be stylised — not a Google Maps clone but a beautiful illustrated route map in the app's colour palette. Dark background. Route drawn as a warm gold line. Key landmarks as small labelled dots.
A glowing GPS dot shows "You are here" — pulsing gently with a warm gold glow. This is the hero element of the entire app.
At the top: "Arsenal Champions 2024/25" in Fraunces with a small trophy icon. Below that in JetBrains Mono: "Your GPS works offline. No signal needed."
At the bottom: a compact info bar showing:

"Bus estimated at: Holloway Road · ~2:34pm" (in JetBrains Mono)
Small indicators for friend positions (if hotspot connected): coloured dots with initials

The map should have subtle labels for: tube stations (marked as open ✓ or closed ✗), meeting points (starred), first aid points, and road closures.
Screen 2: Group plan (swipe left from map)
The pre-agreed meeting points and group plan. Dark background. Card-based layout with sharp corners.
Header: "The Invincibles" (group name) with member count "5 members"
Three meeting point cards stacked vertically:

"📍 Start: Outside Emirates, 8am" — with a small map snippet showing the location
"📍 If separated: Clock tower, every :30" — with countdown "Next check-in: 12 min"
"📍 After parade: The Gunners pub, 4pm"

Below the cards: "Hotspot status" section

"Sarah's hotspot: Arsenal-Invincibles"
"Connected: You, Sarah, Tom" (green dots)
"Not connected: James, Lucy" (grey dots)
"Last seen: James — Upper Street, 14 min ago"

A subtle button at the bottom: "Find my group 🔊" (the audio beacon feature)
Screen 3: Celebrate (swipe right from map)
Full screen. Dark background. A massive circular button in the centre — gold/amber, trophy-coloured, with a subtle pulse animation.
Above the button: "🏆 CHAMPIONS" in large Fraunces type
The button has no label — it's obviously tappable. Below it in JetBrains Mono:

"Your celebrations: 847"
"Taps this minute: 23"

At the very bottom, small text: "Your parade story will generate after the event"
This screen should feel like pure joy. The button should look satisfying to tap. When tapped (show a tapped state), the button compresses slightly and a gold ripple emanates outward. Design the resting state and the tapped state.
Screen 4: Info (accessible via a small ℹ️ icon on the map screen)
Practical parade information. Dark background. Clean typographic layout, no cards — just well-spaced text sections.
Sections:

"Route" — Drayton Park → Holloway Road → Highbury Corner → Upper Street → Islington Town Hall. In JetBrains Mono.
"Timing" — Gates: 7am. Bus departs: ~1pm. Estimated at your location: calculating from GPS...
"Transport" — Which stations are open/closed, listed cleanly
"Road closures" — Listed with times
"Safety" — Flares warning, first aid locations, emergency meeting point
"Your phone" — "GPS works without signal. This app is cached on your phone. Everything here works offline."

Screen 5: Shareable card (generated after the parade)
A portrait-ratio card (1080×1920, Instagram Story format) designed to be screenshot and shared.
Dark background with subtle texture. Gold trophy at the top. Arsenal red accent line.
Content:

"ARSENAL CHAMPIONS 2024/25"
"I was there."
"📍 Holloway Road"
"847 celebrations"
"Part of 2.4 million taps along the route"
Small Shippie rocket icon at the bottom with "shippie.app/parade"
"No signal. No problem." in small JetBrains Mono text

This card should look premium enough that a fan is proud to share it on Instagram. Not cluttered. Not logo-heavy. Clean, dark, gold, celebratory.
Overall feel:
The app should feel like a beautiful, calm utility amidst the chaos of 2 million people. It's not trying to be exciting — the parade is exciting. The app is the reliable, warm, trustworthy thing in your pocket that works when nothing else does. Think: luxury watch meets offline survival tool. Warm blacks, gold accents, sharp typography, generous spacing.
No onboarding screens. No tutorial. No login. The user opens it and the map is there. Everything works. They figure it out in 3 seconds because there's nothing to figure out.
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Hi-fi design">
Create a high-fidelity, polished design. Follow the instructions about design in your system prompt, particularly the 'How to do design work' section. Use the design_canvas starter component, or make a full-bleed prototype and offer options via Tweaks.
</attached-skill>

<attached-skill name="Interactive prototype">
Create a fully interactive prototype with realistic state management and transitions. Use React useState/useEffect for dynamic behavior. Include hover states, click interactions, form validation, animated transitions, and multi-step navigation flows. It should feel like a real working app, not a static mockup.
</attached-skill>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant

_[tool: update_todos]_

I'll design this as a fan utility concept — five mobile screens laid out on a canvas for side-by-side review. I'll use the colors and content you specified, but keep the visual treatment original (no Arsenal logo/cannon, no recreated official-app patterns).

**System I'll commit to up front:**
- Background: #14120F warm black throughout; #1C1A16 elevated surfaces
- Type: Fraunces (display, italic for warmth), General Sans (body), JetBrains Mono (data, aggressively used for stats/coords/times)
- No border-radius anywhere (sharp Shippie corners)
- Gold #EDBB4A is the hero accent; red #EF0107 only for celebration moments and live indicators; sage and sunset orange as quiet supporting roles
- Map: hand-drawn-feeling stylized route, monospaced labels, no Google Maps clone
- Generous spacing, JetBrains Mono labels in small caps with letter-spacing for that "local-first utility" feel

_[tool: copy_starter_component]_

_[tool: copy_starter_component]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: write_file]_

_[tool: write_file]_

Now I'll build the project. I'll use sharp-cornered "app windows" rather than the rounded iPhone frame, since the design system specifies no border-radius and the device chrome would conflict with the brand identity.

_[tool: write_file]_

Now the hero — the Map screen with the stylized vector route.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Designed all five screens on a single pan/zoom canvas:

- **01 Map (hero)** — stylized vector route, dark warm-black ground with subtle stipple, gold path with underglow, six labeled landmarks (open/closed stations, meeting star, first aid, road closure), a pulsing "you are here" GPS dot at Holloway Rd, plus N indicator + scale bar + live coords. Bottom bar shows bus ETA and the four-person group mesh.
- **02 Group plan** — three meeting-point cards (start/fallback/end) with status accents (sage done, gold live + countdown, faded queued) and tiny per-card map snippets. Hotspot section lists host + connected + lost peers. Audio-beacon button in sunset orange.
- **03 Celebrate** — two artboards side-by-side showing resting and tapped states. Tappable for real (gold ripple, button compresses 4px, counter increments).
- **04 Info** — pure-typographic listing across six numbered sections, all stats in mono with green/red status markers.
- **05 Share card** — 1080×1920 Instagram Story: huge italic Fraunces "I was there.", three-stat strip, Shippie rocket mark, crop-mark corners.

A few caveats and where you might want to push next:
- The trophy mark is an abstract goblet — no Arsenal cannon, no club crest. If you want the real club identity in the design, you'll need to drop in your own logo files.
- I committed to two variations on Celebrate (resting/tapped). Happy to add tweaks: alternate color schemes (sage-as-primary, full-sunset), denser vs. sparser map labels, or an alternate share-card layout (asymmetric split, full-bleed type).
- The map is illustrative geometry, not real cartography. Easy to swap in a traced GeoJSON if you want geographic accuracy.

## User

nice but can we be a little more "arsenal" im thinking red and white?

## Assistant

_[tool: copy_starter_component]_

Pushing it Arsenal. My plan:
- **Route on the map → red** (gold was too "champagne", red is the team)
- **Status/live indicators → red** (gold reserved only for trophy + celebrate button — those are the championship moments)
- **Top "ARSENAL" wordmark band** added to each screen as a unifying motif
- **Share card → cream background** with red as the dominant color (home-kit feel) — much more "white" in the palette
- A Tweaks toggle to flip between the warm-Shippie palette and the new Arsenal-red one so you can compare

Let me make these edits.

_[tool: read_file]_

_[tool: grep]_

_[tool: str_replace_edit]_

Now update the Shell to expose a wordmark band component, then push each screen toward red/cream.

_[tool: str_replace_edit]_

Now push the Map screen toward red. Route changes from gold to red; ETA accent becomes red; keep GPS dot gold (the calm warm hero element).

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: write_file]_

Now the share card — flipping to cream background for the "Arsenal home kit" feeling:

_[tool: done]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

I can see issues — the wordmark band is overlapping with the map header, and "NO SIG" text in the status bar is wrapping. Let me fix.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: grep]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

The wordmark band is wrapping. Let me make it more compact, and fix the Map header where "24/25" is overflowing into the map.

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Share card looking lovely. Let me also verify the celebrate screen.

_[tool: view_image]_

_[tool: fork_verifier_agent]_

Looking great. Let me fork verifier and wrap up.Pushed it Arsenal:

- **Map route** is now Arsenal red with a red underglow (gold reserved for the GPS "you are here" pulse, which stays as the calm hero element).
- **ARSENAL wordmark band** sits below the status bar on every phone screen — small red rule + spaced caps wordmark, like a ticket-stub stamp.
- **Live status, group "host" badge, "Find my group" button** all moved to red. The button is now a solid red CTA instead of a hairline outline.
- **Celebrate** — "Champions" headline in italic red, trophy button stays gold (it IS the trophy moment).
- **Info** — section labels and route arrows in red.
- **Share card** flipped to **cream paper** with the Arsenal home-kit feeling: huge italic "I was / there." (cream + red), red-ribboned gold trophy as hero, big red 847 in Fraunces, red pin marker, all bordered with red rules. Feels more like a printed match-day program than a sports app.

Fixed along the way: the wordmark band was wrapping at narrow widths, "Champions 24/25" was overflowing — both tightened up.

## User

make the adds design like the share cards because that is beauitful. make our full theme as you have with the sharecard

## Assistant

_[tool: update_todos]_

Brilliant — paper mode everywhere. Let me redesign the whole theme to feel like the share card: cream paper, deep ink, red as the dominant accent, gold reserved for trophy moments. Like a printed match-day program.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: run_script]_

Now the big inversion — let me use a script to bulk-replace color tokens across all screen files.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Beautiful start. Let me see the full Map and Celebrate to check details.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Beautiful. Let me do a quick close-up of the map to make sure the vignette and grid work on paper.

_[tool: view_image]_

_[tool: save_screenshot]_

Let me also check that the share card and overall canvas hasn't broken anything.

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

Let me restore a small rule between the wordmark and meta — currently they look loose without a divider.

_[tool: done]_

_[tool: fork_verifier_agent]_

Whole app now feels like a printed match-day program — same DNA as the share card:

- **Cream paper background** on every screen (`#F5EFE4`), warm-black `#14120F` as the ink color, deep ink hairlines instead of glow on dark.
- **Wordmark band** above every screen: red `A · R · S · E · N · A · L` stamp + red rule + tiny meta on the right, with a red border-bottom separating it from the content (like a ticket-stub edge).
- **Red as the dominant accent** — route on the map, section headers in Info, live status in Group, "Find my group" CTA, big celebration counter on Celebrate.
- **Gold reserved for trophy moments** — the small header trophy icons (subtle foil-stamp feeling), the big Celebrate button, and the trophy on the share card.
- **Paper grain** replaces dark stipple; vignette dropped from 55% to 10% so corners gently age rather than smother.
- **Map** route became red on paper with grid lines visible as ink hairlines — feels much more like the illustrated street maps on a printed program.

A few details I tightened along the way:
- "Find my group" and "host" badge text are forced to cream so they stay readable on red.
- Celebration counter switched from gold → red (gold on cream has too little contrast).
- Group card mini-maps got a slightly darker paper-2 tint so they read as inset frames against the cream cards.

If you want me to keep going: I can introduce paper-edged ticket-stub crops on each card, add a Tweaks panel to flip back to the dark theme for comparison, or push the typography further with drop-caps / display Fraunces variants.

## User

do a pass and look for ways to improve it further, its very night already though

## Assistant

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Let me do a focused polish pass — making each screen echo the share card's DNA more strongly.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

Several things to polish: Info rows are wrapping, Map needs better start-point label, and I want to add a subtle "edition" stamp + page indicator across screens to echo the share card's program feel.

_[tool: str_replace_edit]_

_[tool: read_file]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

Now soften the celebrate button — that heavy 6px dark gold base looks more dark-mode than paper-mode.

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: read_file]_

_[tool: eval_js]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Polish pass — focused on the share-card DNA leaking into every screen:

- **YOU ARE HERE** label flipped to red (was washed-out gold on cream) with an added timestamp underneath so the hero marker reads as a live readout
- **Info screen footer** rebuilt to match the share card — red 2px top rule, larger Shippie rocket in red, **"NO SIGNAL. NO PROBLEM."** tagline in red caps
- **Info row layout** rewritten so the key (label) and value never both try to wrap on the same line; hint chips ("GPS") are smaller and lighter so they don't crowd the value
- **Info row labels** tightened: "Estimated at your loc" → "ETA at your location" so it actually fits
- **Celebrate button shadow** softened — dropped the 6px dark-gold base to 4px and lifted the ambient shadow color toward warmer brown, less dark-mode "embossed coin" and more cream-paper "polished medallion"
- **Group card metas** rewritten to fit on one line: "completed · 5/5 arrived" → "5 / 5 arrived", with explicit nowrap so the countdown doesn't push the label onto two lines

Visually consistent with the share card now: every screen has the same red rule treatment, the same italic Fraunces + mono caps + ink hairline rhythm.
