# Work stages

The stages for a Work ticket, a Fix ticket and every other ticket type that has no file of its own. See [README.md](README.md) for the rules every stage follows.

Every stage here also makes failing tests pass by fixing the code or the tests properly. It never skips, deletes, loosens or comments out a test, and never works around a failure.

## Dev

- Sets up the worktree from `project/docs/setup.md`. If setup fails it stops and returns the error: that is an environment problem.
- Creates `evidence/implementation-N/` (N one more than the highest existing).
- Resolves every unticked issue in the ticket's `## Issues` section and ticks its box. On a ticket the developer rejected, it changes only what resolves those issues.
- Implements the acceptance criteria, following every rule the rules check stage checks.
- Makes no change the ticket does not need.
- Writes unit tests for 100% coverage of every source file the branch adds or changes, plus smoke tests, e2e tests or both for the behaviour.
- Updates the docs the change affects, ticking the matching acceptance criteria in the spec and testing manual where the project keeps them.
- Captures the UI screenshots and writes `acceptance-check.md` (see Verification and Evidence).
- Stops only when every test passes.
- Does not commit.

## Test

- Runs every check the project defines (compile, lint, format, unit, smoke, e2e and any other).
- Fixes every failure properly.
- Stops only when every check legitimately passes.
- Does not commit.

## Rules check

- Checks every rule, one by one, in each file in `project/docs/rules/`, every `CLAUDE.md` in a directory the branch touches, `documentation.md` and each global coding rule file that applies to this project, against every file the branch adds or changes, shell scripts and docs included.
- Checks unit test coverage is 100% for every source file the branch adds or changes, including files no test imports. Smoke tests never count.
- Checks every change is needed by the ticket, and removes any that is not (committed evidence-collection code especially).
- Fixes every breach.
- Runs every test and stops only when all pass.
- Does not commit.

## Commit

- Runs every check one final time.
- If any fails, fixes it properly and runs every check again until all pass.
- Checks the commit title and description against the commit template and the rules, because a commit is never amended or rewritten.
- Commits only the changes that implement the ticket, in one commit. If the pre-commit hook refuses it, fixes the fault and commits again.
- Leaves `git status --porcelain` in the worktree empty.
- Moves the ticket from `in-progress/` to `human-review/`.
