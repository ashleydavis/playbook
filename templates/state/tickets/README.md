# Tickets

This directory holds the project's ticket queues. Each queue is a directory, and each ticket is a directory named by its ID sitting directly under a queue:

```
todo/
  user-auth-1/        # Named by the ticket's ID
    index.md          # The ticket itself
    evidence/         # Captured proof (optional, added once proof exists)
```

The queues are flat: ticket directories sit directly under the queue with no nested hierarchy. The whole ticket directory moves between queues as a unit, so the ticket and its proof always travel together and land self-contained in `done/<id>/`.

## Queues

- `todo/`: Pending tickets ready for `pb:next` to pick up.
- `backlog/`: Captured work not yet a contender for implementation. `pb:next` never reads this queue; promote tickets to `todo/` via `pb:promote` or `move.ts` when ready.
- `in-progress/`: Tickets currently being implemented.
- `agent-review/`: Tickets awaiting automated review.
- `human-review/`: Tickets awaiting developer review.
- `merge-queue/`: Approved tickets waiting to merge.
- `done/`: Completed tickets (immutable history).

`conflicts/` hangs off `merge-queue/` and is drained by the loop, not by a human:

- `conflicts/`: An approved ticket whose commits would not cherry-pick onto main, because main moved under it. `pb:next` drains this **first**, rebases and re-verifies the ticket in its existing worktree, and returns it straight to `merge-queue/`. A cherry-pick conflict is **not a failure** (it says nothing about the ticket's work), so the ticket never goes back to `todo/` and never returns to `human-review/`: the developer's approval still stands.

Three side pens sit outside the pipeline, and a human moves tickets out of each:

- `backlog/`: Work captured for later. Not picked by `pb:next` until promoted to `todo/`.
- `blocked/`: Parked after a hard or repeated failure; a human re-admits it to `todo/` once the cause is fixed.
- `aborted/`: Killed by the developer during `pb:review`; the work is abandoned (terminal, immutable history).

## Upgrading

If your state repo was bootstrapped before `backlog/` existed, create `state/tickets/backlog/` (with a `.gitkeep` if empty) and commit via `commit-state.ts`. Existing tickets need no `**Priority:**` line; they default to `100`.

If it was bootstrapped before `conflicts/` existed, create `state/tickets/conflicts/` (with a `.gitkeep` if empty) and commit via `commit-state.ts`.

## ID rule

A ticket's ID is declared in the `**ID:**` field inside its `index.md`; the directory name mirrors it by convention, but the field is the source of truth. Because the directory name mirrors the ID, listing a queue enumerates the IDs of every ticket in that queue without opening any file.
