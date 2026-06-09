---
name: pb:reset
description: Invoke to unwind an interrupted or abandoned pb:next run back to a clean slate. Moves every in-progress ticket back to todo, then force-removes every ticket worktree and deletes its branch, discarding any unmerged work in them. Use to recover from a crashed run or to abandon in-flight work; it does not merge anything. Keywords: reset, abandon, unwind, recover, crashed run, clean up worktrees, requeue, start over, in-progress stuck, discard work, delete worktrees, delete branches, scrap the run.
---

# pb:reset

Unwind the loop back to a clean slate after a run was interrupted, or when you want to abandon what is in flight. It requeues in-progress work and tears down its worktrees so the next `pb:next` starts clean.

**Destructive.** Any commits or uncommitted changes in a ticket worktree are discarded. `pb:reset` does not merge: use it to recover or abandon, never to land work. It touches only `in-progress/` and the worktrees; it leaves tickets already past `in-progress/` (`agent-review/`, `human-review/`, `merge-queue/`, `done/`, `blocked/`) where they are.

## Output style

Follow the project's [output format](../../../output-format.md) (load it once per session if it is not already in your context). Specific to reset:

- Show what will be reset as a short list, then report what was reset. Nothing more.

## Steps

1. Show the developer what will be reset before doing anything: list the tickets in `in-progress/` (the IDs that will return to `todo/`) and the worktrees under `project/worktrees/` (which will be force-removed). Confirm they want to proceed, since unmerged work is discarded.
2. Run the reset from the state repo: `(cd state && bun ../scripts/reset-loop.ts)`. It moves every `in-progress/` ticket back to `todo/`, force-removes every worktree under `project/worktrees/`, deletes each `worktrees/<id>` branch, and prunes stale worktree records. The script is the only supported way to do this; never move queue directories or run `git worktree` / `git branch -D` by hand.
3. Update `current-state.md` to reflect the reset: the requeued tickets are back in `todo/` and nothing is in flight. Amend only the entries this changes, leaving the rest intact. If a `Run halted: systemic failure` entry in the `⚠ Needs your action` section prompted the reset, clear it once its cause is addressed.
4. Report what was reset: the tickets returned to `todo/`, and the worktrees and branches removed.

## Notes

- Failure counts are left untouched: tickets return to `todo/` exactly as they were, so the loop can pick them up again. A reset is recovery, not a rejection.
- This is not part of the normal loop. The autonomous `pb:next` reconciliation (see `process.md` **Failures**) already records and routes failures at the end of every turn, so a healthy run never strands work in `in-progress/`. Reach for `pb:reset` when a run died without reconciling (a crash, a killed session), or when you deliberately want to throw away in-flight work and re-plan.

## Example

```
Developer: The last pb:next run crashed halfway. Clean it up.

To be reset:
  in-progress: search-3, search-4
  worktrees:   project/worktrees/search-3, project/worktrees/search-4

Proceed? This discards any unmerged work in those worktrees.
> yes

reset: requeued 2 ticket(s) to todo/ (search-3, search-4); removed 2 worktree(s), deleted 2 branch(es)
current-state.md updated: nothing in flight, 2 tickets back in todo/.
```
