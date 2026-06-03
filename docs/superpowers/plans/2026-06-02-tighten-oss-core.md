# Tighten Shippie's Open-Source Core (2026-06-02)

> **Thesis.** Before Shippie can claim "we give GitHub repos a usable face," Shippie's
> *own* GitHub has to be current, understandable, and buildable by a stranger. This plan
> adds **no product features**. It makes the existing core *true, legible, and credible*.
>
> **Framing (locked by user):** Shippie is an **open marketplace for tools**. GitHub is
> one of the best **source/provenance** connections into it — not a requirement, not a
> dependency. A tool can come from CLI, zip/upload, a local folder, a GitHub repo, a
> remix, or a trial. When it comes from GitHub, Shippie makes that repo usable,
> trustworthy, and remixable.

## Public copy (the north star)

- Marketplace line: **"An open marketplace for tools you can run, trust, and remix."**
- GitHub line: **"Turn a GitHub repo into a tool anyone can try."**
- Maker line: **"Deploy from code, upload, or remix. Shippie gives it a usable home."**

Avoid "GitHub has no face" in public copy — strong internal framing, combative externally.

---

## Repo-state diagnosis (verified at HEAD, 2026-06-02)

| Fact | Source | Implication |
|---|---|---|
| **255 commits ahead of `origin/main`**; last public push 2026-05-20 | `git rev-list` | Biggest credibility gap. The visible repo isn't the product. |
| Active branch also ~63 commits ahead of its own remote | user spot-check | Drift compounds; needs a curated reconcile, not a dump. |
| README = 68 lines | `wc -l` | Thin front door. |
| Meta scaffolding present: LICENSE (AGPL-3.0), CONTRIBUTING, SECURITY, CODE_OF_CONDUCT | `ls` | Good — don't re-create, just strengthen README. |
| 18/38 packages export `dist/`; CLAUDE.md says internal packages expose `src` | `grep` | Partial migration. Fix **only where it's wrong** (see Phase 5). |
| 34/38 packages `private:true` | `grep` | NOT "closed source." Means "not npm-published." Real gap = the repo never says which parts are core/internal/app/publishable. |

### Provenance model — what already exists vs. net-new

The user's origin model (`source_repo`, `source_commit`, `license`, `remix_allowed`,
`deployed_via`) is **almost entirely already in the schema**. This is a *surfacing* job.

| Field | Status at HEAD |
|---|---|
| `deployed_via` | ✅ `apps.sourceType` = `'github' \| 'zip' \| 'wrapped_url'` |
| `source_repo` | ✅ `apps.githubRepo` + `appLineage.sourceRepo` |
| branch | ✅ `apps.githubBranch` (default `main`) |
| `license` | ✅ `appLineage.license` |
| `remix_allowed` | ✅ `appLineage.remixAllowed` |
| lineage (parent/version/template) | ✅ `appLineage.parentAppId / parentVersion / templateId` |
| **`source_commit` (git SHA)** | ❌ **net-new** — github deploy pins a *branch*, not a commit. The one column worth adding. |

Minor drift to tighten: `apps.sourceType` comment says `'github' | 'zip'` but `wrap.ts`
writes `'wrapped_url'`. Document the closed set.

---

## The plan (sequenced)

### Phase 1 — Make the repo true *(unblock; nothing else counts until this)*
- [ ] Reconcile the 255-commit gap via a **curated, reviewable merge** to `origin/main` — not a bulk dump.
- [ ] Precondition: get the 144-file working tree to a clean, intentional, committed state. The verified **remix v1 slice** is the cleanest first commit. Beware concurrent-codex `git clean` on the shared branch (build the reconcile on an isolated branch).
- [ ] **User executes the push** (commits to main need explicit authorization). I stage + sequence.

