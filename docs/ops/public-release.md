# Public Release Runbook

This runbook publishes Shippie as open source without handing over production control or personal identity metadata.

## One-Time Setup

1. Create a GitHub organization, recommended: `shippie-app`.
2. Create `shippie-app/shippie` as an empty public repository.
3. Enable GitHub Discussions.
4. Enable private vulnerability reporting.
5. Add branch protection for `main`:
   - require PR review,
   - require CI,
   - block force pushes,
   - restrict who can push to `main`.
6. Do not add production Cloudflare secrets to the public repo.

## Build the Mirror

```bash
bun run public:mirror
```

The mirror is written to `/private/tmp/shippie-public-mirror`. The script:

- copies tracked files from private `HEAD`,
- removes internal launch notes and production deploy workflows,
- rewrites personal/source references,
- scans for risky strings,
- initializes a fresh git history.

## Review Before Pushing

```bash
rg -n "Devante|Providence|devanteprov|theprovider123|582bea|/Users/devante|gmail\\.com" /private/tmp/shippie-public-mirror
git -C /private/tmp/shippie-public-mirror status --short
git -C /private/tmp/shippie-public-mirror log --oneline --format=fuller -1
```

The `rg` command should return nothing. The git log should show the sanitized Shippie author.

## Push

```bash
git -C /private/tmp/shippie-public-mirror remote add origin git@github.com:shippie-app/shippie.git
git -C /private/tmp/shippie-public-mirror push -u origin main
```

## Ongoing Sync

For future public releases:

1. Land production work in the private operator repo.
2. Run tests and deploy as normal.
3. Run `bun run public:mirror`.
4. Push a new sanitized mirror snapshot or open a public PR with the safe subset.

If community PRs land in the public repo, review and import them into the private operator repo before deployment. Public repo merge is not the same as production release.

## What Users and Makers See

- Feature ideas: GitHub Discussions or feature request issues.
- Bugs: GitHub bug reports.
- Code contributions: pull requests.
- Security: private vulnerability reports or `security@shippie.app`.
- Marketplace moderation: Shippie admin and reporting surfaces.
