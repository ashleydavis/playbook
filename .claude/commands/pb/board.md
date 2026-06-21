---
name: pb:board
description: "Invoke for a quick, bare listing of every ticket queue and what sits in each, without the narrative or recommendation that pb:status gives. Lists the IDs (and one-line descriptions) in todo, in-progress, agent-review, human-review, merge-queue, blocked, and the most recent in done. Use when you just want to see the board. Keywords: board, list queues, ls queues, show the board, queue contents, what's in the queue, list tickets, kanban, quick list, where are the tickets."
---

# pb:board

A quick read of the board: which ticket sits in which queue, right now. Lighter than `pb:status`, which reads `current-state.md`, writes a narrative summary, and recommends a next skill. `pb:board` just lists the queues.

Use it when you only want to see where tickets are. For "what should I do next?", use `pb:status`.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to the board:

- Print the board only: queue name + count, one line per ticket.
- No summary, no recommendation.

## Steps

1. From the state repo, run the board script: `(cd state && bun ../scripts/board-tickets.ts)`. It prints JSON keyed by queue, in board order (`todo`, `in-progress`, `agent-review`, `human-review`, `merge-queue`, then the side pen `blocked`, then `done` most-recent-first). Aborted tickets are a dead end and are deliberately left off the board. Do not list the queues by hand; do not read `detail.md`.
2. Each queue value is `{ count, truncated, tickets: [{ id, description, dependsOn }] }`. `count` is the true total; `tickets` is capped at 5 for display; `truncated` is true when the queue holds more than 5. Each `description` is already shortened to one short line (it ends in `…` when cut), so print it as-is.
3. Print the board grouped by queue, with the `count` beside each queue name. Per ticket: the ID on its own line, then the description indented under it, then a `depends on: <ids>` line indented under it when `dependsOn` is non-empty. Put a blank line after each ticket so the list is easy to scan. Show empty queues as empty. When `truncated` is true, add a `...` line after that queue's tickets to show there are more than displayed.
4. Do not summarise, recommend a next skill, flag what needs the developer, or read `current-state.md`: that is `pb:status`.

## Example

```
todo (2)
  search-3
    add result ranking

  search-4
    paginate results
    depends on: search-3

in-progress (1)
  auth-2
    session store

agent-review (0)
human-review (12)
  auth-1
    login endpoint

  ... (5 of 12 shown)
merge-queue (0)
blocked (1)
  infra-7
    flaky CI worker

done (recent)
  infra-2
    CI pipeline
```
