# Route all project-repo commits through a commit-project.ts script

## Overview

Today the only thing that authors a commit in the **project** repo is the `pb:next` implement-stage sub-agent, which runs raw `git add` / `git commit` by hand "per the commit template" inside its ticket worktree. There is no single, tested commit mechanism for the project repo the way `commit-state.ts` is for the state repo. This plan adds `scripts/commit-project.ts`: one script every project-repo commit goes through. The model composes the full commit message itself (subject + body + `Type:` / `Ticket:` trailers, per `templates/commit-template/commit-template.txt`) and passes it to the script on stdin; the script stages the worktree's changes and makes the commit, lock-safe and consistently, then reports the new SHA. The generic git plumbing currently living in `lib/commit-state.ts` (the git runner, lock-retry, and the add+commit core) is shared by both the state and project commit paths, so it is extracted into a neutral `lib/git.ts` per the repo's `lib/` rule (a symbol lives in `lib/` once two non-test files import it). The docs and skills that describe project commits are updated to point at the new script.

## Issues
<!-- Populated later by plan:check. -->

## Steps

1. **Create `scripts/lib/git.ts`** by moving the repo-agnostic git plumbing out of `scripts/lib/commit-state.ts`. Move verbatim (logic unchanged): the `GitRunner` type, the `CommitResult` interface, the `CommitError` class, the `realGit` const, the `runGitWithLockRetry` function, and the internal `LOCK` / `NOTHING` regexes and `sleep` helper. Then move the body of `commitState()` into a repo-neutral function:
   - `export async function commitRepo(dir: string, message: string, pathspecs?: string[], runGit?: GitRunner): Promise<CommitResult>` — identical logic to the current `commitState` (rev-parse work-tree check → `not-a-repo`; `git add -A -- <specs|.>` with lock-retry; `git commit -m <message>` with lock-retry; `nothing to commit` → `nothing-staged`; other non-zero → throw `CommitError`). The `message` may be multi-line; it is passed as a single `-m` argument, which preserves embedded newlines, so a full commit-template body commits as subject + body with no extra handling.
   - Add a file header comment explaining this is the shared git plumbing for both `commit-state.ts` (state repo) and `commit-project.ts` (project worktrees).

2. **Rewrite `scripts/lib/commit-state.ts` as a thin re-export layer** so its existing importers do not change. It should: `import { commitRepo, type GitRunner, type CommitResult, CommitError, realGit, runGitWithLockRetry } from "./git";` then `export const commitState = commitRepo;` and re-export the shared symbols (`export { CommitError, realGit, runGitWithLockRetry } from "./git";` and `export type { GitRunner, CommitResult } from "./git";`). Keep the existing module doc comment but trim it to say the state-repo specifics now wrap `commitRepo`. This keeps every current importer working unchanged: `scripts/commit-state.ts` (imports `CommitError, commitState, realGit`), and `move.ts` / `fail-ticket.ts` / `reset-failures.ts` / `set-priority.ts` / `setup-ticket.ts` / `merge-ticket.ts` (import `commitState`).

3. **Create `scripts/commit-project.ts`** (the new CLI, `#!/usr/bin/env bun`), mirroring the shape of `scripts/commit-state.ts`:
   - Usage comment: run from inside a ticket worktree (`project/worktrees/<id>`); pipe the full commit-template message on stdin, e.g. `bun ../../../scripts/commit-project.ts <<'EOF' … EOF`. Optional positional args are extra pathspecs (default: stage everything in the worktree).
   - `main(argv)`: read the message with `const message = (await Bun.stdin.text())`. If it is empty/whitespace-only, print `usage: commit-project.ts < message-on-stdin [pathspec...]` to stderr and `process.exit(1)`. Treat `argv` as pathspecs.
   - Resolve `const dir = process.cwd();` (the worktree). Call `commitRepo(dir, message, pathspecs)`.
   - On `committed`: read the short SHA (`realGit(dir, ["rev-parse", "--short", "HEAD"])`) and print `committed <sha>`.
   - On `nothing-staged`: print `nothing to commit (skipped)` and exit 0 (matches `commit-state.ts`).
   - On `not-a-repo`: this is a hard error for the project repo (a worktree is always in a git repo), so print an error and `process.exit(1)` (differs from `commit-state.ts`, which soft-skips for pre-migration state repos).
   - Catch `CommitError` → print message, exit 1.
   - Guard the CLI with `if (process.argv[1] === __filename)` like the other scripts so tests can import it without running it.
   - Import from the new lib: `import { CommitError, commitRepo, realGit } from "./lib/git";`.

