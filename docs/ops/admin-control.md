# Admin Control for the Hosted Platform

Open source means people can inspect, fork, and contribute to Shippie. It does not mean they control `shippie.app`.

## Control Boundaries

- **Public repo:** community code, docs, issues, PRs, CI.
- **Private operator repo:** production runbooks, release branches, deploy credentials, internal notes.
- **Cloudflare account:** Workers, D1, R2, KV, queues, secrets, and domains.
- **Database admin role:** controls `/admin` access and moderation actions.

Public PRs should run tests only. Production deploys should happen from maintainer-controlled workflows with private credentials.

## Admin Account

Admin access is controlled by the `users.is_admin` flag.

Use a role email that is safe to appear in operational logs, such as `admin@shippie.app`, rather than a personal inbox.

Example D1 update:

```sql
UPDATE users
SET is_admin = 1
WHERE email = 'admin@shippie.app';
```

Unauthenticated users are redirected to login. Authenticated non-admin users receive a 404, so the admin surface does not confirm its own existence.

## Production Secrets

Never put these in the public repo:

- Cloudflare API tokens,
- D1 database IDs if they are tied to private ops docs,
- R2 credentials,
- OAuth client secrets,
- email provider credentials,
- private webhook signing keys,
- admin seed emails.

Use GitHub Actions secrets or Cloudflare secrets in the private operator repo.

## Release Flow

Recommended hosted release flow:

1. Community PR lands in the public repo after CI and review.
2. Maintainer cherry-picks, merges, or imports the change into the private operator repo.
3. Maintainer runs health checks.
4. Maintainer deploys to Cloudflare.
5. Release notes credit contributors where appropriate.

This keeps Shippie open while preserving a clear production responsibility chain.

## Moderation Flow

Use `/admin` for app visibility, archive, suspension, takedown, and slug reservation. Use `/admin/moderation` for feedback review. Use `/admin/audit` to verify actions later.

When in doubt:

- hide first,
- audit-log the action,
- notify the maker,
- restore once the issue is resolved.