### Phase 2 — Make it buildable by a stranger *(the OSS on-ramp)*
- [ ] Clean-checkout test from the public branch: clone → `bun install` → `bun run db:migrate:local` → `bun run health` (typecheck + test + build) green.
- [ ] Fix the documented first-run gotchas that break a fresh checkout (`/apps` 500 until migrate; orphan baked showcase dirs; stale `new:showcase`).
- [ ] Document the exact path in README + `docs/self-hosting.md` (verify the 224-line self-host doc against HEAD).

### Phase 3 — Rewrite the README *(Shippie's own "face")*
Answer, in order: What is Shippie? · What problem? · **Try a live tool** · **Deploy your own** (CLI / upload / GitHub / remix — show it's plural) · How the local-first runtime works · What's open source here · Where are the specs.

### Phase 4 — Define the open core *(label, don't delete)*
Make the boundary explicit in README + a `docs/` map. Five buckets:
1. **Open-source core** — `shippie.json` manifest, intent catalog, `local-runtime-contract`, `app-package-contract`, CLI/remix/deploy flow, SDK/runtime surface.
2. **Internal platform code** — `apps/platform` server, deploy pipeline, etc.
3. **Private/user apps** — sensitive showcases can stay private; *not* part of the OSS identity.
4. **Publishable packages** — `sdk`, `cli`, `mcp-server`, and the contracts.
5. **Examples/showcases** — curated first-party demos.

`private:true` on internal packages/apps is **fine and stays**. The fix is the *labelling*, not publishing everything.

### Phase 5 — Clean package export drift *(only where wrong)*
- [ ] Apply the `src`-export rule to **internal workspace packages** (the tsup-race fix from CLAUDE.md).
- [ ] **Keep `dist` where a package is published or executed as a binary** (CLI, SDK, MCP may legitimately need built output). Audit the 18 case-by-case; don't blanket-rewrite.

### Phase 6 — Document the contracts *(the durable "standards" move — doc only)*
Publish readable, **versioned** specs for what already exists. No new code, no "fighting Microsoft" framing:
- [ ] `shippie.json` manifest
- [ ] intent catalog
- [ ] runtime permissions
- [ ] remix / source lineage
- [ ] local / offline guarantees

### Phase 7 — Make provenance legible *(surface what exists; one small add)*
- [ ] Public app page: for any source-linked tool show **Run · View source · License · Remix (if allowed) · Original maker (if remixed)**. Non-GitHub tools still render — they just say less about source. (Source + License/remix already render; round it out + add the `sourceType` badge.)
- [ ] Document `sourceType` as a closed set; reconcile the `wrapped_url` drift.
- [ ] **Net-new (small):** capture `source_commit` (git SHA) on github deploy + store on lineage, so a tool pins to an exact commit, not just a branch. One optional column + one capture site.

### Phase 8 — Package the GitHub use case *(content funnel, not a system)*
- [ ] README snippet pattern makers can paste: `[Try on Shippie](…/run/x)` · `[Remix on Shippie](…/new?remix=x)` · `[Source](github.com/owner/repo)`.
- [ ] A single "GitHub repo → Shippie tool" guide.
- [ ] Graduate to a real "Deploy to Shippie" button **only if pulled** — the remix/deploy plumbing already exists (remix v1).

---

## Explicitly NOT now
- No Shippie-as-GitHub-replacement framing.
- No social-graph profiles, GitHub Actions integration, PR-preview deploys, MCP agent workflows, or AI "regenerate this app" — all deferred until the core is true.
- **No risky pre-launch package deletion.** Audit + remove only obvious dead/orphaned items (e.g. `showcase-kit` vs `showcase-kit-v2`); defer broad surgery.

## Sequencing
`1 → 2 → 3` strictly ordered (can't document a build that doesn't reproduce; can't
reproduce from a stale repo). `4–7` parallelize after 2. `8` is content, anytime after 3.
Whole plan is consolidation — zero new product mental-models.

## One-liner
**GitHub shows the code. Shippie lets people use the thing.** Tighten the repo until that's obviously true.
