---
name: pb:status
description: Invoke at session start, or any time you want to know where the project stands and what to do next. Reads current-state.md and inspects every work-item queue, then summarises what was completed, what is in flight or awaiting review, and what is blocked, and recommends the next skill. Keywords: status, where things stand, what next, catch up, current state, queue summary, in flight, blocked, recommend a skill, session start, what should I do.
---

# pb:status

Read where the project stands and recommend the next move. This is the usual session-start skill and the default "what now?" entry point.

## Steps

1. Read `current-state.md` and inspect each queue in `work-items/`: `merge-queue/`, `human-review/`, `agent-review/`, `in-progress/`, `todo/`, and the most recent entries in `done/`.
2. Summarise three things:
   - **Completed since last session:** the most recent items in `done/`.
   - **In flight / awaiting review:** IDs and the stage each sits at.
   - **Blocked:** what is stuck and why.
3. Recommend a next step from the queue state:
   - Items in `human-review/` -> suggest `pb:review`.
   - Items in `merge-queue/`, or unblocked items in `todo/` -> suggest `pb:next`.
   - Empty queues with ideas in `docs/roadmap.md` -> suggest `pb:plan`.
   - Empty queues and empty roadmap -> suggest `pb:add` or `pb:plan` to populate the queue.
4. Ask the developer what they want to do.

## Example

```
Since last session: shipped auth-1 (login endpoint), auth-2 (session store).

In flight:
- search-3  in agent-review/  (review checks running)
- search-4  in todo/          (blocked: depends on search-3)

Blocked: search-4 waits on search-3 passing review.

Recommendation: run pb:next to push search-3 through agent review.
What would you like to do?
```