4. **Move and extend the unit tests.** Rename `scripts/lib/commit-state.test.ts` → `scripts/lib/git.test.ts`, update its imports to `./git`, and rename the `describe("commitState()")` block to `describe("commitRepo()")` calling `commitRepo`. Keep all existing cases (default pathspec, explicit pathspecs, nothing-staged, not-a-repo, `CommitError` on unexpected failure, `runGitWithLockRetry` lock-then-success retry). Add one new case: **a multi-line message is passed through to `git commit` intact** — assert the `commit` call's args equal `["commit", "-m", "<id>: subject\n\nbody line\n\nType: Tweak\nTicket: <id>"]` using the scripted `GitRunner`. (CLIs remain unit-untested by convention; the `commit-project.ts` CLI is covered by its smoke test.)

5. **Create `scripts/smoke-commit-project.sh`** modelled on `scripts/smoke-commit-state.sh`, exercising the real CLI with real git against a throwaway repo **with a linked worktree** (since the project path commits inside a worktree):
   - Build a temp git repo `proj` (init, set throwaway `user.email`/`user.name`, an initial commit). Create a linked worktree `proj/worktrees/t-1` on a new branch (`git -C proj worktree add worktrees/t-1 -b worktrees/t-1`).
   - Make a change in the worktree, then from inside the worktree run `bun <path>/commit-project.ts` with a **multi-line** message on stdin (HEREDOC). Assert: exit 0; `git -C proj/worktrees/t-1 log -1 --pretty=%s` equals the subject line; `git … log -1 --pretty=%b` contains the body and the `Ticket:` trailer; the commit is on the worktree's branch.
   - Second run with no further change → asserts `nothing to commit` and exit 0, no new commit.
   - Run with an **empty** stdin message → asserts non-zero exit and a usage message.
   - Print PASS/FAIL and clean up via a trap, exactly like the existing smoke script.

6. **Wire the smoke test into `scripts/package.json`.** Append `&& bash smoke-commit-project.sh` to the `smoke` script chain (next to `smoke-commit-state.sh`).

7. **Update `scripts/CLAUDE.md`.** In the helpers list, add a `commit-project.ts` entry (commit a change in a project worktree; message supplied on stdin per the commit template; lock-safe; prints the short SHA; hard-errors if not in a git repo). In the **Shared library** section, add `lib/git.ts` (the shared git runner, `runGitWithLockRetry`, `CommitError`, and `commitRepo`, imported by both `commit-state` and `commit-project`) and note that `lib/commit-state.ts` is now a thin wrapper/re-export over `lib/git.ts`. Add a sentence stating the invariant: **every project-repo commit goes through `commit-project.ts`; never `git commit` the project by hand.**

8. **Update `.claude/commands/pb/next.md`** (the implement stage is the sole caller):
   - Line ~134 (implement sub-agent): replace "It commits only the changes that implement the ticket, per the commit template" with: it composes the commit message per `templates/commit-template/commit-template.txt` and commits via `bun ../../../scripts/commit-project.ts` run from its worktree, piping the filled-in message on stdin; it never runs `git commit` by hand.
   - Line ~67 ("Leave the project worktree clean") bullet: keep the clean-tree requirement, and add that the ticket's single commit is made with `commit-project.ts`.

9. **Update `docs/process.md` "Commits" section** (~line 252). Alongside the existing one-template sentence, state the mechanism split parallel to the state-repo audit-log paragraph: project-repo commits are made by the implement-stage sub-agent inside its worktree via `bun ../../../scripts/commit-project.ts`, with the model composing the message per the commit template and passing it on stdin; the state repo uses `commit-state.ts`. Note that `merge-ticket.ts` only replays existing commits (cherry-pick) and fast-forwards, so it authors no new project commit and does not use this script.

10. **Update `handbook.md`** at the two project-commit references:
    - ~line 533 ("The `/pb:next` sub-agents make the commits using this template") → add that they do so through `scripts/commit-project.ts` (message piped on stdin), the single project-commit path.
    - ~line 715 (Project repo bullet under Repository Structure) → note code changes are committed in the worktree via `commit-project.ts`.

11. **Add a one-line pointer comment to `templates/commit-template/commit-template.txt`** at the top (a `#` comment): the filled-in message is passed to `scripts/commit-project.ts` on stdin; do not `git commit` the project by hand. (Comment lines beginning `#` are stripped by git, so this does not pollute real commit messages.)

12. **Sweep for stragglers.** `grep -rniE "git commit|git add" .claude docs handbook.md templates` (excluding `docs/plans/`) and confirm no remaining instruction tells an agent to commit the project repo by hand; convert any found to use `commit-project.ts`. Leave state-repo `commit-state.ts` usages and `merge-ticket.ts`'s cherry-pick/fast-forward untouched.

## Unit Tests

