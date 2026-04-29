# Launch Sequence

This is the public launch runbook. It assumes the real-device checklist has
passed, the SignalRoom production smoke is green, and the final two-minute demo
cut exists.

## Assets to Prepare

- `docs/WHITEPAPER.md` published as a readable web page.
- `docs/architecture.svg` exported as a PNG for social posts.
- Two-minute master demo from `docs/launch/c2-demo-storyboard.md`.
- Two 60-second clips:
  - Live Room buzzer fairness on two phones.
  - Container app switching + Your Data + cross-app intent moment.
- One 15-second clip:
  - "Deploy in under 60 seconds" from CLI/MCP to live URL.
- Public repo README with:
  - what Shippie is
  - what is open source
  - how to run locally
  - where help is wanted
- A short support page for launch-day questions:
  - "Does this replace the internet?"
  - "Where is my data?"
  - "Can makers use custom domains?"
  - "What is Local / Connected / Cloud?"

## Day 1 — Hacker News + Repo

Goal: technical credibility.

Post:

> Show HN: Shippie — an open-source local-first app platform

Lead with the concrete demo, not the whole philosophy:

- Deploy a normal web app.
- It gets classified, wrapped, installable, and proof-instrumented.
- User data lives on-device.
- The installed Shippie container becomes the app universe.
- Hub/self-hosting is the path to local venues and schools.

Links:

- Demo video.
- Whitepaper.
- Architecture diagram.
- GitHub repo.
- A live showcase app.

## Day 2 — Live Room Clip

Goal: visceral proof.

Post the two-phone buzzer fairness clip with measured latency. Use exact numbers
from D1 `room_audit`; do not round into a claim the system has not earned.

Message:

> Two phones. One room. First buzzer wins by local timestamp, not server luck.
> This is a PWA.

Reply thread:

- Explain `SignalRoom` only coordinates the handshake/event fan-out.
- Explain where data lives.
- Link to the relevant package/code.

## Day 3 — Privacy + Self-Hosting

Goal: ethos alignment.

Places:

- `r/privacy`
- `r/selfhosted`
- Indie web/local-first communities

Message:

- "Apps should not need accounts by default."
- "Your phone can be the database."
- "Shippie is hosted for convenience, but the Hub path keeps the self-hosted
  future open."

Do not oversell federation or gossip relay. Mention them as long-arc research,
not launch features.

## Day 4 — Product Hunt

Goal: broader maker attention.

Lead with the product:

- One place to deploy app experiments.
- One installed Shippie app for users.
- Security/privacy/kind reports make deploys understandable.
- Free for makers because local-first economics make it possible.

Assets:

- Container home screenshot.
- `/new` deploy console screenshot.
- Trust/deploy report screenshot.
- Live Room clip.

## Day 5 — AI Builder Communities

Goal: capture the "I built this in Claude/Cursor, now what?" crowd.

Places:

- Claude Code Discord / forums
- Cursor community
- Local-first Discord/Slack groups
- Indie Hackers

Message:

- MCP + CLI are the maker multiplier.
- Shippie gives AI-built apps a real home: URL, container, package, proof,
  local data, and a marketplace.
- Claude should scaffold `shippie.local.db` instead of defaulting to cloud
  databases for simple personal apps.

## Launch-Day Rules

- Use measured claims only.
- If something is Cloud or Connected, call it that.
- Do not promise Localize as universal magic.
- Lead with demos, then explain architecture.
- Every technical claim should link to code or a report artifact.
- Invite contributors by naming concrete hard problems.

## Follow-Up Queue

- Convert the best launch questions into docs.
- Tag issues as `good-first-local`, `protocol`, `hub`, `container`, or
  `proof`.
- Capture every external bug report into the feedback inbox or GitHub issues.
- Publish a "what we learned in week one" post with real metrics and mistakes.
