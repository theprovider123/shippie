# `plan-handoff` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global user-level skill at `~/.claude/skills/plan-handoff/SKILL.md` that bridges the Opus → Sonnet handoff pattern. One slash command (`/plan-handoff <slug>`) auto-detects whether to stage a plan (Opus side) or execute one (Sonnet side), with HEAD-verification before execute and writeback to plan file + Obsidian session log + memory after.

**Architecture:** Single-file SKILL.md, monolithic. References `superpowers:writing-plans` and `superpowers:executing-plans` rather than reimplementing them. Mode detection is driven by parsing a `## Status:` footer in the plan file. Six tasks build the skill section-by-section with a commit at each boundary, then a final smoke-playbook task validates end-to-end.

**Tech Stack:** Markdown (SKILL.md). The skill instructs Claude (Opus or Sonnet) on what to do; no actual program code is written. References to existing skills via the Skill tool. Files are touched via Read/Write/Edit tools at runtime; the SKILL.md prescribes the operations.

**Source spec:** `docs/superpowers/specs/2026-05-05-plan-handoff-design.md` (in this repo).

---

## Notes for the implementer

This is a SKILL.md authoring plan, not a code-build plan. A few things differ from a typical TDD plan:

1. **No automated tests for the SKILL.md itself.** SKILL.md content is interpreted by Claude at runtime. The "test" is the smoke playbook in Task 6 — a manual run that exercises the happy path + error paths.
2. **Per-step "verification" is usually a self-review of the written markdown** rather than running a test command. Where verification IS a command (e.g., the SKILL.md frontmatter has to parse for the skill to be discoverable), that's called out explicitly.
3. **Each task ends with a commit** so you can pause and review the SKILL.md as it grows. The smoke playbook (Task 6) is the only task that can fail and require returning to earlier tasks for fixes.
4. **The SKILL.md goes outside the Shippie repo** at `~/.claude/skills/plan-handoff/SKILL.md`. The plan file you're reading lives in Shippie's `docs/superpowers/plans/` per the writing-plans default. Commits during this plan are against the Shippie repo for the smoke-test plan only — the SKILL.md itself is in a non-git-tracked path. Do not initialize git in `~/.claude/skills/plan-handoff/`.

---

## Task 1: Skeleton — frontmatter + outline + plan-file resolver + mode detection

**Files:**
- Create: `~/.claude/skills/plan-handoff/SKILL.md`

**Goal:** The smallest deployable skeleton. Once this lands, running `/plan-handoff <slug>` from any conversation should detect mode and either route to a stub stage flow or a stub execute flow. The flows themselves don't do anything yet — that's Tasks 2-4. But the slash command exists, frontmatter parses, and mode detection is correct.

- [ ] **Step 1: Read the existing user-level skills' frontmatter for reference**

This is for context only — see how existing skills declare themselves. No file changes.

```bash
head -10 ~/.claude/skills/session-end/SKILL.md
head -10 ~/.claude/skills/wrap-up/SKILL.md
head -10 ~/.claude/skills/session-start/SKILL.md
```

Expected: each starts with YAML frontmatter `--- ... ---` containing `name:` and `description:`. The `description` field is what triggers skill auto-suggestion based on user prompts.

- [ ] **Step 2: Create the SKILL.md skeleton file**

Run:

```bash
mkdir -p ~/.claude/skills/plan-handoff
```

Create `~/.claude/skills/plan-handoff/SKILL.md` with the following content (this is the complete file for Task 1 — Tasks 2-4 will append, Task 5 will reorganize):

````markdown
---
name: plan-handoff
description: Use when handing a plan from one model session to another — typically Opus stages a plan, Sonnet executes it. Auto-detects stage vs execute mode based on plan-file state. Wraps superpowers:writing-plans + superpowers:executing-plans with HEAD-verify + writeback to plan file, project session log, and memory. Triggered by `/plan-handoff <slug>`.
---

# Plan Handoff

## Overview

A model-aware bridge for the Opus → Sonnet handoff pattern. One slash command, two modes, one source-of-truth plan file that travels between sessions.

**Slash command:** `/plan-handoff <slug>`

**Auto-detected modes:**

| Plan-file state | Mode |
|---|---|
| No file at resolved path | stage |
| File exists, footer is `## Status: ready-for-execution` | execute |
| File exists, footer is `## Status: completed` | already-done — report and exit |
| File has partial `## Execution log` entries but `## Status: ready-for-execution` still present | resume (pick up after the last logged phase) |
| File exists, no status footer | malformed — report and exit |

**Announce at start:** "I'm using the plan-handoff skill to <stage|execute|resume> the plan at <path>."

## Plan-file resolution

When `/plan-handoff <slug>` is invoked, resolve the plan file path in this order:

