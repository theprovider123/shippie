# `plan-handoff` skill — design spec

**Date:** 2026-05-05
**Author:** Brainstormed with Opus 4.7
**Implementation target:** `~/.claude/skills/plan-handoff/SKILL.md` (global, cross-project)
**Status:** ready for implementation plan

---

## Goal

A user-level slash-command skill that bridges the Opus → Sonnet handoff pattern: Opus stages a plan, Sonnet picks it up, re-verifies against HEAD, executes, and writes back to the project's plan file + Obsidian session log + memory (when warranted). The skill closes three concrete gaps in the existing `superpowers:writing-plans` + `superpowers:executing-plans` workflow:

1. No model-aware handoff metadata travels with the plan today (constraints, source-of-truth files, stop points).
2. No HEAD-verify gate before execution — plan reviews already drift in real working sessions.
3. No automatic writeback to Obsidian / memory — execution outcomes live only in `git log` until manually surfaced.

The skill itself is a thin layer that **invokes** the existing superpowers skills rather than reimplementing them.

---

## Locked design decisions

These were settled in brainstorming Q&A before this spec was written:

| Decision | Choice |
|---|---|
| Scope | Global — `~/.claude/skills/plan-handoff/`, works across every project |
| Writeback ambition | Plan file + project session log + memory (memory writeback discriminated by lesson criteria) |
| Sonnet's re-review depth | HEAD-verify + critical pass (inherits `executing-plans` critical-pass behavior) |
| Blocker behavior | Stop + escalate, always (inherits `executing-plans` stop-on-blocker rule) |
| Invocation pattern | One slash command, auto-detects mode based on plan state |
| Subagent integration | Inline via `superpowers:executing-plans` (no subagents on top of model handoff) |
| Skill structure | Approach 1 — single `SKILL.md`, monolithic |

---

## 1. Architecture

**Files:**
- `~/.claude/skills/plan-handoff/SKILL.md` — only file. Frontmatter declares the skill, body contains mode detection + stage flow + execute flow + writeback contract. ~250 lines target.

**Slash command:** `/plan-handoff <slug>`

