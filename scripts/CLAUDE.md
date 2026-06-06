# scripts/

This directory is a small, self-contained Bun project that supports the Playbook process. It holds the only executable code in the repo: the TypeScript helpers that drive the work-item queues (`move.ts`, `next-items.ts`, `setup-work-item.ts`, `finalize-work-item.ts`), their Jest unit tests, and their bash smoke tests.

The helpers:

- `move.ts <id> <queue>`: move a work-item directory between queues.
- `next-items.ts`: report the items each queue the loop drives should act on.
- `setup-work-item.ts <id>`: admit an item: move `todo/<id>` to `in-progress/` and create its worktree against `project/` at `worktrees/<id>` (detached at the project's current commit). This is the only supported way to create a work-item worktree; never run `git worktree` by hand.
- `finalize-work-item.ts <id>`: merge an item's worktree back into the project's current branch (rebase, then fast-forward) and remove the worktree. On a merge conflict it aborts cleanly, leaves the worktree intact, and exits 2 so the agent can resolve the conflict, commit, and re-run.

It is deliberately kept separate from the scaffolded `project/` so the Playbook's own tooling and its Jest run never sweep up an app's tests.

## Working here

- It's a Bun project. Use `bun` and `bun run`, never `npx`.
- Install deps: `bun install` (from this directory).
- Unit tests: `bun run test` (Jest via ts-jest).
- Smoke tests: `bun run smoke`.
- The scripts are `#!/usr/bin/env bun` and are run directly, e.g. `bun ../scripts/move.ts <id> <queue>` from `state/`.

The project config (`package.json`, `tsconfig.json`, `jest.config.js`, `bun.lock`, `node_modules/`) lives here, not at the repo root.