1. If the current cwd is inside a git repo and `<repo-root>/docs/superpowers/plans/` contains a single file matching `*<slug>*.md`, use it.
2. Else if `~/.claude/plans/<slug>.md` exists, use it.
3. Else if invoked in stage mode and the cwd is inside a git repo with `docs/superpowers/plans/`, the path to write is `<repo-root>/docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md` (auto-prefix today's date).
4. Else if invoked in stage mode (no tracked plans dir), the path to write is `~/.claude/plans/<slug>.md`.
5. Else (execute mode, no file found) → error: "no plan named `<slug>` — did you `/plan-handoff` from Opus first?"

If step 1 matches more than one file, error: "multiple plans match `<slug>` — please disambiguate via the full filename."

To detect "current cwd is inside a git repo", run `git rev-parse --show-toplevel` via the Bash tool and capture stdout. Empty / non-zero exit means not in a repo.

## Mode detection

After resolving the plan-file path:

1. If the file does not exist → **stage** mode. Proceed to "Stage flow" section. (Tasks 2-4 below will fill this in.)
2. If the file exists, read its full contents. Search for the last occurrence of `^## Status:` (top-level heading starting with "Status:"). The text on the rest of that line determines the mode:
   - `## Status: ready-for-execution` → check whether `## Execution log` already exists in the file. If yes and contains at least one phase entry → **resume** mode. Else → **execute** mode.
   - `## Status: completed` → already-done. Report `Plan at <path> was already executed (see execution log).` and exit.
   - Any other status line → malformed. Report `Plan at <path> has unrecognized status: <line>. Re-stage from Opus.` and exit.
3. If the file exists but has no `## Status:` line → malformed. Report `Plan at <path> has no status footer. Re-stage from Opus.` and exit.

## Stage flow (Opus side)

(implementation in Task 2)

## Execute flow (Sonnet side)

(implementation in Tasks 3-4)

## Writeback contract

(implementation in Task 5)

## Error cases reference

(consolidated in Task 6)
````

- [ ] **Step 3: Verify the skill is discoverable**

Open a new Claude Code session (`claude` in any directory) and run `/plan-handoff foo`. Expected: the skill is recognized (its body is loaded into context). If it's NOT recognized, check the frontmatter — `name:` must be `plan-handoff`, file must be at exactly `~/.claude/skills/plan-handoff/SKILL.md`.

If you're running this implementation inside an existing Claude Code session, re-running `/plan-handoff` may not pick up the new skill until the session restarts. That's fine — the smoke playbook in Task 6 runs from a fresh session.

- [ ] **Step 4: Self-review the skeleton**

Read `~/.claude/skills/plan-handoff/SKILL.md` from end to end. Check:

- [ ] Frontmatter has `name: plan-handoff` and a `description` that mentions "stage vs execute mode" and "Opus → Sonnet" so the skill auto-suggests on relevant prompts.
- [ ] Plan-file resolution lists exactly the 5 steps from spec Section 1.
- [ ] Mode-detection rules cover all 5 states (no file / ready-for-execution / completed / partial-with-execution-log / malformed-no-status).
- [ ] Three flow sections are stubbed with `(implementation in Task N)` markers so it's obvious the file is incomplete.

- [ ] **Step 5: Commit**

Note: `~/.claude/skills/` is NOT a git repo. There's nothing to commit at this level. Just verify the file exists at the expected path:

```bash
ls -la ~/.claude/skills/plan-handoff/SKILL.md
wc -l ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: file exists, ~70 lines.

---

## Task 2: Stage flow

**Files:**
- Modify: `~/.claude/skills/plan-handoff/SKILL.md` — replace the `## Stage flow (Opus side)` stub with the full flow.

**Goal:** Opus running `/plan-handoff <slug>` produces a valid plan file at the resolved path, with Goal/Architecture/Tech-Stack header, plan-handoff metadata block, all writing-plans-format tasks, and `## Status: ready-for-execution` footer. Placeholder sweep rejects bad input.

- [ ] **Step 1: Read writing-plans for the placeholder rules**

This is reference reading. The stage flow's placeholder sweep enumerates the patterns from `superpowers:writing-plans`. We need to copy that list verbatim so the skill is self-contained.

```bash
grep -A 8 "No Placeholders" ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/writing-plans/SKILL.md
```

Expected: see the bulleted list — "TBD", "TODO", "implement later", etc. Note the exact patterns for use in Step 3.

- [ ] **Step 2: Replace the stage-flow stub in SKILL.md**

Open `~/.claude/skills/plan-handoff/SKILL.md` and find the line `## Stage flow (Opus side)` followed by `(implementation in Task 2)`. Replace those two lines and the blank line after them with:

````markdown
## Stage flow (Opus side)

When `/plan-handoff <slug>` is invoked and mode-detection returns `stage`:

### Step 1 — Pre-flight checks

Detect current model. If Sonnet, print:

```
WARNING: You're staging a plan with Sonnet. Usually Opus does the planning step
because it concentrates the scarce reasoning budget on the part that benefits
most. Continue anyway? (yes/no)
```

Wait for user confirm. If no, exit. If yes, proceed.

### Step 2 — Gather plan content

Plan content can come from one of three sources, in priority order:

1. **Conversation context** — most common. The user has been working with Opus to design a plan in chat. Summarize the plan from the recent conversation.
2. **`--from <path>` flag** — if `/plan-handoff <slug> --from <path>` was invoked, read the plan body from that file.
3. **Empty context** — if neither above applies, prompt the user: "No plan in conversation context and no `--from <path>` provided. Paste the plan body or describe it." Wait for user response.

### Step 3 — Apply writing-plans rules to the body

The plan body must conform to `superpowers:writing-plans` format:

- Header block: Goal (one sentence), Architecture (2-3 sentences), Tech Stack (key libs).
- Bite-sized tasks (2-5 minutes per step), exact file paths, code blocks for code steps, exact commands with expected output.
- No placeholders. Run a placeholder sweep over the proposed body. Reject and report if any of these patterns appear:

  - Literal "TBD", "TODO", "implement later", "fill in details"
  - "Add appropriate error handling" / "add validation" / "handle edge cases" (without specifics)
  - "Write tests for the above" (without test code)
  - "Similar to Task N" (the engineer may read tasks out of order — repeat the code)
  - Steps that describe what to do without showing how (code blocks required for code steps)

If the placeholder sweep fails, print each failing pattern with its surrounding line of context and stop. Do not write the file. The user re-works the plan body and re-runs `/plan-handoff`.

### Step 4 — Generate the plan-handoff metadata block

Introspect the conversation to populate:

**Source-of-truth files:** Files this conversation has read or cited via tool calls during planning. List them with line ranges where applicable. The execute-side HEAD-verify will re-read these to detect drift.

**Constraints / invariants:** Non-obvious decisions made during planning that don't show up in the per-task code blocks. Prompt yourself: "what did I hold in mind during planning that wouldn't be obvious from the task list alone?" Common shapes: "X depends on Y override — don't bypass it"; "the convention here is A even though Y looks like a B-pattern."

**Stop points:** Phase boundaries where Sonnet should pause for a user gut-check before continuing. Default: every 3-4 tasks. Override: any boundary the user explicitly flagged during planning.

**Verification per phase:** The exact command to run to confirm a phase landed cleanly. Examples: `bun run typecheck --filter=<pkg>`, `cargo test --features X`, `wrangler d1 execute --command "..."`. Each phase needs at least one.

**Success criteria:** What "fully done" looks like. One or two bullet points. Concrete, observable.

### Step 5 — Compose the plan file

Write the file at the resolved path. Structure:

```markdown
# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the `plan-handoff` skill
> (slash command `/plan-handoff <slug>`) — it wraps superpowers:executing-plans
> with HEAD-verify + writeback.

**Goal:** <one sentence>

**Architecture:** <2-3 sentences>

**Tech Stack:** <key libs>

---

## Plan-handoff metadata

**Staged by:** <Model> · <YYYY-MM-DD HH:MM> · session <one-line conversation summary>

**Source-of-truth files:**
- `path/to/file.ts:1-150`
- `path/to/other.ts`

**Constraints / invariants:**
- <bullet>

**Stop points:**
- After Phase N (<reason>)

**Verification per phase:**
- Phase 1: `<command>`
- Phase 2: `<command>`

**Success criteria:**
- <bullet>

---

## Status: ready-for-execution

### Task 1: <name>
<bite-sized-step task body, writing-plans format>

### Task 2: <name>
...
```

### Step 6 — Don't auto-commit

The skill writes the file but does NOT run `git add` or `git commit`. Per CLAUDE.md (in the user's project, when present), commits to main need explicit authorization.

After writing, print to the user:

```
Plan staged at <full-path>.

Next steps:
  1. (optional) git add + commit the plan file so it travels with the repo
  2. /model sonnet
  3. /plan-handoff <slug>  → enters execute mode (HEAD-verify + critical pass + run + writeback)
```

### Stage-mode error cases

| Condition | Behavior |
|---|---|
| Plan body fails the placeholder sweep | Print failing patterns with line context. Don't write the file. |
| Sonnet invoked stage mode | Warn ("Sonnet quota on planning") + ask user confirm |
| No plan content in context AND no `--from <path>` | Prompt for content; if empty, exit cleanly |
| File already exists with `ready-for-execution` | Refuse: "Plan already staged. Use `--re-stage` to overwrite or pick a new slug." |
| File already exists with `completed` | Refuse: "Plan was already executed. Use `--re-stage` to start over or pick a new slug." |
| Filesystem write fails | Surface the OS error; don't half-write the file |
````

- [ ] **Step 3: Self-review**

Read the new section. Check:

- [ ] Pre-flight checks include the Sonnet-warning path.
- [ ] Three plan-content sources listed (conversation / `--from` / prompt user).
- [ ] Placeholder sweep enumerates all 5 patterns from writing-plans.
- [ ] Metadata block fields match spec Section 2: source-of-truth, constraints, stop points, verification per phase, success criteria.
- [ ] Final report message tells user the next 3 steps explicitly.
- [ ] Error cases table is exhaustive (matches spec Section 3).

- [ ] **Step 4: Verify SKILL.md still parses**

```bash
head -1 ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: `---` (frontmatter still leads). The Task 2 edit only replaced a stub mid-file; frontmatter is untouched.

```bash
wc -l ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: ~150 lines (skeleton was ~70, stage section adds ~80).

- [ ] **Step 5: Commit (smoke-test plan only — SKILL.md is outside the repo)**

No git commit needed for the SKILL.md change. Move on.

---

## Task 3: Execute flow — HEAD-verify + critical pass

**Files:**
- Modify: `~/.claude/skills/plan-handoff/SKILL.md` — replace the first half of the `## Execute flow (Sonnet side)` stub with HEAD-verify and critical-pass logic.

**Goal:** When Sonnet runs `/plan-handoff <slug>` and mode is `execute`, the skill re-reads every source-of-truth file from the metadata block, compares to what the plan asserted, and pauses if drift is detected. Then runs the critical-pass step from `superpowers:executing-plans` and pauses if concerns are raised.

- [ ] **Step 1: Read executing-plans for the critical-pass step**

```bash
grep -B 1 -A 5 "Review critically" ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/executing-plans/SKILL.md
```

Expected: see the existing rule "Review critically — identify any questions or concerns about the plan." We're adopting this verbatim, then adding HEAD-verify on top of it.

- [ ] **Step 2: Replace the execute-flow stub (first half)**

Open `~/.claude/skills/plan-handoff/SKILL.md` and find the line `## Execute flow (Sonnet side)` followed by `(implementation in Tasks 3-4)`. Replace those two lines and the blank line after them with:

````markdown
## Execute flow (Sonnet side)

When `/plan-handoff <slug>` is invoked and mode-detection returns `execute` (or `resume`):

### Step 1 — Pre-flight checks

Detect current model. If Opus, print:

```
WARNING: You're executing a plan with Opus. Usually Sonnet does the execution
step because it preserves the scarce Opus reasoning budget for planning.
Continue anyway? (yes/no)
```

Wait for user confirm. If no, exit. If yes, proceed.

Read the plan file. Parse the metadata block to extract:
- Source-of-truth files (with line ranges if specified)
- Constraints / invariants
- Stop points
- Verification per phase
- Success criteria

Initialize an `## Execution log` section in working memory if the plan doesn't already have one.

### Step 2 — HEAD-verify (the net-new step plan-handoff adds)

For each file in the "Source-of-truth files" metadata list:

1. Read the file at the cited path. If a line range was given (e.g. `path/to/file.ts:1-150`), focus on those lines.
2. Compare the current state to what the plan asserts about it. The plan may state directly ("`exports` block points at `./dist`") or implicitly (a step's expected output references the file's current content).
3. If the file does not exist at the cited path → drift.
4. If the file exists but the cited region has been substantively changed (renamed function, deleted import, repointed export) → drift.
5. If the file is unchanged or only trivially different (whitespace, unrelated edits elsewhere in the file) → no drift.

If **any** source-of-truth file shows drift:

1. Append to the plan file an `## Drift detected (<YYYY-MM-DD HH:MM>) — paused` block listing each drifted file + the specific drift observed.
2. Status footer stays `## Status: ready-for-execution` (don't promote past this gate).
3. Print to user:

   ```
   The plan's assumptions don't match HEAD:

   - <file>: <drift description>
   - <file>: <drift description>

   Options:
     1. Re-stage with Opus (run /plan-handoff <slug> --re-stage from an Opus session)
     2. Override and proceed despite drift (run /plan-handoff <slug> --proceed-despite-drift)

   Stopping for now.
   ```

4. Stop the skill.

If **no** drift detected:

Append to the in-memory execution log:

```markdown
- **HEAD-verify (<YYYY-MM-DD HH:MM>):** clean — all source-of-truth files match plan's stated state.
```

(This will be flushed to the plan file with the per-phase log entries — see Task 4.)

### Step 3 — Critical pass (inherits superpowers:executing-plans Step 1)

Read the plan critically end-to-end. Identify any questions, concerns, or gaps. This is the same step `superpowers:executing-plans` already runs — we're inheriting it explicitly so the inherited behavior is visible in this skill's flow.

Look for:

- Tasks that assume something not declared
- Steps that reference functions/types not defined in any earlier task
- Verification commands that won't exist until a later phase
- Inconsistencies between the metadata block and the per-task code (e.g., metadata says `exports` is `./src`, a task assumes `./dist`)

If any concerns surface:

1. Append to the plan file a `## Critical-pass concerns (<YYYY-MM-DD HH:MM>) — paused` block listing each concern.
2. Status footer stays `## Status: ready-for-execution`.
3. Print to user:

   ```
   The plan has concerns that should be resolved before execution:

   - <concern>
   - <concern>

   Options:
     1. Re-stage with Opus to resolve
     2. Override and proceed (run /plan-handoff <slug> --proceed-despite-concerns)

   Stopping for now.
   ```

4. Stop.

If no concerns:

Append to the in-memory execution log:

```markdown
- **Critical pass:** no concerns raised. Proceeding.
```

(implementation continues in Task 4)

````

- [ ] **Step 3: Self-review**

Check:

- [ ] HEAD-verify enumerates the comparison rules: file missing = drift, region renamed = drift, trivial whitespace = not drift.
- [ ] Drift block format matches what the spec says (filename + drift description).
- [ ] User-facing message lists exactly two override options (`--re-stage` and `--proceed-despite-drift`).
- [ ] Critical pass references `superpowers:executing-plans` so the inheritance is explicit.
- [ ] Critical-pass concerns block has a separate override flag (`--proceed-despite-concerns`) so users can distinguish drift from concerns.

- [ ] **Step 4: Verify file size**

```bash
wc -l ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: ~220 lines (was ~150, added ~70).

---

## Task 4: Execute flow — invoke executing-plans + per-phase logging + resume

**Files:**
- Modify: `~/.claude/skills/plan-handoff/SKILL.md` — append to the execute-flow section.

**Goal:** After HEAD-verify + critical pass succeed, the skill invokes `superpowers:executing-plans` to run tasks task-by-task, appends a per-phase log entry to the plan file after each task, pauses at stop points, and handles the blocker / resume cases.

- [ ] **Step 1: Append to the execute-flow section**

In `~/.claude/skills/plan-handoff/SKILL.md`, find the line `(implementation continues in Task 4)` (the last line of the execute-flow section after Task 3). Replace it with:

````markdown
### Step 4 — Execute task-by-task via superpowers:executing-plans

Invoke `superpowers:executing-plans` via the Skill tool to run the actual task loop. Do NOT reimplement the loop here — `executing-plans` already handles task-by-task execution, marks in-progress / completed, runs verifications per the plan's instructions, and stops on blockers.

Wrap the invocation with per-phase logging:

After each task / phase that `executing-plans` reports as complete:

1. Capture the most recent commit hash (run `git log -1 --format=%H` via Bash and capture stdout).
2. Append to the plan file's `## Execution log` block (creating the block if it doesn't exist yet):

   ```markdown
   - Phase <N> → commit `<hash-shortened-to-7>` (<HH:MM>) ✓
   ```

3. If the task surfaced a non-trivial note (a small surprise, an off-by-one fix, parallel-thread already-shipped-this), inline it as a sub-bullet under the phase entry:

   ```markdown
   - Phase <N> → commit `abc1234` (14:32) ✓
     - Note: <one-line description of the surprise>
   ```

If a `## Stop points` entry in the metadata corresponds to the just-completed phase boundary (e.g., metadata says "Stop after Phase 2" and Phase 2 just completed), pause:

```
Stop point reached after Phase <N>.

Reason from plan: <stop-point text from metadata>

Continue executing? (yes/no)
```

Wait for user confirm. If no, leave the plan in `## Status: ready-for-execution` — re-running `/plan-handoff <slug>` later will resume mode and pick up at Phase <N+1>. If yes, continue.

### Step 5 — Stop on blocker (inherits superpowers:executing-plans rule)

`superpowers:executing-plans` stops execution when:

- A verification command fails
- A required file is missing
- An instruction is unclear
- A verification fails repeatedly

When it stops:

1. Append to the plan file:

   ```markdown
   ## Blocker (<YYYY-MM-DD HH:MM>)

   **Phase:** <N> (<task name>)
   **What failed:** <command or step>
   **Output:** <truncated relevant output>
   **Plan claim:** <what the plan asserted should happen>
   ```

2. Status footer stays `## Status: ready-for-execution` so the next `/plan-handoff <slug>` invocation enters resume mode after the blocker is fixed.
3. Stop the skill. Don't guess at a fix.

### Step 6 — Resume mode

If mode-detection returned `resume` (file has `## Status: ready-for-execution` AND `## Execution log` already has at least one phase entry):

1. Run **all** of Step 1-3 again (pre-flight, HEAD-verify, critical pass). HEAD may have drifted since the partial run completed; verify before resuming.
2. After Step 3 succeeds, parse the `## Execution log` block to find the last logged phase number (`Phase <N> → commit ...`).
3. Pass `executing-plans` the plan with tasks before Phase <N+1> already marked as completed in TodoWrite. (`executing-plans` reads the plan and creates TodoWrite entries — pre-mark the completed ones.)
4. Continue with Step 4 logic, picking up at Phase <N+1>.

If mode-detection returned `resume` but the plan's already-logged phases now show drift via HEAD-verify (HEAD changed since the partial run):

1. Append a `## Drift detected (<timestamp>) — paused` block as in Step 2.
2. Status footer stays `## Status: ready-for-execution`.
3. Stop. The user will need to re-stage with Opus to refresh the plan (the partial execution log is preserved as historical context).

### Step 7 — On clean completion

When all tasks in the plan have reported complete:

1. Append the final stamp to the `## Execution log`:

   ```markdown
   **Net:** +<N> files, -<M> lines, <K> tests added. <Health note — e.g. "Health green at every commit boundary." or "Tests added but health not run.">
   **Phases completed:** <N> of <N>. **Stop points hit:** <N> (all confirmed by user).
   ```

2. Replace `## Status: ready-for-execution` with:

   ```markdown
   ## Status: completed
   **Executed by:** <Model name + version> · <YYYY-MM-DD HH:MM> · session <one-line conversation summary>
   ```

3. Trigger writeback (see "Writeback contract" section).

````

- [ ] **Step 2: Self-review**

Check:

- [ ] Step 4 explicitly invokes `superpowers:executing-plans` rather than reimplementing the loop.
- [ ] Per-phase log entries include commit hash + timestamp + ✓.
- [ ] Sub-bullet pattern documented for in-line notes.
- [ ] Stop-point pause prompt is exact, not vague.
- [ ] Step 5 (blocker) preserves `## Status: ready-for-execution` so resume mode works.
- [ ] Step 6 (resume) runs HEAD-verify again and pre-marks completed phases in TodoWrite.
- [ ] Step 7 (completion) replaces status footer + triggers writeback.

- [ ] **Step 3: Verify file size**

```bash
wc -l ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: ~290 lines.

---

## Task 5: Writeback contract

**Files:**
- Modify: `~/.claude/skills/plan-handoff/SKILL.md` — replace the `## Writeback contract` stub with the full contract (plan file final stamp + session log + memory + project-name resolver).

**Goal:** After execute Step 7 ("on clean completion") triggers writeback, the skill writes back to the plan file (always), the project session log (conditional on infrastructure existing), and memory (conditional + discriminated by lesson criteria).

- [ ] **Step 1: Replace the writeback stub**

In `~/.claude/skills/plan-handoff/SKILL.md`, find the line `## Writeback contract` followed by `(implementation in Task 5)`. Replace those two lines and the blank line after with:

````markdown
## Writeback contract

After execute Step 7 ("on clean completion") fires, three writebacks run in order. Each is conditional on its target infrastructure existing — missing infrastructure means skip silently, never error.

### Writeback 1 — Plan file (always fires)

The execute flow has already appended per-phase log entries during the run, and Step 7 has appended the final stamp + replaced the status footer. Writeback 1 is therefore a no-op as a separate step — it's already done by the time Writeback 2 starts. The skill's report message will confirm this.

### Writeback 2 — Project session log (conditional on Obsidian project dir existing)

Step A — Resolve the project name from the current cwd:

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

To get the cwd basename, run `basename "$(pwd)"` via Bash.

Step B — Check for Obsidian project dir:

```bash
test -d "$HOME/Documents/Obsidian/life/projects/<name>"
```

If exit code is non-zero (directory doesn't exist), skip writeback 2 silently. Print: `Session log writeback skipped (no ~/Documents/Obsidian/life/projects/<name>/ found).` Move to writeback 3.

Step C — If directory exists, append to today's session file:

The path is `~/Documents/Obsidian/life/projects/<name>/sessions/<YYYY-MM-DD>.md`. If the file does not exist, create it with:

```markdown
# Session — <YYYY-MM-DD>

#session #<name>

```

Then append the writeback block (regardless of whether the file is new or existing):

```markdown
---

## /plan-handoff — <slug> (<HH:MM>)

**Plan:** <full path to plan file, or vault-style link if the plan is itself in the vault>
**Phases:** <N>/<N> ✓
**Commits:** `<hash1>`, `<hash2>`, ..., `<hashN>`
**Net:** +<N> files, -<M> lines, <K> tests added.

<inline notes from the execution log, if any — copy the sub-bullets verbatim>
```

The `---` separator is intentional; if there's already a session entry for today, this block visually delineates from the prior content.

### Writeback 3 — Memory (conditional + discriminated)

Step A — Check for memory dir:

The memory dir path encodes the cwd. Run:

```bash
ENCODED_CWD=$(echo "$(pwd)" | sed 's|/|-|g')
test -d "$HOME/.claude/projects/${ENCODED_CWD}/memory"
```

If exit code is non-zero, skip writeback 3 silently. Print: `Memory writeback skipped (no memory dir for this cwd).` Done.

Step B — Discriminate. Ask yourself: did execution surface a non-obvious lesson?

A lesson qualifies if at least ONE of these is true:

- A constraint that bit during execution that wasn't documented in the plan
- A verification command caught real drift (HEAD-verify drift, mid-execution surprise)
- A fix took materially longer than the plan claimed (≥2x the estimated effort)
- A surprise about how the codebase behaves (e.g., gitignored build artifact masquerading as source, parallel-thread bundling carrying half your work)

A lesson is DISQUALIFIED (skip even if surfaced) if:

- "I executed phase 3" — that's session log content, not memory
- Per-commit hashes — that's plan-file content
- Routine successful completion — that's nothing

If no qualifying lesson → skip writeback 3 silently. Print: `Memory writeback skipped (no qualifying lesson surfaced).` Done.

Step C — If a qualifying lesson surfaced, write a feedback-type memory entry.

Pick a slug for the new memory file based on the lesson's topic (e.g. `feedback_head_drift_in_resume.md`, `feedback_parallel_bundling.md`). Path: `~/.claude/projects/${ENCODED_CWD}/memory/<slug>.md`.

Format (matches existing memory-file shape — see other files in the dir for examples):

```markdown
---
name: <one-line title>
description: <one-line description for relevance matching>
type: feedback
---

<rule / fact, lead-with — usually starts with a bold imperative>

**Why:** <what bit during execution; reference the plan/commit if relevant>
**How to apply:** <when this guidance kicks in for future sessions>
```

Append a one-line entry to `~/.claude/projects/${ENCODED_CWD}/memory/MEMORY.md`:

```markdown
- [<one-line title>](<slug>.md) — <one-line description>
```

### Order + atomicity

The three writebacks fire in sequence: plan file (already done by Step 7) → session log → memory.

If session-log writeback fails (filesystem error, permission denied), surface the error and stop the writeback sequence. Plan file is already written; user sees the error and can re-run `/plan-handoff` (which will detect `## Status: completed` and skip directly to writeback retry — handle this case in mode-detection if needed, or document as user-error and let them manually copy-paste).

If memory writeback fails, surface but don't error the whole skill — plan file + session log have already succeeded.

### Final report

After writebacks complete, print to user:

```
/plan-handoff complete.

Plan: <path>
  Status: completed
  Phases: <N>/<N> ✓
  Commits: <list>

Session log: <wrote | skipped — reason>
Memory: <wrote <slug>.md | skipped — reason>
```
````

- [ ] **Step 2: Self-review**

Check:

- [ ] Project-name resolver table matches spec Section 5 exactly (Shippie, Urthly, Chiwit, Palate, Orc→loop, ClassroomX→classroomx, mevrouw→mevrouw, other→lowercased basename).
- [ ] Session-log writeback uses `---` separator before the block.
- [ ] Memory writeback discrimination criteria are concrete (4 qualifies, 3 disqualifiers).
- [ ] Memory file format matches the existing pattern (frontmatter with name/description/type:feedback, body with bold rule + Why + How to apply).
- [ ] Final report message lists all three writeback outcomes (plan / session / memory) with skip-reason if applicable.

- [ ] **Step 3: Verify file size**

```bash
wc -l ~/.claude/skills/plan-handoff/SKILL.md
```

Expected: ~370 lines.

---

## Task 6: Error consolidation + SKILL.md self-review

**Files:**
- Modify: `~/.claude/skills/plan-handoff/SKILL.md` — replace the `## Error cases reference` stub with a consolidated reference, then run the SKILL.md self-review checklist and apply any inline fixes.

**Goal:** All error cases from the spec consolidated into one reference table at the bottom of SKILL.md, so future debugging has a single place to look. SKILL.md passes the self-review checklist.

- [ ] **Step 1: Replace the error-cases stub**

In `~/.claude/skills/plan-handoff/SKILL.md`, find the line `## Error cases reference` followed by `(consolidated in Task 6)`. Replace those two lines and the blank line after with:

````markdown
## Error cases reference

Consolidated from sections 3-5 above. If you're debugging a failed `/plan-handoff` invocation, find the matching row.

### Mode-detection errors

| Condition | Behavior |
|---|---|
| No file matches `<slug>` AND not in stage mode | Error: "no plan named `<slug>` — did you `/plan-handoff` from Opus first?" |
| File found but no status footer | Error: "malformed plan — re-stage from Opus" |
| File already `ready-for-execution`, stage invoked | Error: "plan already staged. Use `--re-stage` or pick a new slug." |
| File already `completed`, stage invoked | Error: "plan was already executed. Use `--re-stage` to start over or pick a new slug." |
| Multiple files match the slug | Error: list matches; ask user to disambiguate via fuller path |

### Stage-mode errors

| Condition | Behavior |
|---|---|
| Plan body has placeholder patterns | Surface failing patterns with line context. Don't write the file. |
| Sonnet invoked stage mode | Warn ("Sonnet quota on planning") but proceed if user confirms |
| No plan content in conversation AND no `--from <path>` | Prompt: "no plan found — describe the plan or pass `--from <path>`" |
| Filesystem write fails | Surface OS error; don't half-write the file |

### Execute-mode errors

| Condition | Behavior |
|---|---|
| HEAD-verify drift on any source-of-truth file | Append `## Drift detected (<timestamp>) — paused`. Status stays `ready-for-execution`. |
| Source-of-truth file no longer exists | Treat as drift |
| Critical pass surfaces concerns | Append `## Critical-pass concerns (<timestamp>) — paused`. Status stays `ready-for-execution`. |
| Verification command fails per-phase | Stop. Append `## Blocker (<timestamp>)`. Status stays `ready-for-execution`. |
| Step's expected output doesn't match | Stop. Same blocker shape. |
| Required dependency missing | Stop. Same blocker shape. |
| Opus invoked execute mode | Warn ("Opus quota on execution") but proceed if user confirms |
| User aborts at stop point | Status stays `ready-for-execution`. Resume mode picks up at next un-logged phase. |
| Mid-execution crash | Plan keeps partial state. Resume mode handles it. |

### Writeback errors

| Condition | Behavior |
|---|---|
| Session log directory doesn't exist | Skip silently. Report skip reason. |
| Memory directory doesn't exist | Skip silently. Report skip reason. |
| No qualifying lesson surfaced | Skip memory writeback. Report skip reason. |
| Plan-file writeback fails | Fatal. Surface error; user re-runs after fixing. |
| Session-log file write fails | Surface, but plan-file already succeeded. |

### Out-of-scope (NOT handled — document as user error)

- Concurrent `/plan-handoff` execute invocations on the same plan in two terminals
- Auto-commit of staged plans (CLAUDE.md rule)
- Auto-rollback on failed execution
- Plan-format migration when this skill itself updates
- Subagent-driven execution (use `superpowers:subagent-driven-development` directly)
- Multi-day stale plans (resume mode is the same as a fresh execute)
````

- [ ] **Step 2: Run the SKILL.md self-review checklist**

Read `~/.claude/skills/plan-handoff/SKILL.md` end-to-end. For each item below, check off if the SKILL.md handles it; if not, fix inline.

- [ ] Frontmatter has `name: plan-handoff` and a description that mentions Opus → Sonnet handoff.
- [ ] All four mode-detection states covered (stage / execute / completed / malformed-no-status / resume).
- [ ] Plan-file resolver lists all 5 steps (repo plan / `~/.claude/plans/` / repo create / `~/.claude/plans/` create / error).
- [ ] Stage flow: pre-flight → gather → placeholder sweep → metadata block → write → don't auto-commit → final report.
- [ ] Execute flow: pre-flight → HEAD-verify → critical pass → executing-plans invocation → per-phase log → stop points → blocker → resume → completion stamp.
- [ ] Writeback: plan file (already done) → session log (conditional) → memory (conditional + discriminated) → final report.
- [ ] Error cases reference has 5 sub-tables.
- [ ] No literal "TBD" or "TODO" or "(implementation in Task N)" anywhere — those should all have been replaced.

If anything is missing or wrong, edit the SKILL.md inline and check off after fixing.

- [ ] **Step 3: Verify final file size + structure**

```bash
wc -l ~/.claude/skills/plan-handoff/SKILL.md
grep -c "^## " ~/.claude/skills/plan-handoff/SKILL.md
grep "TBD\|implementation in Task" ~/.claude/skills/plan-handoff/SKILL.md
```

Expected:
- ~430 lines (skeleton 70 + stage 80 + execute 140 + writeback 80 + error reference 60 ≈ 430)
- 6-8 top-level `##` headings (Overview / Plan-file resolution / Mode detection / Stage flow / Execute flow / Writeback contract / Error cases reference)
- The third `grep` returns NO matches. If it does, you have placeholder text remaining — fix.

---

## Task 7: Smoke playbook execution

**Files:**
- Create: `docs/superpowers/plans/2026-05-05-smoke-test-plan-handoff.md` (NEW, throwaway, deleted at end of task)
- (No SKILL.md changes if smoke passes; if it fails, return to earlier tasks for fixes)

**Goal:** Run the smoke playbook from spec Section 7 end-to-end against the just-built skill. Validate happy path + at least 3 error paths. Document any issues found, then either fix them in earlier tasks or document as known-issue if minor.

This is the only task that exercises the actual runtime behavior of the skill. Issues found here may require returning to Tasks 2-5 to fix the SKILL.md.

- [ ] **Step 1: Open a fresh Opus session in Shippie**

Important: this should be a NEW Claude Code session, not the one this plan is being implemented in. The skill needs to be loaded from disk fresh.

```bash
cd /Users/devante/Documents/Shippie
claude
```

Once the session is open, ensure model is Opus: `/model opus`.

- [ ] **Step 2: Stage a smoke-test plan**

In the Opus session, paste:

> "Plan: create `/tmp/handoff-smoke.txt` with text 'hello' (Task 1). Verify with `cat /tmp/handoff-smoke.txt` showing `hello` (Task 2). Constraints: don't run anything else; don't touch any other files."

Then run:

```
/plan-handoff smoke-test-handoff
```

Expected: skill announces "I'm using the plan-handoff skill to stage the plan at <path>." Pre-flight passes (we're on Opus). Plan content gathered from conversation. Placeholder sweep passes (nothing in the smoke plan triggers it). Metadata block populated. File written at `/Users/devante/Documents/Shippie/docs/superpowers/plans/2026-05-05-smoke-test-handoff.md`. Final report tells user the next steps.

If skill is not recognized: re-check Task 1 Step 3 — `~/.claude/skills/plan-handoff/SKILL.md` exists with valid frontmatter.

- [ ] **Step 3: Verify the staged plan file**

Open `docs/superpowers/plans/2026-05-05-smoke-test-handoff.md`. Verify:

- [ ] Header: `# <Feature Name> Implementation Plan` with Goal/Architecture/Tech-Stack lines.
- [ ] `## Plan-handoff metadata` block with all 5 fields populated (Staged-by, Source-of-truth files, Constraints, Stop points, Verification per phase, Success criteria).
- [ ] Footer: `## Status: ready-for-execution`.
- [ ] Two tasks below the footer, each with the standard writing-plans bite-sized-step format.

If any of these are missing/malformed → return to Task 2 (stage flow) and fix.

- [ ] **Step 4: Switch to Sonnet and execute**

In the same Claude Code session:

```
/model sonnet
/plan-handoff smoke-test-handoff
```

Expected:

1. Skill announces stage detection — actually wait, this is execute mode now (file exists with `ready-for-execution`). Skill announces `I'm using the plan-handoff skill to execute the plan at <path>.`
2. Pre-flight passes (we're on Sonnet).
3. HEAD-verify runs. Source-of-truth files in this case are likely empty or trivial since the smoke plan didn't reference real codebase files. Should report `clean — all source-of-truth files match plan's stated state.`
4. Critical pass runs. Should report `no concerns raised.`
5. `superpowers:executing-plans` invoked. Tasks 1 + 2 execute (creates `/tmp/handoff-smoke.txt`, runs `cat` to verify).
6. Per-phase log entries appended to plan file.
7. Final stamp + status flip to `## Status: completed`.
8. Writeback fires:
   - Plan file: already done.
   - Session log: writes to `~/Documents/Obsidian/life/projects/shippie/sessions/2026-05-05.md`.
   - Memory: should skip ("no qualifying lesson surfaced") since this was a routine smoke run.

- [ ] **Step 5: Verify outputs**

Check each:

```bash
cat /tmp/handoff-smoke.txt
# Expected: "hello"

cat /Users/devante/Documents/Shippie/docs/superpowers/plans/2026-05-05-smoke-test-handoff.md
# Expected: original plan + per-phase log + ## Status: completed footer

cat /Users/devante/Documents/Obsidian/life/projects/shippie/sessions/2026-05-05.md | tail -30
# Expected: a "## /plan-handoff — smoke-test-handoff" block at the bottom
```

If any of these are missing or wrong → identify which task's section needs fixing, return to it, re-run smoke from Step 2.

- [ ] **Step 6: Run targeted error-path probes**

Each probe is a quick 30-60 second check.

**Probe 1 — Stage with placeholder.** Open a new Opus session. Tell it:

> "Plan: TODO: figure out task 2."

Run `/plan-handoff smoke-error-1`. Expected: skill rejects with a placeholder-pattern callout citing "TODO" as the failing pattern. No file written.

**Probe 2 — Stage when plan exists.** From the same Opus session, with the smoke-test plan from Step 2 still in place:

```
/plan-handoff smoke-test-handoff
```

Expected: refuses ("plan was already executed. Use `--re-stage`...") because the file now has `## Status: completed`.

**Probe 3 — Execute with no plan file.** Switch to Sonnet:

```
/plan-handoff smoke-error-3-no-plan
```

Expected: errors helpfully ("no plan named `smoke-error-3-no-plan` — did you `/plan-handoff` from Opus first?").

**Probe 4 — Execute with completed status.** From Sonnet, with the smoke-test plan still completed:

```
/plan-handoff smoke-test-handoff
```

Expected: reports already-executed, no-op.

If any probe fails → identify the offending case in the SKILL.md error tables, fix, re-run that probe.

- [ ] **Step 7: Cleanup + commit the smoke artifact (or delete it)**

```bash
rm /tmp/handoff-smoke.txt
```

Decide: keep the smoke-test plan in `docs/superpowers/plans/` as a working example, or delete:

```bash
# To delete:
rm /Users/devante/Documents/Shippie/docs/superpowers/plans/2026-05-05-smoke-test-handoff.md
```

If keeping, commit it (per CLAUDE.md, request user authorization first):

```bash
git add docs/superpowers/plans/2026-05-05-smoke-test-handoff.md
git status
# Confirm only the smoke-test plan is staged
git commit -m "docs(plans): smoke-test plan for plan-handoff skill — keep as working example"
```

Recommended: delete it. The plan file is throwaway content; the skill itself is the artifact that matters.

- [ ] **Step 8: Final acceptance check**

The skill is "done" when all of these are true:

- [ ] `~/.claude/skills/plan-handoff/SKILL.md` exists and parses (frontmatter loads correctly).
- [ ] Smoke playbook (Steps 2-5) passed end-to-end.
- [ ] All 4 targeted error-path probes (Step 6) passed.
- [ ] SKILL.md self-review checklist (Task 6, Step 2) passed.

If all four are checked → task complete. The user can now use `/plan-handoff <slug>` from any project.

If any failed and required returning to earlier tasks → re-run the smoke playbook from Step 2 after the fix.

---

## Self-review against the spec

After all 7 tasks complete, verify spec coverage:

| Spec section | Implemented in |
|---|---|
| Section 1 (Architecture: SKILL.md path, slash command, plan-file resolution, dependencies on existing skills) | Task 1 (resolver + skeleton) |
| Section 2 (Plan file format: pre-execution + post-execution + mode-detection rule) | Task 1 (mode detection) + Task 2 (stage flow writes pre-execution shape) + Task 4 (execute appends post-execution shape) |
| Section 3 (Stage flow + error cases) | Task 2 + Task 6 (error-cases consolidation) |
| Section 4 (Execute flow + error cases) | Task 3 (HEAD-verify + critical pass) + Task 4 (executing-plans invocation + log + resume + completion) + Task 6 (error-cases consolidation) |
| Section 5 (Writeback: plan file + session log + memory + project-name resolver + order/atomicity + final report) | Task 5 |
| Section 6 (Out-of-scope: concurrent invocations, auto-commit, auto-rollback, plan-format migration, subagents, stale plans, long plans) | Task 6 (error-cases reference includes "Out-of-scope" sub-table) |
| Section 7 (Testing: smoke playbook + targeted error probes + SKILL.md self-review) | Task 6 (self-review) + Task 7 (smoke playbook) |

If any spec section is not covered by a task → add the missing task or extend an existing one.

---

## Acceptance criteria (from spec)

The skill is complete when:

1. ✓ `~/.claude/skills/plan-handoff/SKILL.md` exists with frontmatter declaring the skill, slash command `/plan-handoff`. (Task 1)
2. ✓ Smoke playbook passes end-to-end on Shippie cwd: stage from Opus session, switch to Sonnet, execute, verify writeback. (Task 7 Steps 2-5)
3. ✓ Targeted error-path checks all pass. (Task 7 Step 6)
4. ✓ SKILL.md self-review checklist passes. (Task 6 Step 2)
5. (Soak-test, not launch-blocker) The skill is invoked from at least one real (non-smoke) plan, end-to-end, with successful writeback. — out of scope for this implementation; happens organically over the next week of use.
