---
name: pb:status
description: Invoke at session start, or any time you want to know where the project stands and what to do next. Reads current-state.md and inspects every work-item queue, then summarises what was completed, what is in flight or awaiting review, and what is blocked, and recommends the next skill. Keywords: status, where things stand, what next, catch up, current state, queue summary, in flight, blocked, recommend a skill, session start, what should I do.
---

# pb:status

Read where the project stands and recommend the next move. This is the usual session-start skill and the default "what now?" entry point.

## Steps

1. Read `current-state.md` and inspect each queue in `work-items/`: `merge-queue/`, `human-review/`, `agent-review/`, `in-progress/`, `todo/`, `blocked/`, and the most recent entries in `done/`.
2. Summarise, **action items first** (lead with what needs the developer, then the informational state):
   - **Run halted: systemic failure:** any systemic-failure entry left by `pb:next` when a run aborted (the shared stage or check, the items involved, the suspected environmental cause, the evidence path). Lead with this when present: the items it hit usually went back to `todo/`, so this entry is the only signal of why the last run stopped, and the cause must be fixed before re-running `pb:next`.
   - **Awaiting review:** every item in `human-review/` (ID + one-line description). These need the developer to run `pb:review`.
   - **Blocked:** every item in `blocked/` (these hit 3 failures and need you), plus anything stuck on an unmet dependency. For each blocked item, read its History note for the reason. Blocked items are parked and will not move until you act.
   - **In flight:** items still moving on their own (`in-progress/`, `agent-review/`, `merge-queue/`) and the stage each sits at. Informational; nothing needed.
   - **Completed since last session:** the most recent items in `done/`. Informational.

   Keep the action items short and plain so they cannot be missed. If there are no action items, say so in one line ("Nothing needs you; the loop is healthy") before the informational summary.
3. Recommend a next step from the queue state:
   - A `Run halted: systemic failure` entry in **⚠ Needs your action** -> tell the developer to fix the named environmental cause before re-running `pb:next`, then clear the entry once it is resolved.
   - Items in `blocked/` -> tell the developer to resolve each (read the History note, fix the cause) and re-admit it with `bun ../scripts/move.ts <id> todo` from `state/`.
   - Items in `human-review/` -> suggest `pb:review`.
   - Items in `merge-queue/`, or unblocked items in `todo/` -> suggest `pb:next`.
   - Empty queues with ideas in `docs/roadmap.md` -> suggest `pb:plan`.
   - Empty queues and empty roadmap -> suggest `pb:add` or `pb:plan` to populate the queue.
4. Ask the developer what they want to do.

## Example

```
⚠ Needs you:
- Awaiting review: 2 items in human-review/ (auth-1 login endpoint, auth-2 session store). Run pb:review.
- Blocked: search-4 waits on search-3 passing review.
(no systemic failures)

In flight:
- search-3  in agent-review/  (review checks running)

Since last session: shipped infra-2 (CI pipeline).

Recommendation: run pb:review to clear the two waiting items, then pb:next.
What would you like to do?
```
