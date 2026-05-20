# Contributor Recognition

Contributor recognition should reward useful work without turning Shippie into a points game.

## Badge Idea

Shippie can show a **Contributor** badge on a maker profile when a person has one of:

- a merged public PR,
- an accepted bug report that led to a fix,
- an accepted feature idea that shipped,
- a template or local tool accepted into the showcase slate,
- a meaningful docs or translation contribution.

Future badges can be more specific:

- **Local Tool Builder** — shipped a marketplace-eligible local tool.
- **Scanner Helper** — improved Local Tool policy detection.
- **Docs Friend** — improved public docs or starter guides.
- **Launch Tester** — contributed verified device/browser feedback.

## What Badges Mean

Badges mean contribution history and gratitude. They do not grant:

- admin access,
- moderation authority,
- production deploy access,
- marketplace ranking guarantees,
- payment, equity, or commercial rights.

## Implementation Shape

Keep the first version manual:

1. Maintainer records the contribution in a profile field or badge table.
2. Profile page renders the badge.
3. Release notes list notable contributors.
4. The admin surface can revoke badges for spam, abuse, or mistaken attribution.

Automated GitHub syncing can come later. Manual first is safer because the project is small and moderation quality matters more than badge automation.
