---
name: pb:unblock
description: "Invoke to re-admit one or more blocked tickets back into the loop. Lists every ticket in blocked/ as a numbered menu; the developer picks one, several, or all by number, and each selected ticket has its failure count reset to 0 and is moved back to todo/ so pb:next picks it up again. Use when a blocked ticket's cause has been addressed (or you just want to give it another run). Keywords: unblock, re-admit, blocked, requeue blocked, reset failures, retry blocked, move blocked to todo, clear block, give it another go, unstick."
---

# pb:unblock

Re-admit blocked tickets into the loop. `blocked/` is a side pen, not a pipeline stage: a ticket lands there after its third failure and `pb:next` never touches it again. Only a human re-admits it, and this is the skill that does so.

Each selected ticket has its `**Failures:**` count reset to 0 (a fresh slate, not carrying the old count straight back toward the cap) and is moved to `todo/`, where the next `pb:next` run picks it up.

**This does not fix why the ticket blocked.** It only re-admits it. If the underlying cause is unaddressed (a stale worktree, a bad commit shape, a genuinely failing check), the ticket will just fail and block again. Tell the developer what blocked it (its `## Issues` box / History note) so they can decide whether it is actually ready to retry.

## Output style

Follow the project's [output format](../../../output-format.md) (load it once per session if it is not already in your context). Specific to unblock:

- Print the numbered list of blocked tickets, ask which to unblock, then report what was re-admitted. Nothing more.

## Steps

1. List the blocked tickets. Get the IDs from `blocked/` (`ls state/tickets/blocked/`) and, for each, read the one-line description and `**Failures:**` count from its `index.md`. Do not read `detail.md`.
2. If `blocked/` is empty, say so and stop: there is nothing to unblock.
3. Present the blocked tickets as a numbered list (from 1), one per ticket: the number, the ID, and the one-line description. Ask the developer which to unblock. Accept a single number, several numbers, or `all`. If they pick nothing, stop without changing anything.
4. For each selected ticket, run both scripts from the state repo, in this order (each auto-commits its own ticket-scoped change, so do not commit them by hand):
   1. `(cd state && bun ../scripts/reset-failures.ts <id>)` — sets `**Failures:**` to 0.
   2. `(cd state && bun ../scripts/move.ts <id> todo)` — moves the directory `blocked/` → `todo/`.
   Never edit the `**Failures:**` field or move queue directories by hand; the scripts are the only supported way.
5. Update `current-state.md` to reflect the re-admission: remove each unblocked ticket's entry from the `⚠ Needs your action` section and note in `Progress` that it is back in `todo/` with its failure count reset. Amend only the entries this changes, leaving the rest intact. Commit the narrative update as its own commit: `(cd state && bun ../scripts/commit-state.ts "<summary>" current-state.md)`.
6. Report what was re-admitted: each ticket moved to `todo/` with its failure count reset, and remind the developer they can run `pb:next` to pick them up.

## Notes

- Resetting the failure count is deliberate. A block is a parked problem, not a verdict that the work is wrong; once a human decides it is worth another go, it starts that retry with a clean slate (the same rule `pb:review` applies when a human rejection sends a ticket back to `todo/`).
- This is the inverse of the third-failure block, not part of the autonomous loop. `pb:next` will never re-admit a blocked ticket itself; that gate is intentional, so nothing re-enters the loop without this explicit action.
- A blocked ticket may still own a stale worktree under `project/worktrees/<id>` from its last run. `pb:unblock` does not touch worktrees. If the block was about a stale or bad worktree, clear or rebase it before (or just after) re-admitting, or the next run repeats the same failure.

## Example

```
Developer: /pb:unblock

Blocked tickets:
  1. treemap-tooltip-1  (3 failures)  custom treemap hover tooltip — reworked as a merge commit, breaks the merge-train cherry-pick
  2. flaky-smoke-1      (3 failures)  smoke suite intermittently times out on this host

Which to unblock? (number, several numbers, or "all")
> 1

unblocked: treemap-tooltip-1 — failures reset to 0, moved blocked/ → todo/
current-state.md updated: treemap-tooltip-1 back in todo/, removed from the blocked section.
Run pb:next to pick it up. (Note: it blocked on a merge-commit shape — rebase its worktree to a single commit first, or it will block again.)
```
