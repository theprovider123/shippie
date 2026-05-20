# Identity Protection for Public Launch

Do not publish the private operator repository directly if personal identity protection matters. The private repo history contains personal commit metadata, local paths, internal launch notes, and operational references that are not needed for public contribution.

## Public Identity Model

Use public-facing project identities:

- GitHub organization: `shippie-app`
- Public repo: `shippie-app/shippie`
- Commit author for public mirror: `Shippie <dev@shippie.app>`
- Security contact: `security@shippie.app`
- Admin/operator inbox: `admin@shippie.app`

Avoid using personal emails, personal GitHub usernames, private local paths, or founder names in public release artifacts unless you intentionally want them public.

## Public Mirror Rule

The public repo should be a sanitized snapshot with fresh git history, not a force-pushed copy of the private repo.

Run:

```bash
bun run public:mirror
```

The script writes a clean mirror to `/private/tmp/shippie-public-mirror`, removes private docs and deploy workflows, rewrites public source links to `shippie-app/shippie`, scans for risky identity strings, and initializes a fresh git repo.

After creating the GitHub organization and repository, push the mirror:

```bash
git -C /private/tmp/shippie-public-mirror remote add origin git@github.com:shippie-app/shippie.git
git -C /private/tmp/shippie-public-mirror push -u origin main
```

## Keep Private

- Internal launch plans.
- Personal working notes.
- Private agent context.
- Cloudflare account IDs in runbooks.
- Admin seed emails.
- Any `.env`, `.dev.vars`, local database snapshots, or generated logs.
- Screenshots or assets that reveal personal device state.

## Rotate If Needed

If the private repo or a non-sanitized archive has ever been public, rotate:

- Cloudflare API tokens,
- OAuth secrets,
- webhook secrets,
- email sending secrets,
- any token that appeared in logs or copied deploy reports.

Cloudflare account IDs are not secret by themselves, but keeping them out of the public repo reduces correlation and support-scam surface.
