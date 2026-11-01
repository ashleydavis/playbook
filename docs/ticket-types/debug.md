# Debug stages

A Debug ticket is a throwaway investigation: it finds the root cause of a bug and proves it. Any amount of experimentation on the code is allowed (logging, instrumentation, commenting things out) and none of it is kept. It makes no commit, runs no compile or lint, and never goes to `human-review/` or the merge train. See [README.md](README.md) for the rules every stage follows.

## Investigate

- Sets up the worktree from `project/docs/setup.md`. If setup fails it stops and returns the error: that is an environment problem.
- Creates `evidence/implementation-N/` (N one more than the highest existing).
- Reads the error in full, reproduces the failure consistently and captures the reproduction.
- Reviews recent changes and traces the data flow backward to where the problem starts.
- Finds similar working code in the codebase, compares it with the broken code line by line and lists every difference and the assumptions each side makes.
- States a specific theory of the root cause and tests it with throwaway experiments, one variable at a time. Confirms it, or discards it and forms a new one.
- When three or more theories fail, records in History that the design is likely wrong rather than a single line, and keeps going.
- Writes the root cause, the causal chain and the evidence paths into `detail.md`.
- Writes no fix and makes no commit.
- Never runs `git`.

## Prove root cause

- Re-runs the reproduction and confirms the root cause is proven, not merely asserted: the evidence supports every link of the causal chain and the conclusion follows from it.
- Closes any gap with further experiments of its own, captured to the same `evidence/implementation-N/`, and corrects `detail.md` to match.
- Discards the worktree's code changes.
- Concludes the ticket with `bun ../scripts/conclude-debug.ts <id>` (from `state/`), which moves it to `done/` and closes its worktree. Never uses `move.ts` for this.
- Creates a `Fix` ticket in `todo/` with an ID from `bun ../scripts/next-id.ts <prefix>` (from `state/`, without `--debug`). It carries the proven root cause and the failing reproduction, links back to the Debug ticket, copies its `**Platforms:**` line and has the acceptance criteria in The Fix ticket in the [pb:debug](../../.claude/commands/pb/debug.md) skill.
- Commits the Fix ticket to the state repo with `bun ../scripts/commit-state.ts "add <fix-id>" tickets/todo/<fix-id>` (from `state/`).
- Never runs `git`.
