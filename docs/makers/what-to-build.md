# What to build on Shippie

Shippie is for local tools: small apps that run quickly, keep primary user data on the device, work offline where it matters, and can be shared before a backend or app-store pipeline exists.

## Strong fits

Personal utilities:

- Trackers, journals, planners, checklists, calculators, workout logs, recipes, budgets, decision tools.

Event and group apps:

- Sweepstake games, match-day tools, classroom utilities, venue tools, wedding/weekend planners, shared checklists, private-room companions.

Creative and AI tools:

- Local transcription, image sorting, writing helpers, prompt toys, moodboards, lightweight editors, capture tools.

Games:

- Daily puzzles, async challenges, party games, local scoreboards, offline-first loops with optional sync.

## The Shippie advantage

A good Shippie app usually has:

- A clear first action in ten seconds.
- A reason to share one link with one specific person.
- Offline value.
- Local data the user can inspect, export, or clear.
- App-specific share cards and metadata.
- Feedback close to the user moment.

## Usually not a fit

Keep these on a cloud platform unless you are building a companion or prototype:

- Account-based SaaS where the central database is the product.
- Payment-heavy workflows.
- Enterprise admin tools with complex RBAC.
- Social networks whose value depends on a shared server graph.
- Apps that require hidden server secrets for the core loop.

## URL rule

Use `https://shippie.app/<slug>` in user-facing copy, QR codes, share cards, README badges, and tester invites.

Other URLs are infrastructure:

- `/apps/<slug>` is the detail and trust page.
- `/maker/apps/<slug>` is the maker dashboard.
- `/run/<slug>` is the runtime compatibility path.
- `<slug>.shippie.app` may exist as a technical app origin or legacy entry point.

## Default process

```text
classify -> localize -> build -> deploy unlisted -> test on phone -> gather feedback -> promote
```

Public discovery is a launch decision, not the default deploy state.