**Plan-file resolution** (in order):
1. If `<repo>/docs/superpowers/plans/*<slug>*.md` matches one file → use it (repo-level, travels with codebase, visible to Codex / future sessions)
2. Else if `~/.claude/plans/<slug>.md` exists → use it (personal scratch, cross-project, doesn't pollute repo)
3. Else if invoked in stage mode and we're in a git repo with `docs/superpowers/plans/` → create at `<repo>/docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md`
4. Else if invoked in stage mode and not in a tracked plans dir → create at `~/.claude/plans/<slug>.md`
5. Else (execute mode, no file found) → error: "no plan named `<slug>`"

**Dependencies on existing skills:**
- Stage mode references `superpowers:writing-plans` for plan-body conventions (header, task structure, no-placeholders rule, exact paths). The handoff skill validates the produced body against the placeholder checklist before writing — does not re-implement the writing rules.
- Execute mode invokes `superpowers:executing-plans` (via Skill tool) for the actual task-by-task run. The handoff skill wraps it with HEAD-verify (before) + writeback (after).

**Why no per-mode helper files:** Modes share three concerns (file resolution, status-footer parsing, writeback target detection). Splitting forces those into a third place. Keeping it monolithic means one place to read; revisit if SKILL.md grows past ~300 lines.

---

## 2. Plan file format

The plan file is the artifact that travels between models. It extends the standard `superpowers:writing-plans` output with three handoff-specific blocks: a **metadata header** (consumed by Sonnet at execute time), a **status footer** (used for mode detection), and an **execution log** (written by Sonnet after run).

### Pre-execution shape (Opus stages)

```markdown
# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the `plan-handoff` skill
> (slash command `/plan-handoff <slug>`) — it wraps superpowers:executing-plans
> with HEAD-verify + writeback.

**Goal:** [one sentence]

**Architecture:** [2-3 sentences]

**Tech Stack:** [key libs]

---

## Plan-handoff metadata

**Staged by:** Opus 4.7 · 2026-05-05 19:42 · session <conversation-summary>

**Source-of-truth files** (re-read at execute time to detect drift):
- `apps/platform/src/lib/container/intent-registry.ts:1-150`
- `packages/sdk/package.json` (exports block)

**Constraints / invariants** (the things Opus held in mind that don't show up in
the per-task code blocks):
- e.g. "tokens.css imports are framework-neutral CSS — don't switch to Tailwind"
- e.g. "wa-sqlite WASM dedup depends on local-db's locateWasm override"

**Stop points** (Sonnet pauses here for user gut-check before continuing):
- After Phase 2 (consolidation done)
- After Phase 4 (calculators live)

**Verification per phase:**
- Phase 1: `bun run typecheck --filter=@shippie/design-tokens`
- Phase 2: `wrangler d1 execute --command "SELECT slug, is_archived FROM apps WHERE slug IN (...)"`

**Success criteria:**
- All 14 showcases pass the 10-item Shippie-Native checklist ≥9/10

---

## Status: ready-for-execution

### Task 1: <name>
[standard writing-plans bite-sized-step task body — files, test code, run
commands, expected output, commit]

### Task 2: <name>
...
```

### Post-execution (Sonnet appends)

```markdown
---

## Execution log

- **HEAD-verify (2026-05-05 21:02):** clean — all source-of-truth files
  match plan's stated state.
- **Critical pass:** no concerns raised. Proceeding.
- Phase 1 → commit `0b53298` (21:08) ✓
- Phase 2 → commits `088a788` + `5ff048f` + `1b6ed4b` + `3cb4bb8` + `03b428b` (21:34) ✓
  - Note: plan said next migration was 0023 — verified `wrangler d1 migrations list` shows 0022 latest, applied as 0023.
- (— stop point reached, user confirmed continue —)
- Phase 3 → commits `014e459` + ... (22:12) ✓

**Net:** +N files, -M lines, K tests added. Health green at every commit boundary.
**Phases completed:** N of N. **Stop points hit:** N (all confirmed by user).

## Status: completed
**Executed by:** Sonnet 4.6 · 2026-05-05 23:18
```

### Mode-detection rule

| Plan-file state | Mode |
|---|---|
| No file at resolved path | stage |
| File exists, footer is `## Status: ready-for-execution` | execute |
| File exists, footer is `## Status: completed` | already-done; report and exit |
| File has partial `## Execution log` entries but `## Status: ready-for-execution` still present | resume (pick up after the last logged phase) |
| File exists, no status footer | malformed; report and exit |

---

## 3. Stage flow (Opus side)

When Opus invokes `/plan-handoff <slug>` and the plan file does **not** exist (or has no status footer):

1. **Pre-flight checks**
   - Detect current model. If Sonnet, warn ("you're using Sonnet quota for the planning step") but proceed if user confirms.
   - Resolve the plan file path (per Section 1's resolver). For repo-level paths, auto-prefix the date.

2. **Gather plan content** — three sources, in priority order:
   - Conversation context (Opus has just designed a plan in chat) — most common
   - Existing draft file the user points at via `--from <path>`
   - Text prompt: "no plan in context — paste it or describe it"

3. **Apply `superpowers:writing-plans` rules** to the body:
   - Standard header (Goal, Architecture, Tech Stack)
   - Bite-sized tasks (2-5 min each), exact file paths, code blocks for code steps, exact commands with expected output
   - **No-placeholders sweep** — fail if "TBD", "TODO", "implement later", "add appropriate validation", "similar to Task N" appears
   - The handoff skill **does not re-implement these rules**. It loads `superpowers:writing-plans/SKILL.md` as a reference and validates the produced plan against the placeholder checklist before writing.

4. **Generate the handoff metadata block** by introspecting the conversation:
   - **Source-of-truth files** — files Opus read or cited during planning
   - **Constraints / invariants** — non-obvious decisions Opus made; the skill prompts Opus explicitly: "what did you hold in mind during planning that wouldn't be obvious from the per-task code?"
   - **Stop points** — phase boundaries where Sonnet should pause
   - **Verification commands** per phase
   - **Success criteria**

5. **Write the file** with body + metadata block + `## Status: ready-for-execution` footer.

6. **Don't auto-commit.** Per CLAUDE.md, commits to main need explicit authorization. The skill writes the file and reports:

   ```
   Plan staged at docs/superpowers/plans/2026-05-05-foo.md.

   Next steps:
     1. (optional) git add + commit the plan file so it travels with the repo
     2. /model sonnet
     3. /plan-handoff foo  → enters execute mode, runs HEAD-verify + critical pass
   ```

### Stage-mode error cases

| Condition | Behavior |
|---|---|
| Plan body fails placeholder sweep | Surface failing patterns with line context. Don't write the file. Ask Opus to repair. |
| Sonnet invoked stage mode | Warn ("Sonnet quota on planning") but proceed if user confirms |
| No plan content in conversation AND no `--from <path>` | Prompt: "no plan found — describe the plan or pass `--from <path>`" |
| File already exists with `ready-for-execution` | Refuse without `--re-stage` |
| File already exists with `completed` | Refuse without `--re-stage` |
| Filesystem write fails | Surface OS error; don't half-write the file |

---

## 4. Execute flow (Sonnet side)

When Sonnet invokes `/plan-handoff <slug>` and the plan file exists with `## Status: ready-for-execution`:

1. **Pre-flight checks**
   - Detect current model. If Opus, warn ("you're spending Opus quota on execution") but proceed if user confirms.
   - Resolve the plan file. Read it. Parse the metadata block.

2. **HEAD-verify** (the net-new step the handoff skill adds)
   - Read every file listed in the metadata's "Source-of-truth files" block.
   - For each: compare the current state to what the plan asserted.
   - If drift detected, append `## Drift detected (<timestamp>) — paused` block listing specific drifts. Status stays `ready-for-execution`. Tell user: "the plan's assumptions don't match HEAD — re-stage with Opus, or override via `--proceed-despite-drift`."
   - If clean → log `**HEAD-verify (<timestamp>):** clean — all source-of-truth files match` to the execution-log block and continue.

3. **Critical pass** (inherited from `superpowers:executing-plans` Step 1)
   - Read the plan critically. Identify any questions or concerns about the plan.
   - If concerns → raise them with user, stop. Same drift-pause shape.
   - If no concerns → log `**Critical pass:** no concerns raised` and continue.

4. **Execute task-by-task** via `superpowers:executing-plans`
   - The handoff skill explicitly invokes `executing-plans` via the Skill tool rather than reimplementing the loop.
   - After each task / phase: append `Phase N → commit <hash> (<timestamp>) ✓` to the execution-log block. If a note belongs (small surprise, off-by-one fix, parallel-thread already-shipped-this), inline it as a sub-bullet.
   - At each stop point: pause and ask user "stop point reached after Phase N — continue?" Wait for explicit confirm.

5. **Stop on blocker** (inherits `executing-plans` rule)
   - Verification fails / file missing / instruction unclear / verification fails repeatedly → stop, append `## Blocker (<timestamp>)` to plan, escalate to user. Don't guess.

6. **Resume mode** (file exists, has partial execution log, status still `ready-for-execution`)
   - Skip already-logged phases. Pick up at the next un-logged phase. Still does HEAD-verify and critical pass before resuming (HEAD may have drifted since the last partial run).

7. **On clean completion**
   - Append `## Status: completed` + `**Executed by:** Sonnet 4.6 · <timestamp>` footer to plan.
   - Trigger writeback (Section 5).

### Execute-mode error cases

| Condition | Behavior |
|---|---|
| File doesn't exist | "no plan named `<slug>` — did you `/plan-handoff` from Opus first?" |
| Status footer is `completed` | "plan already executed at <timestamp> — see execution log" |
| File exists, no status footer | "malformed plan — re-stage from Opus" |
| HEAD-verify drift on any source-of-truth file | Append drift block, pause; user re-stages or `--proceed-despite-drift` overrides |
| Source-of-truth file no longer exists at cited path | Treat as drift |
| Critical pass surfaces concerns | Append concerns to plan, pause, ask user |
| Verification command fails per-phase | Stop, append blocker block |
| Step's expected output doesn't match | Stop, append blocker block |
| Required dependency missing | Stop, append blocker block |
| Opus invoked execute mode | Warn but proceed if user confirms |
| User aborts at stop point | Status stays `ready-for-execution`. Re-running picks up via resume mode. |
| Mid-execution crash | Plan keeps partial state. Resume mode picks up at the next un-logged phase. |

---

## 5. Writeback contract

After Sonnet completes execution cleanly, three writebacks fire in order. Each is **conditional on its target infrastructure existing** — missing infrastructure means skip, never error.

### Writeback 1 — Plan file (always fires)

The plan file already has per-phase commit hashes appended during the execute loop. Final writeback adds:

```markdown
**Net:** +N files, -M lines, K tests added. Health green at every commit boundary.
**Phases completed:** N of N. **Stop points hit:** N (all confirmed by user).

## Status: completed
**Executed by:** Sonnet 4.6 · 2026-05-05 23:18 · session <conversation-summary>
```

### Writeback 2 — Project session log (conditional)

**Trigger:** `~/Documents/Obsidian/life/projects/<name>/` directory exists, where `<name>` resolves from current cwd via:

| cwd basename | project name |
|---|---|
| `Shippie` | `shippie` |
| `Urthly` | `urthly` |
| `Chiwit` | `chiwit` |
| `Palate` | `palate` |
| `Orc` | `loop` |
| `ClassroomX` | `classroomx` |
| `mevrouw` | `mevrouw` |
| (other) | lowercased basename |

If the directory doesn't exist → skip silently.

**Append** to `<name>/sessions/<YYYY-MM-DD>.md` (creating if missing). If a session entry for today already exists, append a new sub-section:

```markdown
---

## /plan-handoff — <slug> (HH:MM)

**Plan:** [[projects/<name>/plans/<filename>|<slug>]] (or repo path if not in vault)
**Phases:** N/N ✓
**Commits:** `abc1234`, `def5678`, ...
**Net:** +N files, -M lines, K tests added.

(any notes / surprises from the execution log)
```

### Writeback 3 — Memory (conditional + discriminated)

**Trigger:** `~/.claude/projects/<cwd-encoded>/memory/` directory exists AND a non-obvious lesson surfaced during execution.

**Lesson qualification criteria** (need at least one):
- A constraint that bit during execution that wasn't in the plan
- A verification command caught real drift (HEAD-verify drift, mid-execution surprise)
- A fix took materially longer than the plan claimed (≥2x estimated effort)
- A surprise about how the codebase behaves (e.g., gitignored build artifact masquerading as source)

**Disqualifications** (skip even if surfaced):
- "I executed phase 3" → that's session log
- Per-commit hashes → that's plan file
- Routine completion → that's nothing

**Format:** Sonnet asks itself at end of execution: "did anything non-obvious happen?" If yes, write a `feedback`-type memory entry following existing memory-file shape:

```markdown
---
name: <one-line title>
description: <one-line description for relevance matching>
type: feedback
---

<rule / fact, lead-with>

**Why:** <what bit during execution>
**How to apply:** <when this guidance kicks in>
```

Add a one-line entry to the project's `MEMORY.md` index pointing at the new file.

### Order + atomicity

Plan-file writeback runs first (source of truth). Session-log writeback second (idempotent, append-only). Memory writeback last and conditional (most surface area for failure).

If any writeback fails, the others have already succeeded — the plan file at minimum is always updated. The skill reports: "execute complete; session log written; memory writeback skipped (no qualifying lesson surfaced)."

### Writeback error cases

| Condition | Behavior |
|---|---|
| Session log directory doesn't exist | Skip silently. Report "session log writeback skipped (no `~/Documents/Obsidian/life/projects/<name>/`)." |
| Memory directory doesn't exist | Skip silently. Report "memory writeback skipped." |
| No qualifying lesson surfaced | Skip memory writeback. Report "memory writeback skipped (no qualifying lesson)." |
| Plan-file writeback fails | Fatal. Surface error; user re-runs after fixing. |
| Session-log file write fails | Surface, but plan-file writeback already succeeded — execution itself is not lost. |

---

## 6. Out-of-scope (explicitly NOT handled)

- Concurrent invocations of execute mode on the same plan in two terminals → undefined behavior, document as user error
- Auto-commit of staged plans → never happens (CLAUDE.md rule)
- Auto-rollback on failed execution → not a goal; the plan file's execution log + git's commit log are the audit trail
- Plan-format migration when the skill itself updates → if metadata block format changes, plans staged under the old format may not execute cleanly under the new skill version
- Subagent-driven execution → out of scope for v1; user can invoke `superpowers:subagent-driven-development` directly if they want
- Multi-day stale plans → resume mode handles partial mid-execute crashes; "stale plan" is just a special case
- Long-running plans (>10 phases) → smoke target is 2 tasks; trust `executing-plans` track record for longer plans

---

## 7. Testing

Skills don't have formal test scaffolds. Testing is a **manual smoke playbook + targeted error-path checks** that the user runs once after the skill ships, then re-runs whenever the SKILL.md changes substantially.

### Smoke playbook (happy path)

Target: a throwaway 2-task plan that stage → execute → writeback can clear in <2 minutes. Minimal real-world side effects.

1. **From an Opus session in any cwd**, paste this into chat:
   > "Plan: create `/tmp/handoff-smoke.txt` with text 'hello' (Task 1). Verify with `cat /tmp/handoff-smoke.txt` showing `hello` (Task 2)."
2. Run `/plan-handoff smoke-test-<date>`.
3. **Verify**: file written at `<repo>/docs/superpowers/plans/<date>-smoke-test-<date>.md` (or `~/.claude/plans/` if no repo). Open it: should have metadata block + `## Status: ready-for-execution` footer.
4. `/model sonnet`.
5. Run `/plan-handoff smoke-test-<date>` again.
6. **Verify**: HEAD-verify ran (logged in execution-log block). Critical pass logged. Both tasks executed. `## Status: completed` appended. Session log got a `## /plan-handoff — smoke-test-<date>` block.
7. Cleanup: `rm /tmp/handoff-smoke.txt`. Optional: delete the plan file.

### Targeted error-path checks

Run after the happy path passes. Each is a 30-60 second probe.

| Probe | Expected behavior |
|---|---|
| Stage with `"TODO: figure out task 2"` in plan content | Skill rejects with placeholder-pattern callout |
| Stage when plan file already exists with `ready-for-execution` | Skill rejects, suggests `--re-stage` |
| Execute with no plan file | Skill errors helpfully |
| Execute with HEAD drift simulated (manually edit one source-of-truth file before executing) | Skill pauses, appends drift block, status stays `ready-for-execution` |
| Execute with `## Status: completed` | Skill reports already-done, no-op |
| Execute mid-blocker (force a fake verification failure) | Skill stops, appends blocker block, exits cleanly |
| Resume mode (Ctrl-C halfway, re-run) | Skill picks up after the last logged phase |
| Writeback to a cwd with no Obsidian project dir | Session log writeback skipped silently |

### SKILL.md self-review (one-time, before shipping)

Read the SKILL.md once with fresh eyes and check:

- [ ] All three modes covered (stage / execute / resume + completed-no-op)?
- [ ] References `superpowers:writing-plans` and `superpowers:executing-plans` correctly (don't reimplement, invoke)?
- [ ] All error cases from sections 3-5 represented in the SKILL.md flow?
- [ ] Project-name resolver table accurate against current vault state?
- [ ] No placeholders ("TBD", "TODO") in the SKILL.md itself?

---

## Acceptance criteria

The skill is "done" when:

1. `~/.claude/skills/plan-handoff/SKILL.md` exists with frontmatter declaring the skill, slash command `/plan-handoff`.
2. Smoke playbook (Section 7) passes end-to-end on Shippie cwd: stage from Opus session, switch to Sonnet, execute, verify writeback.
3. Targeted error-path checks (Section 7) all pass.
4. SKILL.md self-review checklist passes.
5. The skill is invoked from at least one real (non-smoke) plan, end-to-end, with successful writeback. (Not a launch-blocker, but a soak-test before declaring it stable.)

---

## Open questions for implementation plan

These were deliberately left as implementation choices for the writing-plans phase:

- **Frontmatter format** for `~/.claude/skills/plan-handoff/SKILL.md` — match the existing user skills (`session-end`, `wrap-up`) so the slash command surfaces correctly. Verify their format during impl.
- **How exactly Opus introspects the conversation for source-of-truth files** — likely "files this conversation has read or cited" via tool-call history. Implementation detail; the spec just declares the contract.
- **Concrete project-name resolver implementation** — the table in Section 5 is the contract; how it's encoded in SKILL.md (markdown table, JS function in a code block, env-var override) is an impl choice.
