# Provenance & lineage

Where a tool came from, and how a remix stays honest. The marketplace is
**deploy-neutral** — a tool can arrive many ways — but every tool records how it got
here, and GitHub-sourced tools get the cleanest story.

## Origin model (what's recorded)

| Field | Storage | Meaning |
|---|---|---|
| `source_type` | `apps.source_type` | How it was deployed: `github` · `zip` · `wrapped_url`. |
| `github_repo` / `github_branch` | `apps` | Repo + branch for GitHub-sourced tools. |
| `source_repo` | `app_lineage.source_repo` | Source URL (repo or `tree/<ref>/<path>`). Normalized server-side; http(s) only. |
| `source_commit` | `app_lineage.source_commit` | Exact commit SHA the build came from. Pins a tool to a commit, not just a branch. Optional. |
| `license` | `app_lineage.license` | SPDX id. Required (with source) for remix to be offered. |
| `remix_allowed` | `app_lineage.remix_allowed` | Maker opt-in. |
| `parent_app_id` / `parent_version` | `app_lineage` | Lineage to the app this was remixed from. |
| `template_id` | `app_lineage.template_id` | Origin template, if any. |

These come from the manifest (`source_repo`, `source_commit`, `license`,
`remix_allowed`, `parent_app_id`, …) or the deploy path, resolved in
`resolveLineageValues()` (`apps/platform/src/lib/server/deploy/pipeline.ts`).

## Guarantees

- **Source URLs are sanitized.** Maker-supplied `source_repo` is run through
  `normalizeSourceRepo()` (http(s)-only, credentials/hash/query stripped, GitHub
  `tree/<ref>/<path>` → repo-level fork/clone URLs). Invalid URLs are dropped on
  ingest and refused by remix eligibility — they never render as a link.
- **No self-remix.** A deploy can't set an app as its own parent. Blocked at every
  entry point (`/api/deploy`, github, trial) and backstopped in the pipeline by
  `isSelfRemixLineage(parentAppId, appRow.id)`.
- **Remix preserves lineage.** A remix keeps source, license, attribution, and a link
  to the original; the child is not itself remixable by default (the maker re-opens it).

## The public face

A public app page shows, for any source-linked tool: **Run · View source · License ·
Remix (if allowed) · Original maker (if remixed)**. Non-GitHub tools render the same
page — they just say less about source. This is the honest version of "turn a GitHub
repo into a tool anyone can try": the repo stays the source of truth, Shippie is the
usable, source-linked face.

## Remixing (CLI)

```bash
shippie remix <slug>            # source, license, fork URL, checked target slug, deploy hints
shippie remix <slug> --clone    # clone (sparse-checkout for monorepo paths) + shippie-workspace.json
shippie deploy ./dist --slug <slug>-remix --remix <slug>   # redeploy with lineage preserved
```
