# `apps/platform/scripts`

One-shot tooling that runs outside the SvelteKit Worker. Build helpers,
deploy helpers, and CI secret rotation reference.

| Script | Purpose |
|---|---|
| `prepare-showcases.mjs` | Builds every `apps/showcase-*` and copies the dists into `static/run/<slug>/`. Wired into the platform `build` script. |
| `prepare-whitepaper.mjs` | Renders `docs/WHITEPAPER.md` into the static whitepaper page. |
| `new-showcase.mjs` | Scaffolds a new showcase from `templates/showcase-template/`. Invoked via `bun run new:showcase <slug>`. |
| `upload-sdk-bundle.mjs` | Builds + uploads `@shippie/sdk` to `https://shippie.app/sdk/v1.latest.js`. |
| `wrap-worker-with-scheduled.mjs` | Wraps the SvelteKit Cloudflare Worker output to expose the cron `scheduled()` handler. |
| `set-secret-from-env.sh` | Reads a key from `.env` and pipes it to `wrangler secret put`. |

## GitHub Actions secrets — `shippie-build.yml`

The build workflow (`.github/workflows/shippie-build.yml`) clones a
maker's repo and uploads the artifact to R2. To support **private**
maker repos it mints a short-lived installation token at workflow run
time via `actions/create-github-app-token@v2`. That action needs two
repo secrets to be set on `theprovider123/shippie`:

| Secret | Value |
|---|---|
| `GH_APP_ID` | The Shippie GitHub App's numeric App ID |
| `GH_APP_PRIVATE_KEY` | The Shippie GitHub App's PEM private key (raw multi-line PEM, including `-----BEGIN/END PRIVATE KEY-----` lines) |

These are the **same credentials** as the wrangler secrets
`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` that the platform Worker
uses, but they must be set separately in GitHub's secret store —
GitHub Actions cannot read Cloudflare wrangler secrets.

### One-time setup

Make sure `gh` is authenticated as someone with admin rights on the
repo, then:

```bash
# Numeric App ID — single line
gh secret set GH_APP_ID -R theprovider123/shippie --body '123456'

# Private key — multi-line PEM via stdin
cat path/to/shippie-app.private-key.pem \
  | gh secret set GH_APP_PRIVATE_KEY -R theprovider123/shippie
```

`gh secret set` reads from stdin when `--body` is omitted, which is the
correct path for multi-line PEM values. Do not paste the PEM into a
shell argument — newlines inside `--body 'xxx'` get mangled.

### Verifying

```bash
gh secret list -R theprovider123/shippie | grep -E 'GH_APP_(ID|PRIVATE_KEY)'
```

Both names should appear with a recent `Updated` timestamp. The values
themselves are never readable back via the API.

### Why two secret stores?

| Need | Stored as | Consumer |
|---|---|---|
| Worker dispatches the workflow + reads installation metadata | `wrangler secret put GITHUB_APP_ID …` on `shippie-platform` | `apps/platform` Worker |
| Workflow mints clone token at runtime | `gh secret set GH_APP_ID …` on `theprovider123/shippie` | `actions/create-github-app-token@v2` step in `shippie-build.yml` |

Both reference the same GitHub App. Rotating the private key requires
updating it in **both** secret stores.

### Public-repo deploys still work

When the platform dispatches a build for a maker who has not installed
the Shippie GitHub App, the `installation_id` workflow input is
empty. The workflow skips the token-mint step (`if: ${{ inputs.installation_id != '' }}`)
and falls back to an anonymous clone — same behaviour as before this
change.
