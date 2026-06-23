---
name: pb:promote
description: "Invoke to pull one or more tickets from backlog/ into todo/ so pb:next can pick them up. Lists every ticket in backlog/ as a numbered menu; the developer picks one, several, or all. Optionally changes priority on promotion. Use when captured work is ready to become a contender for implementation. Keywords: promote, backlog to todo, pull forward, queue for next, make actionable, promote ticket, backlog promote."
---

# pb:promote

Pull tickets from `backlog/` into `todo/`. `backlog/` is a side pen, not a pipeline stage: `pb:next` never reads it. This skill makes captured work a contender for the loop.

## Output style

Follow the project's [output format](../../../docs/output-format.md) and [ticket selection menu](../../../docs/ticket-selection.md) (load once per session if not already in context). Mode: **`pick-many`**. Specific to promote:

- Print the script output verbatim, ask which to promote, then report each ticket's new queue (and priority if changed).

## Steps

1. Run `(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue backlog --fields priority,dependsOn --prompt 'Which to pull into todo? (number, several numbers, ticket ID, or "all")')`. If the output is `No tickets in Backlog.` (or shows zero tickets), say so and stop.
2. Print the script output verbatim and wait for the developer's pick. Resolve the selection per [docs/ticket-selection.md](../../../docs/ticket-selection.md) (same rules as `pb:unblock`).
3. Optionally ask whether to change priority on promotion (default: keep existing). If the developer gives a new priority, run `(cd state && bun ../scripts/set-priority.ts <id> <n>)` before or after the move.
4. For each selected ID, run `(cd state && bun ../scripts/move.ts <id> todo)`.
5. Update `current-state.md` to reflect the promotion. Commit the narrative update: `(cd state && bun ../scripts/commit-state.ts "<summary>" current-state.md)`.
6. Report what was promoted: each ticket's new queue and priority if changed. Suggest `pb:next` or `pb:rank` as appropriate.

## Example

See the `pick-many` backlog promote example in [docs/ticket-selection.md](../../../docs/ticket-selection.md).

```
promoted: infra-2, moved backlog/ → todo/ (priority 100 unchanged)
current-state.md updated.
Run pb:next to pick it up, or pb:rank to reorder todo/.
```

## Next

Recommend the developer run:
- `pb:next`: to pick up the promoted tickets.
- `pb:rank`: first, if you want to reorder `todo/`.
