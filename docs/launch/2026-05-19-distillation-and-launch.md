# Distillation showcases + launch playbook — 2026-05-19

> Action plan extracted from a long product/launch conversation. Two tracks:
> 1. **Distillation showcases** — Shippie versions of famous apps that *don't clone* but *distill*. Build the tool the famous app should have been before VC bloat. Show cross-tool intelligence as the moat.
> 2. **Launch playbook** — stop building, start shipping. One tool, polished. Then HN. Then Reddit by tool, not platform. Then Twitter.
>
> **Out of scope for this plan** (per user, 2026-05-19): native iOS/Android wrapping. The Capacitor / native shell / Apple Health bridge discussion is explicitly deferred. Everything below works in the browser today.

---

## Track 1 — Distillation showcases

### The pattern

Don't say "Shippie Meal Log is like MyFitnessPal but private." That positions Shippie as a cheaper alternative in someone else's category. Instead: **distill the original to its core action and let the AI handle the analysis**.

| Famous app | Shippie distillation | Core action |
|---|---|---|
| MyFitnessPal | **Meal Log** | Type what you ate ("chicken stir fry") — AI estimates calories + patterns |
| Strava | **Move** | Tap activity type + duration + feel — 3 seconds |
| YNAB / Mint | **Spend** | Amount + category — 2 taps |
| Headspace | **Breathe** | Breathing circle + haptic pulse, no instructor voice |
| Duolingo | **Word** | One word per day in a new language + spaced-repetition tap |
| Sleep Cycle | **Rest** | Bedtime + wake time — 2 taps |
| Fitbit | **Steps** | Auto from phone pedometer (browser DeviceMotion) |
| Period tracker | **Cycle** | Single tap to log (already exists as showcase-cycle) |
| Calm | **Sounds** | Tap to play ambient sound |
| Water reminder | **Sip** | Tap per glass |

Each tool does ONE thing. Takes ≤5 seconds per use. Free forever. **The moat is the connections between them**, not any one tool.

### What to build first — the showcase trio

Don't build all 10. Build **3** that prove cross-tool intelligence:

| # | Tool | Status | Effort |
|---|---|---|---|
| D1 | **Meal Log** | New | ~2 days (single text input + local AI analysis) |
| D2 | **Move** | New (we have `showcase-body-metrics` but not this shape) | ~1 day |
| D3 | **Rest** | New | ~1 day |

The trio output is one weekly insight surfaced on `/you` or `/today`:

> *"You sleep 40 minutes longer on days you exercise. You eat more vegetables on days you sleep well. Your best days follow the pattern: good sleep → healthy food → exercise → good sleep. Day 4 of that cycle now."*

That insight is **impossible from any combination of Fitbit + MyFitnessPal + Sleep Cycle** because they don't share data. This is the demo that makes "tools that know each other" land.

### Implementation notes per tool

#### D1 — Meal Log

- One text input. Single submit. Local SQLite log row per entry.
- Local AI (`shippie.ai.run`) categorizes: meal kind, rough macro split, novel ingredient detection.
- Weekly card: *"You ate rice with 4 of 7 dinners. Saturday's takeaway was your highest-calorie day. No fruit Tue/Wed."*
- **Privacy posture**: drafting runs locally in the browser. If an export, backup, sync, or relay is added later, the UI must say so at the point of use.
- Showcase path: `apps/showcase-meal-log/`. Slug: `meal-log`. Surface: `featured`. Category: `food-drink`.

#### D2 — Move

- 6 activity types (walk/run/cycle/gym/yoga/sport). Duration picker. 5-step "how it felt" emoji row.
- Optional: passive step count from `DeviceMotion` accelerometer while tab is open (Android Chrome).
- Streak counter. Weekly summary: *"Moved 4/7 days. Best week yet."*
- Emits `move-logged` intent into the cross-app graph so Meal Log / Rest / Mood pick it up.
- Showcase path: `apps/showcase-move/`. Slug: `move`. Surface: `featured`. Category: `health`.

#### D3 — Rest

- Two taps: bedtime + wake time. Optional sleep-quality emoji.
- If unset, infer from launcher-memory's last-active timestamp at night vs morning (the convo's "approximate sleep from phone usage" idea — already partly enabled by container session timing).
- Weekly card: *"You averaged 7h 38m. Highest on Sunday (8h 50m). Lowest on Thursday (6h 12m)."*
- Emits `sleep-logged` intent.
- Showcase path: `apps/showcase-rest/`. Slug: `rest`. Surface: `featured`. Category: `health`.

