---
name: pb:board
description: Invoke for a quick, bare listing of every work-item queue and what sits in each, without the narrative or recommendation that pb:status gives. Lists the IDs (and one-line descriptions) in todo, in-progress, agent-review, human-review, merge-queue, blocked, and the most recent in done. Use when you just want to see the board. Keywords: board, list queues, ls queues, show the board, queue contents, what's in the queue, list work items, kanban, quick list, where are the items.
---

# pb:board

A quick read of the board: which work item sits in which queue, right now. Lighter than `pb:status`, which reads `current-state.md`, writes a narrative summary, and recommends a next skill. `pb:board` just lists the queues.

Use it when you only want to see where items are. For "what should I do next?", use `pb:status`.

## Steps

1. List each queue under `state/work-items/`, in pipeline order, then the side pen and recent done:
   `todo/` -> `in-progress/` -> `agent-review/` -> `human-review/` -> `merge-queue/`, then `blocked/`, then the most recent few entries in `done/`.
   List a queue with `ls state/work-items/<queue>/`; each directory name is a work-item ID.
2. For each item, show its ID and the one-line description from its `index.md` (read only that line; never pull `detail.md`). Keep it to one line per item.
3. Print the board grouped by queue, with a count beside each queue name. Show empty queues as empty. Do not summarise, recommend a next skill, flag what needs the developer, or read `current-state.md`: that is `pb:status`.

## Example

```
todo (2)
  search-3   add result ranking
  search-4   paginate results          (depends on search-3)
in-progress (1)
  auth-2     session store
agent-review (0)
human-review (1)
  auth-1     login endpoint
merge-queue (0)
blocked (1)
  infra-7    flaky CI worker
done (recent)
  infra-2    CI pipeline
```
