---
name: pb:next:preview
description: "Invoke to see what pb:next would do, without doing any of it. Reads the same report pb:next acts on and says, queue by queue in pb:next's processing order, which tickets it would merge main into, merge, review, admit and implement. Changes nothing: no moves, no worktrees, no sub-agents, no commits. Keywords: preview, dry run, what would next do, next preview, simulate, plan the run, before running next."
---

# pb:next:preview

Say what [pb:next](../next.md) would do if it were run now, without doing any of it. It works from the same source of truth as `pb:next` and follows the same processing order, but every action is described instead of performed.

## Read-only rule

The only command this skill runs is the report: `(cd state && bun ../scripts/next-tickets.ts)`. It never runs `move.ts`, `setup-ticket.ts`, `merge-ticket.ts`, `conclude-debug.ts` or `commit-state.ts`; never spawns a sub-agent; never creates a worktree; never edits a file. Like `pb:next`, it runs no other command and reads no other file.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to preview:

- Start with one line saying this is a preview and nothing was changed.
- One short line per queue, in processing order. Skip empty queues.
- Always write ticket IDs in full, as in `pb:next`.

## Steps

1. Run the report once.
2. Describe what the first turn of `pb:next` would do, in its processing order (**`conflicts` → `merge-queue` → `todo` → `in-progress`**):
   - `conflicts`: each ID would have main merged into it in its worktree, re-verified, and returned to `merge-queue/`.
   - `merge-queue`: the IDs would be merged as one train by a single merge sub-agent, with the post-merge checks run once on the result.
   - `todo`: each ID would be admitted with `setup-ticket.ts` (moved to `in-progress/`, worktree created), then implemented.
   - `in-progress`: each ID already there would be implemented (re-driven from where it sits).
3. If every list is empty, say `pb:next` would find nothing to do.
4. Say that this covers the first turn only: later turns depend on how each ticket fares (e.g. how long each stage takes), so they cannot be predicted.

## Example

```
Preview only: nothing was changed.
merge-queue: search-1, search-2 would be merged as one train.
todo: search-3, infra-5 would be admitted and implemented.
This is the first turn only; later turns depend on the results.
```

## Next

Recommend the developer run:
- `pb:next`: to do what the preview describes.