- `scripts/lib/git.test.ts` (renamed from `commit-state.test.ts`): `commitRepo()` — default pathspec, explicit pathspecs, `nothing-staged`, `not-a-repo`, `CommitError` on unexpected git failure; `runGitWithLockRetry()` — retries on lock then succeeds; **new:** multi-line message passed to `git commit -m` intact.
- No new unit test for the `commit-project.ts` CLI itself (CLIs are smoke-tested, per the repo convention noted in `commit-state.ts`).

## Smoke Tests

- `scripts/smoke-commit-project.sh` (new): real git + real CLI against a throwaway repo with a linked worktree — multi-line commit lands on the worktree branch with correct subject/body/`Ticket:` trailer; nothing-staged skip exits 0 with no new commit; empty stdin message exits non-zero. Added to the `smoke` chain in `scripts/package.json`.
- Existing `scripts/smoke-commit-state.sh` must still pass unchanged (proves the `lib/commit-state.ts` re-export wrapper preserves behaviour).

## Verify

- From `scripts/`: `bun install` (if needed), then `bun run test` — all Jest suites pass, including the renamed `git.test.ts` with the new multi-line case.
- From `scripts/`: `bun run smoke` — the full chain passes, including the new `smoke-commit-project.sh` and the unchanged `smoke-commit-state.sh`.
- Type-check the scripts project: `bunx tsc --noEmit -p scripts/tsconfig.json` (or the project's existing compile check) is clean.
- `grep -rn "from \"./commit-state\"" scripts` and `grep -rn "commitState" scripts` confirm the six existing importers still resolve (no import errors at test time proves this too).
- `grep -rniE "git commit|git add" .claude docs handbook.md templates | grep -v "docs/plans/"` shows no by-hand project-commit instructions remain.
- `grep -rn "commit-project" .claude/commands/pb/next.md docs/process.md handbook.md scripts/CLAUDE.md` shows the new mechanism is documented in each.

## Notes

- **Scope: one authoring site.** Research confirmed the implement stage is the only place a project-repo commit is authored. `merge-ticket.ts` cherry-picks existing commits and fast-forwards (no new message), and `pb:docs` / `pb:customize` write files into `project/` but never commit them. So only `next.md` changes behaviour; `merge-ticket.ts` is deliberately left alone.
- **`pb:docs` / `pb:customize` leave project edits uncommitted today.** That is a pre-existing gap, out of scope here. The invariant added in step 7/9 ("every project commit goes through `commit-project.ts`") governs them if they are ever made to commit, but this plan does not change their behaviour.
- **`pb:plan:break` / `pb:todo:break` need no edit.** The plan-archival move (`plan:break`) and any todo-item removal are committed by the implementing ticket's implement-stage commit, which now uses `commit-project.ts` automatically. The unresolved `pb:todo:break` "remove + commit at break time" question is independent of this plan; if that path is ever made to commit, it must also use `commit-project.ts`.
- **Why extract `lib/git.ts` rather than duplicate or import from `lib/commit-state`.** The shared plumbing now has two importers (state and project), which is exactly the repo's stated bar for putting a symbol in `lib/`. Importing git plumbing from a module named `commit-state` into the project path would be a naming smell; a neutral `lib/git.ts` is the rule-aligned home. The wrapper/re-export keeps churn off the six existing `commitState` callers and the existing CLI.
- **Considered simpler alternative:** copy `commit-state`'s body into a standalone `commit-project.ts` with duplicated git plumbing (no `lib/git.ts`). Rejected: it duplicates the lock-retry logic and violates the `lib/` rule, and the two copies would drift.
- **Message transport is stdin, not a positional arg.** A filled commit-template body is multi-paragraph and contains characters that are painful to quote as a shell argument; stdin (HEREDOC) is already the familiar pattern (the same `git commit -F -` shape used elsewhere). The model composes the whole message and pipes it in.
- **Invocation path.** The implement sub-agent's cwd is its worktree at `project/worktrees/<id>`, so the script is `../../../scripts/commit-project.ts` from there (three levels up to the playbook root). Bun resolves the script's imports relative to the script file, and its deps from `scripts/node_modules`, so running it from the worktree works the same way `commit-state.ts` runs from `state/`.
- **No template-format validation in the script (deliberately minimal).** The script enforces only a non-empty message; it does not lint for `Type:` / `Ticket:` trailers. Keeping it a pure mechanism (like `commit-state.ts`) avoids coupling the script to the template and keeps it usable for any project commit. Stronger validation could be added later if by-hand mistakes prove common.
- **Optional follow-up (not in scope):** `merge-ticket.ts` defines its own local `realGit`; it could later import `realGit`/`GitRunner` from `lib/git.ts` to remove that duplication. Left out to keep this change tightly scoped.
