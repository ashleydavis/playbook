# scripts/

This directory is a small, self-contained Bun project that supports the Playbook process. It holds the only executable code in the repo: the TypeScript helpers that drive the work-item queues (`move.ts`, `next-items.ts`, `setup-work-item.ts`, `finalize-work-item.ts`), their Jest unit tests, and their bash smoke tests.

The helpers:

- `move.ts <id> <queue>`: move a work-item directory between queues.
- `next-items.ts`: report the items each queue the loop drives should act on.
- `setup-work-item.ts <id>`: admit an item: move `todo/<id>` to `in-progress/` and create its worktree against `project/` at `project/worktrees/<id>` (on a new branch `worktrees/<id>` at the project's current commit). This is the only supported way to create a work-item worktree; never run `git worktree` by hand.
- `finalize-work-item.ts <id>`: merge an item's worktree back into the project's current branch (rebase, then fast-forward), remove the worktree, and delete its `worktrees/<id>` branch. On a merge conflict it aborts cleanly, leaves the worktree intact, and exits 2 so the agent can resolve the conflict, commit, and re-run.
- `fail-work-item.ts <id>`: increment the item's `**Failures:**` count in its `index.md` and print the new count. Called on every failure (any source except a human rejection); three failures park the item in `blocked/`.
- `reset-failures.ts <id>`: reset the item's `**Failures:**` count to 0. Called by `pb:review` when a human rejects an item back to `todo/`, so rework starts with a clean slate (a rejection is not a failure).
- `reset-loop.ts`: unwind an interrupted or abandoned run back to a clean slate. Moves every `in-progress/` item back to `todo/`, then force-removes every worktree under `project/worktrees/`, deletes its `worktrees/<id>` branch, and prunes stale worktree records. Discards unmerged work; does not merge. Called by `pb:reset`.
- `commit-state.ts <message> [pathspec...]`: commit a change in the state repo (item-scoped and lock-safe) so its git history is an audit log. Used by agents for free-form edits (a `current-state.md` update, a newly created work item); skips with a warning if the state repo is not a git repo.

`move`, `setup-work-item`, `fail-work-item`, and `reset-failures` now commit their own state change automatically (item-scoped, lock-safe) via `commit-state.ts`, so concurrent `pb:next` sub-agents never produce a muddled cross-item commit. `finalize-work-item` does not commit the state repo: the agent's follow-up `move <id> done` commits that transition.

It is deliberately kept separate from the scaffolded `project/` so the Playbook's own tooling and its Jest run never sweep up an app's tests.

## Working here

- It's a Bun project. Use `bun` and `bun run`, never `npx`.
- Install deps: `bun install` (from this directory).
- Unit tests: `bun run test` (Jest via ts-jest).
- Smoke tests: `bun run smoke`.
- The scripts are `#!/usr/bin/env bun` and are run directly, e.g. `bun ../scripts/move.ts <id> <queue>` from `state/`.

The project config (`package.json`, `tsconfig.json`, `jest.config.js`, `bun.lock`, `node_modules/`) lives here, not at the repo root.
