# Commit the State Repo as an Audit Log

## Overview
The state repo (`state/`) is described as a "repo" and the handbook claims "every change is committed... and revertible," but nothing actually commits it: bootstrap never `git init`s it, and no script or skill commits state changes. This plan makes the process commit the state repo automatically on every significant change so its git history becomes a reliable audit log of how each ticket moved through the pipeline.

The chosen mechanism (decided with the developer): **auto-commit inside the mutation scripts**, plus a shared lock-safe helper (`commit-state.ts`) that the scripts and the agents reuse for free-form edits. This is the only approach that makes the *process* manage committing rather than relying on an agent remembering to do it each turn. Commits are **ticket-scoped** (each commit stages only the affected ticket's directory, or `current-state.md`) so that the up-to-10 sub-agents `pb:next` runs in parallel never produce a muddled cross-ticket commit, and a retry-on-lock loop serialises the concurrent commits safely against the single shared git index. Granularity is **per significant change/addition** (a stage transition, a ticket creation, a failure recorded, a `current-state.md` update), not per individual file write.

## Commit Message Format

State-repo commits use a single-line message and no body. The message is a plain English statement of what changed, in the form `<verb> <id> [detail]`. No type prefix, no scope tag.

The fixed messages each script/skill produces:

| Action | Script / skill | Message |
| --- | --- | --- |
| Move a ticket between queues | `move.ts` | `move <id> <from> -> <to>` |
| Admit a ticket to in-progress | `setup-ticket.ts` | `admit <id> to in-progress` |
| Record a failure | `fail-ticket.ts` | `record failure for <id> (count <N>)` |
| Reset a ticket's failures | `reset-failures.ts` | `reset failures for <id>` |
| Create a new ticket | ticket-creating skills | `add <id>` |
| Per-turn narrative update | `pb:next` parent | `<turn summary>` (one line, the parent's summary of the turn) |
| Initial scaffold | bootstrap | `scaffold state repo` |

Rules:

- **One line only.** Every commit is `git commit -m <message>`; there is no description/body.
- **No prefix.** Messages start with the verb (`move`, `admit`, `add`, ...), not a `state:`/`feat:` tag.
- **Ticket-scoped where possible.** The message names the affected `<id>` so `git log --oneline` reads as a per-ticket audit trail.
- This format applies to the **state repo only**. Project-repo commits keep using `templates/commit-template/` unchanged.

## Issues
<Leave empty, populated later by plan:check>

## Steps

1. **Create the shared commit helper `scripts/commit-state.ts`.**
   - Export `type GitRunner = (cwd: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>` and a default `realGit` runner using `Bun.spawn(["git", "-C", cwd, ...args])` (mirror the runner already in `finalize-ticket.ts`).
   - Export `interface CommitResult { committed: boolean; reason?: "nothing-staged" | "not-a-repo" }`.
   - Export `class CommitError extends Error {}` for unexpected git failures (non-lock, non-"nothing to commit").
   - Export `async function commitState(stateDir: string, message: string, pathspecs?: string[], runGit: GitRunner = realGit): Promise<CommitResult>`:
     - First run `git rev-parse --is-inside-work-tree`. If it fails, return `{ committed: false, reason: "not-a-repo" }` (do **not** throw, an un-migrated state repo must not break the `pb:next` loop).
     - Run `git add -A -- <pathspecs>` (default pathspec `.` when none given).
     - Run `git commit -m <message>`. If the commit output indicates nothing to commit (stdout/stderr matches `/nothing to commit|no changes added/`), return `{ committed: false, reason: "nothing-staged" }`.
     - On success return `{ committed: true }`.
     - Any other non-zero git exit throws `CommitError` with the captured stderr.
   - Export `async function runGitWithLockRetry(...)` (or inline helper) that wraps a single git invocation: if the result is non-zero and stderr matches `/index\.lock|Unable to create .*\.lock|Another git process/`, sleep a short backoff (e.g. `attempt * 100ms`) and retry, up to ~10 attempts, then give up and return the last failed result. `commitState` routes its `add` and `commit` calls through this wrapper so parallel committers serialise on the shared index instead of failing.
   - Add a thin CLI `main(argv)`: usage `commit-state.ts <message> [pathspec...]`, `stateDir = process.cwd()`, guard that `tickets/` exists (same guard the other scripts use). Print `committed <short-sha>` on success, a clear skip line on `nothing-staged`, and a visible warning on `not-a-repo`. Map `CommitError` to a non-zero exit. Gate the CLI behind `if (process.argv[1] === __filename)` exactly like the other scripts.

2. **Auto-commit in `scripts/move.ts`.** In the CLI `main()` only (not the exported `move()` core, so unit tests stay commit-free), after a successful non-noop move, call `commitState(process.cwd(), `move ${id} ${result.from} -> ${result.to}`, [result.fromPath, result.toPath].map(rel))` where the pathspecs are made relative to `stateDir`. The `-A` add picks up both the deletion at the old path and the new directory (with any evidence/History the agent wrote before the move). Skip the commit on a noop move.

3. **Auto-commit in `scripts/setup-ticket.ts`.** In `main()` after `setupTicket` succeeds, call `commitState(stateDir, `admit ${id} to in-progress`, ["tickets/in-progress/" + id, "tickets/todo/" + id])`. (The worktree it creates lives in the *project* repo and is irrelevant to the state commit.) Do not commit inside the exported `setupTicket()`; the internal `move()` core call must not commit so unit tests stay clean.

4. **Auto-commit in `scripts/fail-ticket.ts`.** In `main()` after `recordFailure` succeeds, call `commitState(stateDir, `record failure for ${id} (count ${result.count})`, ["tickets/" + result.queue + "/" + id])`. Ticket-scoped so it captures the index.md bump (and any History note already written for this failure).

5. **Auto-commit in `scripts/reset-failures.ts`.** In `main()` after the reset succeeds, call `commitState(stateDir, `reset failures for ${id}`, ["tickets/" + queue + "/" + id])`.

6. **Leave `scripts/finalize-ticket.ts` unchanged for state commits.** It operates on the *project* repo (rebase/merge/worktree removal) and does not move the state directory; the agent's subsequent `move.ts <id> done` produces the state commit. Add a one-line comment in its header noting that the state-repo commit happens via the agent's follow-up `move.ts`, so a future reader does not add a redundant commit here.

7. **Update `scripts/CLAUDE.md`.** Add `commit-state.ts <message> [pathspec...]` to the helper list with a one-line description, and add a sentence stating that `move`, `setup-ticket`, `fail-ticket`, and `reset-failures` now commit their own state change (ticket-scoped, lock-safe) via `commit-state.ts`, while `finalize-ticket` does not (the follow-up `move` commits that transition).

8. **Add the audit-log rule to `process.md`.** In the **Queues** section (near the `move.ts` / `current-state.md` bullets), add a short paragraph: the state repo is a git repo and every significant change is committed so its history is an audit log. State it as: the mutation scripts commit automatically; for hand edits (a `current-state.md` update, a newly created ticket) the agent commits with `bun ../scripts/commit-state.ts "<message>" <pathspec>` immediately after; and because script commits are ticket-scoped, evidence and History notes written before a `move.ts` are captured by that move's commit (so they need no separate commit). Keep it tight (the file is the AI-facing concise reference).

9. **Expand the handbook claim in `handbook.md`.** Find the "Every change is committed, reviewable in `/pb:review`, and revertible" sentence (~line 620) and the surrounding paragraph, and replace the hand-wave with the real mechanism: the state repo is committed per significant change (auto by the scripts, by hand via `commit-state.ts` for free-form edits), giving a revertible audit log; this is distinct from the project-repo commits made in worktrees per the commit template. Add a short subsection if one fits the handbook's structure.

10. **Tighten `current-state.md` committing in `.claude/commands/pb/next.md`.**
    - Line ~26: the sub-agent state-change sentence currently ends "...add a History note to its `detail.md`, commit". Clarify it: the sub-agent's `move.ts` call is what commits its ticket's state transition (auto, ticket-scoped), and it writes evidence/History *before* the move so they ride in that commit; it must never run `commit-state.ts` against `current-state.md` (parent-only).
    - Step 3.2 (record state): after the parent updates `current-state.md`, add an explicit final action: `bun ../scripts/commit-state.ts "<turn summary>" current-state.md` so each turn's narrative update is its own commit. Make clear the parent is the sole committer of `current-state.md`.

11. **Add the commit step to the ticket-creating skills.** For each skill that writes a new ticket into `todo/` from a template, add a step: after writing the ticket directory, commit it with `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>`. Skills to update: `.claude/commands/pb/add.md`, `.claude/commands/pb/plan.md` (when it breaks a feature into tickets), `.claude/commands/pb/docs.md` (when it queues tickets), and `.claude/commands/pb/debug.md` (the Fix ticket spawned from a proven Debug, note this spawn happens inside a `pb:next` agent-review sub-agent, so the commit step belongs wherever the Fix ticket is created).

12. **Add the `current-state.md` commit step to skills that edit it by hand.** In `.claude/commands/pb/review.md` (approve/reject/defer transcribes notes and moves tickets, the `move.ts`/`reset-failures.ts` calls auto-commit, but any direct `current-state.md` edit needs `commit-state.ts current-state.md`) and any other skill that edits `current-state.md` directly, add the `commit-state.ts ... current-state.md` step after the edit. `pb:status` is read-only, confirm it makes no edits and add no commit there.

13. **`git init` the state repo in bootstrap.** In `.claude/commands/pb/bootstrap/new.md` (step 3, after copying `templates/state/`) and `.claude/commands/pb/bootstrap/existing.md` (the equivalent state-repo creation step), add: initialise the state repo as a git repo (`git init` in `state/`) and make an initial commit of the scaffolded contents (e.g. `scaffold state repo`). Note that all subsequent state changes are committed automatically (cross-reference the **Queues** audit-log paragraph in `process.md`).

14. **Note the audit log in `templates/state/CLAUDE.md`.** Add a sentence: this repo is a git repo whose history is an audit log of the process; every significant change is committed (automatically by the helper scripts, or via `commit-state.ts` for hand edits). Do not instruct anything that conflicts with `process.md`; keep it a pointer.

## Unit Tests

- **`scripts/commit-state.test.ts`** (new), calling the exported `commitState()` with an injected scripted `GitRunner` (the established pattern, no real git):
  - Commits with a default pathspec (`.`) when none supplied: asserts the `add -A -- .` then `commit -m <message>` calls in order.
  - Commits with explicit pathspecs: asserts `add -A -- <p1> <p2>`.
  - Returns `{ committed: false, reason: "not-a-repo" }` when the `rev-parse --is-inside-work-tree` runner result is non-zero, and makes no `add`/`commit` calls.
  - Returns `{ committed: false, reason: "nothing-staged" }` when the `commit` runner reports nothing to commit, without throwing.
  - Throws `CommitError` on an unexpected non-zero git exit (not a lock, not nothing-to-commit).
  - Lock retry: a runner that returns an `index.lock` failure on the first N attempts then succeeds results in a successful commit (assert the retry count); a runner that always returns the lock error eventually gives up and surfaces a failure.
- No new unit tests are needed for `move`/`setup-ticket`/`fail-ticket`/`reset-failures` core functions, their commit happens in the CLI `main()` wrapper, which the existing unit tests deliberately do not exercise. Add a brief comment in each modified `main()` pointing to the smoke test that covers the commit.

## Smoke Tests

- **`scripts/smoke-commit-state.sh`** (new): create a throwaway git repo with a `tickets/` dir, write a file, run `commit-state.ts "msg" <path>`, assert exit 0 and that `git log` shows the commit touching only that path; run it again with no changes and assert the `nothing-staged` skip (exit 0, no new commit); run it in a non-git directory and assert the `not-a-repo` skip is reported without a hard failure.
- **Extend `scripts/smoke-move.sh`**: after a move in a throwaway git-backed state repo, assert a new commit exists whose message matches `move <id> ...` and whose diff is scoped to the ticket's from/to paths.
- **Extend `scripts/smoke-setup-ticket.sh`**: assert an admit produces a `admit <id> to in-progress` commit.
- **Extend `scripts/smoke-fail-ticket.sh`**: assert a failure produces a `record failure for <id> (count N)` commit.
- **Extend `scripts/smoke-reset-failures.sh`**: assert a reset produces a `reset failures for <id>` commit.
- (Smoke tests that don't currently init a git repo must `git init` the throwaway state repo and set a throwaway `user.email`/`user.name` so commits succeed in CI.)

## Verify

- From `scripts/`: run `bun run test` (all Jest unit tests) and confirm green, including the new `commit-state.test.ts`.
- From `scripts/`: run `bun run smoke` (all smoke scripts) and confirm green, including the new `smoke-commit-state.sh` and the commit assertions added to the existing smoke scripts.
- Type/compile check: run the project's TypeScript check (`bunx tsc --noEmit` against `scripts/tsconfig.json`, or the configured lint/format command) and confirm no errors in the new and modified scripts.
- `grep` the modified skills and docs to confirm: every ticket-creating skill calls `commit-state.ts`; `next.md` commits `current-state.md` via the parent only; both bootstrap skills `git init` the state repo. Confirm `finalize-ticket.ts` was *not* given a state commit.

## Human Verification

- Run a real `pb:next` turn against a project whose state repo has been `git init`ed, then `git -C state log --oneline --stat` and confirm: each ticket's stage transitions appear as separate ticket-scoped commits, the per-turn `current-state.md` update is its own commit, and no commit mixes two different tickets' directories.
- Trigger a deliberate failure (or rejection) and confirm the `record failure` / `reset failures` commits appear with the expected messages and counts.
- Run `pb:bootstrap:new` (or `:existing`) on a scratch project and confirm `state/` is a git repo with an initial scaffold commit.

## Notes

- **Why commits live in the CLI `main()`, not the exported core functions:** the existing unit tests call the core functions (`move()`, `recordFailure()`, etc.) directly against temp fixtures and must stay side-effect-free. Putting the commit in `main()` keeps unit tests clean and lets the smoke tests (which run the real CLI against throwaway git repos) cover the commit path.
- **Concurrency:** `pb:next` runs up to 10 sub-agents in parallel against the single shared state-repo index. Ticket-scoped pathspecs keep each commit's contents clean; the lock-retry loop in `commit-state.ts` is what makes concurrent `git add`/`commit` safe against `index.lock` contention. This preserves the existing rule that only the parent writes/commits `current-state.md`.
- **`not-a-repo` is a soft skip, not an error:** existing state repos created before this change are not git repos. The helper must skip-with-warning rather than crash so the loop keeps working; the developer migrates by running `git init` in `state/` once (call this out in the report and consider a one-line note in `process.md`).
- **Open question:** whether to also commit large evidence artefacts (screenshots, transcripts), current plan commits them as part of the ticket-scoped move commit, which is the simplest and keeps the audit log complete. Revisit only if state-repo size becomes a problem.
- This is strictly about the **state** repo. Project-repo commits remain unchanged: they happen in worktrees per `templates/commit-template/`.
