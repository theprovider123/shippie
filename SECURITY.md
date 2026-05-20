# Security Policy

Shippie is a local-first platform, so privacy and safety reports are treated as launch-critical.

## Report Privately

Please do not open public issues for vulnerabilities, credential leaks, auth bypasses, deploy scanner bypasses, or reports containing user data.

Use one of these private channels:

- GitHub private vulnerability reporting on the public repository, when enabled.
- Email `security@shippie.app`.

If neither channel is available, open a minimal public issue that says "security report" without technical details or exploit steps, and a maintainer will arrange a private channel.

## What to Report

- Authentication or admin bypass.
- Marketplace moderation bypass.
- Local Tool policy scanner bypass that enables hidden user-data egress.
- Cross-site scripting, iframe escape, service-worker takeover, or origin confusion.
- Secrets or credentials exposed in code, logs, bundles, deploy reports, or docs.
- Any route that exposes user data, maker data, backups, or audit logs without authorization.
- Supply-chain or package-publishing compromise.

## What Not to Include Publicly

- Real user data.
- Private keys, tokens, or session cookies.
- Exploit payloads that can be copy-pasted against production.
- Personal identity details of users, makers, or maintainers.

## Maintainer Response

Maintainers will acknowledge serious reports, reproduce privately, patch, and disclose once users are protected. Production fixes may ship from the private operator repo before a public PR appears.

## Supported Versions

The hosted service at `shippie.app` and the latest `main` branch are supported. Historical public snapshots are not guaranteed to receive patches.
