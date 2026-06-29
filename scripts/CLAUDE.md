# scripts/

This directory is a small, self-contained Bun project that supports the Playbook process. It holds the only executable code in the repo: the TypeScript helpers that drive the ticket queues (`move.ts`, `next-tickets.ts`, `setup-ticket.ts`, `merge-ticket.ts`), their Jest unit tests, and their bash smoke tests.

The helpers:

- `move.ts <id> <queue>`: move a ticket directory between queues (`backlog/` is a valid side pen).
- `next-tickets.ts`: report the tickets each queue the loop drives should act on (`todo/` sorted by priority then ID).
- `board-tickets.ts`: report the board for `pb:board`: every queue and side pen with its true ticket count plus up to 5 tickets to display (id, description, dependencies, failures, priority), and a `truncated` flag when the queue holds more than 5.
- `set-priority.ts <id> <priority>`: insert or replace `**Priority:**` on a ticket (any queue except `done/` and `aborted/`).
- `format-ticket-selection.ts`: format numbered ticket selection menus and resolve developer input. Skills that ask the developer to pick ticket(s) (`pb:unblock`, `pb:promote`, `pb:rank`, `pb:review`) must call this script; see `docs/ticket-selection.md`. For `pb:review` it renders from the review snapshot and marks a row actioned (`--mark <id> --outcome <text>`), rebuilding the snapshot when it is stale (`--max-age`); it reads the snapshot from the fixed default location `start-review.ts` writes, so the skill never passes a path.
- `start-review.ts`: start a `pb:review` session by building the **review snapshot**. Snapshots `human-review/` into a temporary, git-ignored JSON file (a fixed default location `format-ticket-selection.ts` reads back on its own) that is the source of truth for the review checklist (rows, fixed numbers). It confirms the snapshot was built without printing its path, and does not render the menu; `format-ticket-selection.ts` is the single render path for both the first display and every reprint. See `docs/ticket-selection.md`.
- `review-snapshot.ts`: the review-snapshot helpers used by a single caller each: resolve the default path, read the snapshot back, test staleness, and mark a row actioned. The shared builders (snapshot, build, write) live in `lib/review-snapshot.ts`.
- `ticket-card.ts <id> [--queue human-review]`: CLI that gathers and prints one ticket's render card (title, changed files, docs changed, latest evidence pass, test results, screenshot paths, tailored inspect menu) on demand, when `pb:review` selects the ticket. Best-effort: every part degrades rather than throwing.
- `setup-ticket.ts <id>`: admit a ticket: move `todo/<id>` to `in-progress/` and create its worktree against `project/` at `project/worktrees/<id>` (on a new branch `worktrees/<id>` at the project's current commit). This is the only supported way to create a ticket worktree; never run `git worktree` by hand. The worktree's own `.git` link is written relative (via `lib/relative-worktree.ts`) so the repo survives being shared across machines (NFS) at different mount points; the admin back-link stays absolute, as git 2.43.0 requires for worktree management.
- `merge-ticket.ts <build|land|discard> ...`: merge approved tickets as one **train** so the post-merge checks run once on the combined result, not once per ticket. `build <id> [<id> ...]` creates a throwaway `merge-<random>` train worktree and cherry-picks each ticket's commits onto it (printing JSON with the `trainId`, `included`, and `noops`); on a conflict it aborts that pick, leaves the clean ones, and exits 2 naming the offending ticket. `land <trainId> <id> ...` fast-forwards the project branch to the train, moves each ticket from `merge-queue/` to `done/` (committing that transition), and tears down the train and ticket worktrees. `discard <trainId>` tears down a failed train (leaving the ticket worktrees) so the agent can rebuild a smaller one while bisecting. Never run `git worktree` or the merge by hand. The train worktree's own `.git` link is written relative (via `lib/relative-worktree.ts`) so a shared (NFS) repo survives a mount-point change; the admin back-link stays absolute, as git 2.43.0 requires.
- `fail-ticket.ts <id>`: increment the ticket's `**Failures:**` count in its `index.md` and print the new count. Called on every failure (any source except a human rejection); three failures park the ticket in `blocked/`.
- `reset-failures.ts <id>`: reset the ticket's `**Failures:**` count to 0. Called by `pb:review` when a human rejects a ticket back to `todo/`, so rework starts with a clean slate (a rejection is not a failure).
- `reset-loop.ts`: unwind an interrupted or abandoned run back to a clean slate. Moves every `in-progress/` ticket back to `todo/`, then force-removes every worktree under `project/worktrees/`, deletes its `worktrees/<id>` branch, and prunes stale worktree records. Discards unmerged work; does not merge. Called by `pb:reset`. If a worktree was created on another machine (absolute links pointing nowhere on this host), `git worktree remove` can fail; run `repair-worktrees.ts` first to relativize the links, then reset.
- `repair-worktrees.ts`: one-shot migration/recovery. Relativizes the link files of every worktree under `project/worktrees/`, so worktrees created before relative links existed, or created on another machine at a different mount point, resolve again on this host. Best-effort and idempotent; commits nothing (worktrees are gitignored).
- `commit-state.ts <message> [pathspec...]`: commit a change in the state repo (ticket-scoped and lock-safe) so its git history is an audit log. Used by agents for free-form edits (e.g. a newly created ticket); skips with a warning if the state repo is not a git repo.

`move`, `setup-ticket`, `fail-ticket`, `reset-failures`, `set-priority`, and `merge-ticket land` now commit their own state change automatically (ticket-scoped, lock-safe) via `commit-state.ts`, so concurrent `pb:next` sub-agents never produce a muddled cross-ticket commit. `merge-ticket land` commits the `merge-queue/` → `done/` moves of the tickets it lands; its `build` and `discard` touch only the project repo and commit nothing.

It is deliberately kept separate from the scaffolded `project/` so the Playbook's own tooling and its Jest run never sweep up an app's tests.

## Shared library (`lib/`)

`lib/` holds the code imported by two or more scripts, extracted so each CLI stays a thin wrapper around its own `main()`. A symbol lives in `lib/` only when at least two distinct non-test files import it; code used by one place stays with that place. Each lib module has its own `lib/<name>.test.ts`.

- `lib/commit-state.ts`: `commitState()` plus the lock-safe git runner it uses. The `commit-state.ts` CLI wraps it; `move`, `fail-ticket`, `reset-failures`, `set-priority`, `setup-ticket`, and `merge-ticket` import it.
- `lib/move.ts`: `move()`, `QUEUES`, and the `MoveResult`/`MoveError` contract. The `move.ts` CLI wraps it; `fail-ticket`, `set-priority`, `setup-ticket`, `reset-loop`, and `merge-ticket` import it.
- `lib/ticket-meta.ts`: shared parsers for `**Priority:**` and `**Depends on:**`, plus the ticket sort order (`compareTickets`). Imported by `board-tickets`, `next-tickets`, `review-snapshot`, and `format-ticket-selection`.
- `lib/board-tickets.ts`: `readTicket()` and the description helpers it uses. Imported by `board-tickets`, `review-snapshot`, and `format-ticket-selection`.
- `lib/review-snapshot.ts`: the review-snapshot builders (`snapshotQueue`, `buildSnapshot`, `writeSnapshot`). Imported by `start-review` and `format-ticket-selection`.
- `lib/relative-worktree.ts`: `computeRelativeLinks()` (pure: the contents for a worktree's two link files) and `relativizeWorktree()` (best-effort, idempotent IO that rewrites them: the worktree's own `.git` to a path relative to the worktree, the admin back-link to this machine's absolute path). Imported by `setup-ticket`, `merge-ticket`, and `repair-worktrees` so the worktree's `.git` survives a shared (NFS) repo being mounted at different paths on different machines. Installed git is 2.43.0, which lacks native relative-path worktrees (those arrived in 2.48) and whose `worktree remove`/`list` require an absolute back-link, so we relativize only the worktree's own `.git` ourselves and keep the back-link absolute.

## Working here

- It's a Bun project. Use `bun` and `bun run`, never `npx`.
- Install deps: `bun install` (from this directory).
- Unit tests: `bun run test` (Jest via ts-jest).
- Smoke tests: `bun run smoke`.
- The scripts are `#!/usr/bin/env bun` and are run directly, e.g. `bun ../scripts/move.ts <id> <queue>` from `state/`.

The project config (`package.json`, `tsconfig.json`, `jest.config.js`, `bun.lock`, `node_modules/`) lives here, not at the repo root.