### The compound insight surface

The trio's value emerges only when the three intents combine. Build a single dedicated card on `/today` (or `/you`):

```
Weekly insight
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
○ Move days: 4 of 7
○ Sleep average: 7h 32m
○ Meals logged: 18

Pattern: you sleep +43 min on Move days.
Pattern: you eat lighter on Move days.
Pattern: Saturday was your most-active day this week.

Three tools. Three taps per day.
A complete picture, on your device.
```

The pattern detection runs locally — a small JS heuristic over the last 28 days' events from the cross-app intent store. Doesn't need a heavy ML model.

### Health integration (browser-only paths — no native)

The conversation's biggest realisation: browsers can't read Apple Health / Google Fit. **But three workarounds are real today**:

| Path | Friction | When to ship |
|---|---|---|
| **Health Snap** (screenshot OCR) | 10s — take screenshot, drop in tool, local vision AI extracts numbers | Build alongside D1-D3 |
| **File Import** (Apple Health XML / Google Takeout drop) | 2 min, monthly cadence | After trio launches |
| **Phone sensors** (DeviceMotion accelerometer for approximate steps, Geolocation for distance) | Auto, but only while tab open and only Android Chrome reliably | Wire into Move directly, not a separate tool |

**Health Snap** is the genius hack. We already have on-device vision via the AI runtime — we already use it for Receipt Snap and Pitch Forge. Same primitive, different domain:

1. User opens Health Snap (new tool).
2. User picks the screenshot they took of their Fitbit / Apple Health screen.
3. Local Transformers vision model reads the numbers (Steps / Sleep / HR).
4. Numbers persist in local SQLite via the intent graph.
5. The compound insight now has wearable data without any integration.

No OAuth. No partnership. No App Store. No native code. **Build this as showcase #4 after the trio.**

---

## Track 2 — Launch playbook

### The one principle

> **Stop building. Start shipping.** The gap between "technically impressive platform" and "thing people use" is not more features. It's one compelling experience that makes someone say "you have to try this."

### What you actually need for launch

- **One tool that's undeniably good.** Loads <1s, usable in 5s, feels noticeably better than alternatives, works offline, zero login, generates a shareable output.
- **A way for someone to use it in under 10 seconds.**
- **A reason for them to share it with one friend.**

Not 50 tools. Not the mesh. Not the Hub. Not enterprise pricing. Not the full container with cross-app intelligence. Just **one excellent tool**.

### Pick the one — three candidates

| Candidate | Pro | Con |
|---|---|---|
| **Move** | Trivial to use; viral streak mechanic; ties to D1-D3 trio | Saturated category |
| **Meal Log** | Most striking proposition ("type, AI does rest") | Higher dependence on local AI being accurate |
| **Coffee** or **Dough** (existing showcases) | Already polished, niche communities | Niche; not the headline |
| **World Cup prediction** | Built-in deadline (June 11) + viral group mechanic + shareable cards | Lots to ship in 3 weeks |

**Recommendation**: ship one of the existing polished calculator showcases (Coffee or Dough) as the first viral tool **while** D1-D3 trio is in development. Coffee + Dough are ready today, they have novelty (haptic + spring physics), and they don't pretend to be more than they are. The trio is the second wave.

### Sequenced launch — 6 weeks

#### Week 1–2 — Polish the pick

Test on iPhone Safari, Android Chrome, Samsung Internet, old phones, slow connections. If it breaks on ANY of these, fix it before launch.

Acceptance criteria for the chosen tool:
- ✅ Loads <1s on 3G
- ✅ Usable within 5s of opening
- ✅ Works offline after first visit
- ✅ Zero login, zero signup, zero friction
- ✅ Generates a shareable output (image, link, result)
- ✅ Haptic + spring on every primary action

#### Week 2–3 — Get 50 real people using it

People you know. WhatsApp groups, sister, partner, colleagues, football mates. Not strangers.

Ask: *"Use this for a week and tell me what annoyed you."*

Don't ask "what do you think." Ask for friction reports.

Fix every friction report before any public launch.

#### Week 3–4 — HN Show post

- **Title**: `Show HN: Shippie – open-source tools that work offline and know each other (local-first, WebGPU AI, no login)`
- **Timing**: Tuesday or Wednesday, 9-10am US Eastern. NOT Monday (catch-up), NOT Friday (checkout), NOT weekend (buried).
- **Pre-arrangement**: 5-10 friends who've used Shippie ready to upvote in first 30 min. Not fake — real users.
- **Be in the comments** for 24 hours. Answer every question. Acknowledge limitations honestly: *"iOS install flow is clunky — Apple makes PWA installation deliberately confusing."*
- **Body** (concise, leads with the concept, mentions stack, invites feedback, has one memorable specific detail):

