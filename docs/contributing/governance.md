# Shippie Governance

Shippie is open source, but the hosted platform is moderated by maintainers.

## Project Roles

- **Users** try tools, report bugs, request features, and flag unsafe listings.
- **Makers** build and submit local tools, templates, docs, SDK examples, and fixes.
- **Contributors** submit accepted issues, docs changes, or pull requests.
- **Maintainers** review PRs, cut releases, moderate the marketplace, manage security reports, and control production deploys.
- **Admins** are production operators with access to `/admin`, Cloudflare resources, moderation queues, and audit logs.

One person can hold more than one role, but roles do not automatically grant each other. A contributor badge does not grant moderation or deploy authority.

## Contribution Intake

Use GitHub for public project work:

- **Discussions:** ideas, tool proposals, rough feedback, roadmap debate.
- **Issues:** reproducible bugs, feature requests, docs gaps, launch blockers.
- **Pull requests:** code, docs, tests, examples, templates, scripts.
- **Security reports:** private vulnerability reporting or `security@shippie.app`.

Use Shippie itself for marketplace work:

- app feedback,
- app reports,
- maker deploys,
- app visibility or takedown appeals.

## Decision Model

Maintainers optimize for the Shippie promise:

> Local tools that keep user data visible, local-first by default, installable, and useful without accounts.

PRs are accepted when they improve the product, preserve the Local Tool policy, and are maintainable. Maintainers may decline good ideas when they expand scope, weaken privacy guarantees, or make the hosted platform harder to moderate.

## Production Release Model

The public repository is a contribution surface. It is not the production control plane.

Production deploys require:

- maintainer approval,
- passing tests and scanner checks,
- private Cloudflare credentials,
- admin review when the change touches moderation, marketplace eligibility, auth, deploy scanning, or user data.

Public pull requests never receive production secrets and never auto-deploy to `shippie.app`.

## Marketplace Moderation

Shippie can be open without being unmoderated. Maintainers can:

- hide or suspend unsafe apps,
- reserve abusive slugs,
- require conversion from hosted/cloud patterns to local-tool primitives,
- remove spam, trackers, deceptive listings, or policy-violating content,
- maintain Labs for experimental tools that are not launch-surface eligible.

All admin writes should be audit logged.

## Maintainer Expansion

New maintainers should start with a narrow area:

- docs,
- SDK/CLI,
- showcase templates,
- scanner rules,
- marketplace moderation review.

Admin access and production deploy access are granted separately, only after trust is established.
