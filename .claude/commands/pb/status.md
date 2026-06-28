---
name: pb:status
description: "Invoke at session start, or any time you want to know where the project stands and what to do next. Inspects every ticket queue, then summarises what was completed, what is in flight or awaiting review, and what is blocked, and recommends the next skill. Keywords: status, where things stand, what next, catch up, queue summary, in flight, blocked, recommend a skill, session start, what should I do."
---

# pb:status

Read where the project stands and recommend the next move. This is the usual session-start skill and the default "what now?" entry point.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to status:

- One ticket per bullet: ID + one-line description + what it needs (if anything).
- Group under the fixed headings below; drop any heading that is empty.
- The recommendation is one line: the skill to run and why, in a few words.

## Steps

1. Inspect each queue in `state/tickets/`: `merge-queue/`, `human-review/`, `agent-review/`, `in-progress/`, `todo/`, `backlog/`, `blocked/`, and the most recent entries in `done/`. The live queues are the source of truth; build the whole summary (action items included) from them.
2. Summarise, **action items first** (lead with what needs the developer, then the informational state):
   - **Awaiting review:** every ticket in `human-review/` (ID + one-line description). These need the developer to run `pb:review`.
   - **Blocked:** every ticket in `blocked/` (these hit 3 failures and need you), plus anything stuck on an unmet dependency. For each blocked ticket, read its History note for the reason. Blocked tickets are parked and will not move until you act.
   - **Backlog:** when `backlog/` is non-empty, count + one line per ticket (informational). Suggest `pb:promote` to pull work forward or `pb:rank` to reorder `todo/`.
   - **In flight:** tickets still moving on their own (`in-progress/`, `agent-review/`, `merge-queue/`) and the stage each sits at. Informational; nothing needed.
   - **Completed since last session:** the most recent tickets in `done/`. Informational.

   Keep the action items short and plain so they cannot be missed. If there are no action items, say so in one line ("Nothing needs you; the loop is healthy") before the informational summary.
3. Recommend a next step from the queue state:
   - Tickets in `blocked/` -> tell the developer to resolve each (read the History note, fix the cause) and re-admit with `pb:unblock` or `move.ts`.
   - Non-empty `backlog/` with nothing urgent in `todo/` -> suggest `pb:promote` to pull contenders forward.
   - Reordering `todo/` -> suggest `pb:rank`.
   - Tickets in `human-review/` -> suggest `pb:review`.
   - Tickets in `merge-queue/`, or unblocked tickets in `todo/` -> suggest `pb:next`.
   - Empty `todo/` with a todo list in the project (`project/todo.md`, `todos.md`, or a Todo section in `readme.md`) -> suggest `pb:todo:break` to turn it into tickets.
   - Empty queues with ideas in `project/docs/roadmap.md` -> suggest writing a plan (`plan:create`), then `pb:plan:break`.
   - Empty queues and empty roadmap -> suggest `pb:add`, or `plan:create` then `pb:plan:break`, to populate the queue.
4. Ask the developer what they want to do.

## Example

```
⚠ Needs you
- auth-1, login endpoint, awaiting review
- auth-2, session store, awaiting review
- search-4, blocked, waits on search-3

In flight
- search-3, agent-review (checks running)

Done since last session
- infra-2, CI pipeline

Recommendation: pb:review to clear auth-1, auth-2, then pb:next.
What would you like to do?
```