```
Hey HN,

I built Shippie — an open-source platform where small web tools
share a local database on your phone.

The idea: not everything needs to be an app. A recipe timer,
a dough calculator, a budget check — these should be tools
that take 5 seconds, work offline, and don't need your email.

The interesting part: tools that share data locally. Your coffee
ratio tool tells your water tracker about your caffeine. Your
spending tracker knows what your meal planner costs. No cloud
integration. No Zapier. They share a SQLite database on your phone.

Stack: SvelteKit, Cloudflare (D1, R2, Workers), SQLite WASM,
WebGPU for local AI inference, haptic feedback via the Vibration API.

Try it: shippie.app (just tap a tool and use it — no signup)
Source: github.com/theprovider123/shippie (AGPL-3.0)

Would love feedback on the architecture and the feel.
The haptics on the buttons are my favourite part.
```

#### Week 3–4 (same window) — Blog post tied to Thariq's HTML-tools piece

Thariq's article got 1.5M reads. Conversation still warm. Write:

- **Title**: *"You're already building tools. Give them a home."*
- Reference his article (people know it)
- Show how his throwaway HTML tools become persistent Shippie tools
- Demo: one command from Claude Code to deployed tool
- Cross-tool intelligence angle: *"His tools can't talk to each other. Shippie's can."*
- End: `shippie deploy my-tool.html — live in 60 seconds`

Post on personal blog, share on X/Twitter, submit to HN as a separate post **after** the Show HN cools down (3-4 days later).

#### Week 4–5 — Reddit, by specific community

**Don't post on r/programming or r/webdev first.** Saturated with self-promo. Start where Shippie solves a specific problem:

| Subreddit | Members | Angle | Lead with |
|---|---|---|---|
| **r/selfhosted** | 970K | "Open-source alternative to app subscriptions — runs on your phone, no server" | the architecture |
| **r/privacy** | 2.2M | "Local-first apps with explicit cloud choices" — be ready with technical sealed-cloud details | the privacy proof |
| **r/degoogle** | 250K | "Replaced 5 Google apps with local-first tools" | the anti-Big-Tech story |
| **r/soccer** (if World Cup tools ready) | 5.5M | "Free prediction game, no ads, no account" | the **tool** — don't mention Shippie |

**Rule for Reddit**: lead with the **tool**, not the platform. Nobody on r/soccer cares about "a local-first app platform." They care about "a free prediction game." The platform is what they discover after they're hooked.

#### Week 5–6 — Twitter/X thread

Six-tweet thread, video-led:

1. **Tweet 1** (hook): *"I built an app platform where small tools start on the user's phone: local storage, local AI where possible, optional encrypted continuity when people ask for it. Here's how it works: 🧵"*
2. **Tweet 2**: architecture diagram (simple, visual)
3. **Tweet 3**: **15-second screen recording** of haptic + spring on Shippie buttons. **This is the crucial tweet.** People retweet videos. They don't retweet architecture descriptions.
4. **Tweet 4**: cross-tool intelligence demo (30s screen recording — Meal Log → Move → weekly insight card)
5. **Tweet 5**: sealed cloud diagram (how sync works without readable data)
6. **Tweet 6**: `Try it: shippie.app — Source: github.com/theprovider123/shippie`

#### Week 6+ — World Cup wave (conditional)

If a World Cup prediction showcase ships before June 11: the tournament does the marketing. Shareable prediction cards flow to Instagram Stories and WhatsApp groups. Each card says "Play free at shippie.app/[slug]." The tournament sustains 5 weeks of organic distribution.

If the World Cup tools aren't ready, **don't wait**. Launch without. The platform stands on its own.

### What NOT to do (explicit)

- **Don't launch on Product Hunt first.** PH wants polished consumer apps. HN wants interesting architecture. Launch HN first; PH later when you have 1,000+ users and social proof.
- **Don't pay for ads.** Conversion from Google ad to "installed an open-source PWA platform" is effectively zero. Organic via communities is 100× more effective for this product type.
- **Don't launch everywhere at once.** A simultaneous HN + Reddit + Twitter + PH launch spreads attention too thin. You can't be in all those comments at once. Sequential, not simultaneous.
- **Don't pitch Shippie as a platform.** Nobody gets excited about platforms. They get excited about tools. *"An open-source local-first cross-app intelligence framework"* makes eyes glaze. *"A recipe timer that feels alive and knows your pantry"* makes people tap. **Lead with tools. The platform is what they discover.**
- **Don't write a founder blog post at launch.** Nobody cares about the journey at launch. They care about: what is this, can I try it right now, why should I care. Save the founder story for after traction.

