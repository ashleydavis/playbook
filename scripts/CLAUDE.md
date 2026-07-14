# scripts/

This directory is a small, self-contained Bun project that supports the Playbook process. It holds the only executable code in the repo: the TypeScript helpers that drive the ticket queues (`move.ts`, `next-tickets.ts`, `setup-ticket.ts`, `merge-ticket.ts`), their Jest unit tests, and their bash smoke tests.

## Git version requirement

The worktree tooling needs **git >= 2.48**, the first release with native relative-path worktrees (`git worktree add --relative-paths` and the `worktree.useRelativePaths` config). Older git wrote absolute paths into a worktree's link files, so a repo shared across machines (an NFS mount at a different path in a VM than on the host) had worktrees that resolved nowhere. Every script that creates or manages a worktree calls `assertGitVersion()` (`lib/git-version.ts`) first and exits with a clear message on older git, rather than producing broken worktrees. `install-prereqs.sh` installs the latest git (via the git-core PPA) so a fresh VM meets this.

The helpers:

- `move.ts <id> <queue>`: move a ticket directory between queues (`backlog/` is a valid side pen).
- `next-tickets.ts`: report the tickets each queue the loop drives should act on (`todo/` sorted by priority then ID).
- `board-tickets.ts`: report the board for `pb:board`: every queue and side pen with its true ticket count plus up to 5 tickets to display (id, description, dependencies, failures, priority), and a `truncated` flag when the queue holds more than 5.
- `set-priority.ts <id> <priority>`: insert or replace `**Priority:**` on a ticket (any queue except `done/` and `aborted/`).
- `format-ticket-selection.ts`: format numbered ticket selection menus and resolve developer input. Skills that ask the developer to pick ticket(s) (`pb:unblock`, `pb:promote`, `pb:rank`, `pb:review`) must call this script; see `docs/ticket-selection.md`. For `pb:review` it renders from the review snapshot and marks a row actioned (`--mark <id> --outcome <text>`), rebuilding the snapshot when it is stale (`--max-age`); it reads the snapshot from the fixed default location `start-review.ts` writes, so the skill never passes a path.
- `start-review.ts`: start a `pb:review` session by building the **review snapshot**. Snapshots `human-review/` into a temporary, git-ignored JSON file (a fixed default location `format-ticket-selection.ts` reads back on its own) that is the source of truth for the review checklist (rows, fixed numbers). It confirms the snapshot was built without printing its path, and does not render the menu; `format-ticket-selection.ts` is the single render path for both the first display and every reprint. See `docs/ticket-selection.md`.
- `review-snapshot.ts`: the review-snapshot helpers used by a single caller each: resolve the default path, read the snapshot back, test staleness, and mark a row actioned. The shared builders (snapshot, build, write) live in `lib/review-snapshot.ts`.
- `ticket-card.ts <id> [--queue human-review]`: CLI that gathers and prints one ticket's render card (title, changed files, docs changed, latest evidence pass, test results, screenshot paths, tailored inspect menu) on demand, when `pb:review` selects the ticket. Best-effort: every part degrades rather than throwing.
- `setup-ticket.ts <id>`: admit a ticket: move `todo/<id>` to `in-progress/` and create its worktree against `project/` at `project/worktrees/<id>` (on a new branch `worktrees/<id>` at the project's current commit). This is the only supported way to create a ticket worktree; never run `git worktree` by hand. The worktree is created with `git worktree add --relative-paths` (git >= 2.48), so both its link files are relative and the repo survives being shared across machines (NFS) at different mount points.
- `merge-ticket.ts <build|land|discard> ...`: merge approved tickets as one **train** so the post-merge checks run once on the combined result, not once per ticket. `build <id> [<id> ...]` creates a throwaway `merge-<random>` train worktree and cherry-picks each ticket's commits onto it (printing JSON with the `trainId`, `included`, and `noops`); on a conflict it aborts that pick, leaves the clean ones, and exits 2 naming the offending ticket. `land <trainId> <id> ...` fast-forwards the project branch to the train, then **concludes each ticket** via the shared `concludeTicket()` (moves it from `merge-queue/` to `done/`, committing that transition, and closes its worktree), and finally tears down the throwaway train worktree. `discard <trainId>` tears down a failed train (leaving the ticket worktrees) so the agent can rebuild a smaller one while bisecting. Never run `git worktree` or the merge by hand. The train worktree is also created with `git worktree add --relative-paths` (git >= 2.48), so a shared (NFS) repo survives a mount-point change.
- `conclude-debug.ts <id>`: conclude a Debug ticket — move it from `agent-review/` to `done/` and close its worktree, committing the move. A Debug ticket produces no code and never goes through the merge train (agent-review sends it straight to `done/` and spawns a Fix ticket), so this is where its worktree teardown happens; it shares `concludeTicket()` with `merge-ticket land` so the move-and-close is identical. Called by the `pb:next` agent-review sub-agent on a proven Debug ticket. Idempotent: re-running on an already-concluded ticket is a safe no-op.
- `fail-ticket.ts <id>`: increment the ticket's `**Failures:**` count in its `index.md` and print the new count. Called on every failure (any source except a human rejection); three failures park the ticket in `blocked/`.
- `reset-failures.ts <id>`: reset the ticket's `**Failures:**` count to 0. Called by `pb:review` when a human rejects a ticket back to `todo/`, so rework starts with a clean slate (a rejection is not a failure).
- `reset-loop.ts`: unwind an interrupted or abandoned run back to a clean slate. Moves every `in-progress/` ticket back to `todo/`, then force-removes every worktree under `project/worktrees/`, deletes its `worktrees/<id>` branch, and prunes stale worktree records. Discards unmerged work; does not merge. Called by `pb:reset`.
- `commit-state.ts <message> [pathspec...]`: commit a change in the state repo (ticket-scoped and lock-safe) so its git history is an audit log. Used by agents for free-form edits (e.g. a newly created ticket); skips with a warning if the state repo is not a git repo.

`move`, `setup-ticket`, `fail-ticket`, `reset-failures`, `set-priority`, `merge-ticket land`, and `conclude-debug` now commit their own state change automatically (ticket-scoped, lock-safe) via `commit-state.ts`, so concurrent `pb:next` sub-agents never produce a muddled cross-ticket commit. `merge-ticket land` commits the `merge-queue/` → `done/` moves of the tickets it lands; its `build` and `discard` touch only the project repo and commit nothing.

It is deliberately kept separate from the scaffolded `project/` so the Playbook's own tooling and its Jest run never sweep up an app's tests.

## Machine setup scripts (bash, not part of the Bun project)

Three bash scripts set up the machines the process runs on. They are not part of the loop and have no unit tests; they are idempotent, so the check for each is to re-run it. All three are **only tested on Ubuntu** (`setup-host.sh` and `vm.sh` assume snap, apt, systemd, `/etc/exports`, the Multipass bridge, and an Ubuntu guest); on another OS they need work.

- `setup-host.sh`: one-time setup of a host that will run the sandbox VM. Installs Multipass and `nfs-kernel-server`, and enables and persists IP forwarding (Multipass NATs the VM's traffic through the host; the kernel default is off and resets on reboot, which is why a VM loses its internet). Creates no VM and no export.
- `vm.sh`: the per-session script. Creates the VM if absent (named after the repo directory) or starts it if stopped, exports the repo from the host over NFS, mounts it in the VM at `/home/ubuntu/<repo>`, and opens a shell there (`vm.sh` = up + shell; also `up`, `shell`, `stop`, `status`). NFS is used because Multipass's own SSHFS/virtio-fs mounts are several times slower. The export is granted to the Multipass **bridge subnet**, not to the VM's IP, because the IP changes on every VM restart while the subnet does not: that is what lets every run after the first need no host sudo. On a fresh VM it runs `install-prereqs.sh` inside it. Overridable with `PB_VM_*` environment variables (listed at the top of the script).
- `install-prereqs.sh`: installs `git` (>= 2.48, from the git-core PPA when the distro's is too old), `bun`, and Claude Code on the machine that runs Claude Code, which is usually the VM. Called by `vm.sh` on a VM's first launch; run it by hand on a host that runs the process without a VM.

## Shared library (`lib/`)

`lib/` holds the code imported by two or more scripts, extracted so each CLI stays a thin wrapper around its own `main()`. A symbol lives in `lib/` only when at least two distinct non-test files import it; code used by one place stays with that place. Each lib module has its own `lib/<name>.test.ts`.

- `lib/commit-state.ts`: `commitState()` plus the lock-safe git runner it uses. The `commit-state.ts` CLI wraps it; `move`, `fail-ticket`, `reset-failures`, `set-priority`, `setup-ticket`, `merge-ticket`, and `conclude-debug` import it.
- `lib/move.ts`: `move()`, `QUEUES`, and the `MoveResult`/`MoveError` contract. The `move.ts` CLI wraps it; `fail-ticket`, `set-priority`, `setup-ticket`, `reset-loop`, `merge-ticket`, and `lib/conclude-ticket` import it.
- `lib/git-version.ts`: `assertGitVersion()` (throws `GitVersionError` unless the installed git meets `MIN_GIT_VERSION`, currently 2.48.0), plus the pure `parseGitVersion()`/`meetsMinimum()` helpers it is built from. Imported by `setup-ticket`, `merge-ticket`, `reset-loop`, and `conclude-debug` — every CLI that creates or manages a worktree asserts the version in its `main()` before doing any git work, so older git fails fast instead of producing worktrees with absolute link files.
- `lib/worktree-teardown.ts`: the injectable `GitRunner`/`realGit` and `removeWorktreeAndBranch()` (remove a worktree + delete its branch, guarded and idempotent), plus `WorktreeTeardownError`. Imported by `merge-ticket` (the train worktree) and `lib/conclude-ticket` (each concluded ticket).
- `lib/conclude-ticket.ts`: `concludeTicket()` — move a ticket to `done/` and close its worktree (best-effort teardown; the move is what must succeed). Imported by `conclude-debug` and `merge-ticket` (its `land` concludes every ticket it merges), so a merged ticket and a concluded Debug ticket retire their worktree by the same path.
- `lib/ticket-meta.ts`: shared parsers for `**Priority:**` and `**Depends on:**`, plus the ticket sort order (`compareTickets`). Imported by `board-tickets`, `next-tickets`, `review-snapshot`, and `format-ticket-selection`.
- `lib/board-tickets.ts`: `readTicket()` and the description helpers it uses. Imported by `board-tickets`, `review-snapshot`, and `format-ticket-selection`.
- `lib/review-snapshot.ts`: the review-snapshot builders (`snapshotQueue`, `buildSnapshot`, `writeSnapshot`). Imported by `start-review` and `format-ticket-selection`.

## Working here

- It's a Bun project. Use `bun` and `bun run`, never `npx`.
- Install deps: `bun install` (from this directory).
- Unit tests: `bun run test` (Jest via ts-jest).
- Smoke tests: `bun run smoke`. These exercise the real scripts against throwaway repos, so they need git >= 2.48 on the host (the same requirement the scripts enforce).
- The scripts are `#!/usr/bin/env bun` and are run directly, e.g. `bun ../scripts/move.ts <id> <queue>` from `state/`.

The project config (`package.json`, `tsconfig.json`, `jest.config.js`, `bun.lock`, `node_modules/`) lives here, not at the repo root.