### What success looks like (calibration)

| Scenario | Week 1 visits | Month 1 active | Month 3 active | Month 6 |
|---|---|---|---|---|
| **Best case** (HN top 5 + viral WC cards) | 10,000 / 2,000 tool users | 5,000 / 200 groups | 15,000 / 50 makers | 30,000 / first enterprise inquiry |
| **Likely case** (solid HN + steady Reddit/X) | 3,000 / 500 | 1,500 / 50 groups | 3,000 / 20 makers | 5,000 / enterprise interest |
| **Worst case** (HN flops) | 500 / 50 | 200 / 10 groups | 500 / 5 makers | — |

Even the worst case isn't failure. It's a starting position. React wasn't an instant hit. Tailwind was ignored initially. Svelte took years. The first launch is rarely the breakthrough — but you can't get to launch 3 without doing launch 1.

### The one thing that matters most

The **landing page**. Every link funnels back to `shippie.app`. That page has 3 seconds to hook.

If it's a wall of text explaining architecture, they leave. If it's a tool they can tap and use immediately, they stay. **The landing page IS the product.** Tools running, usable, right now. No signup. No explanation before the experience. Tap a tool. Feel the haptic. See the speed. THEN read about why it works that way. Experience first. Philosophy second.

Test the landing page on 20 people. Watch their faces. **If they don't tap a tool within 5 seconds, the page failed.** Redesign until they do.

---

## Out of scope (explicit deferrals)

These were discussed in the source conversation but are explicitly NOT in this plan:

- **Native iOS/Android wrapping** (Capacitor, Swift, Kotlin). User says: revisit only if PWA validates the product.
- **Apple Health / Google Fit native bridge.** Same reason. Health Snap (screenshot OCR) covers the use case in the browser today.
- **Real-time wearable sync.** Tied to native.
- **Hub-as-launch-asset.** The Hub is its own product story; doesn't belong in the showcase-led launch.
- **Mesh networking for the launch demo.** Live Room already exists; it's a credibility artifact, not the headline.
- **Enterprise pricing or tier.** Not a launch concern.

---

## Suggested sequencing (if you act on this)

| Week | Track 1 (build) | Track 2 (launch prep) |
|---|---|---|
| 1 | Build **Move** (smallest tool, anchors D1-D3) | Pick the launch tool. Polish to perfection. |
| 2 | Build **Rest** + **Meal Log** | Show launch tool to 50 friends. Collect friction reports. |
| 3 | Build the trio's compound-insight card on `/today` | Fix every friction reported. Draft HN post. Set HN-friends call-to-arms. |
| 4 | Build **Health Snap** screenshot OCR | Post on HN (Tue/Wed). Live in comments 24h. |
| 5 | (Watch what users do) | Blog post tied to Thariq's piece. Reddit by community. |
| 6 | (Iterate based on usage) | Twitter thread with video. |
| 7+ | World Cup showcase if not yet shipped | Ride the wave through June 11+. |

---

## Decisions blocked on you

1. **Which tool to lead with on HN?** Move / Meal Log / Coffee / Dough / World Cup. The trio (D1-D3) takes 3 weeks to land cleanly; existing showcases ship today. Pick one.
2. **HN week**: target an early-week launch — pick the calendar week once tool is ready.
3. **World Cup prediction showcase yes/no?** June 11 deadline. ~3 weeks of work. Decide before mid-week.
4. **Who are the 5-10 HN-friends?** Need their handles + screen-recorded usage testimonials.
5. **Landing page review**: who are the 20 testers? Need watch-their-face sessions before launch week.

---

## What this plan doesn't address

- **Why someone keeps using Shippie a week later.** Cross-tool intelligence is the answer, but the trio + Health Snap need to actually ship for the insight surface to be real.
- **Maker onboarding for community-built tools.** The path exists (`/new`); the conversion from "saw a Shippie tool" to "shipped my own Shippie tool" needs its own funnel pass.
- **Press/podcast outreach.** Not a Day-1 concern — wait for the post-HN signal before reaching out.
