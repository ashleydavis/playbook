---
name: pb:status
description: Invoke at session start, or any time you want to know where the project stands and what to do next. Reads current-state.md and inspects every ticket queue, then summarises what was completed, what is in flight or awaiting review, and what is blocked, and recommends the next skill. Keywords: status, where things stand, what next, catch up, current state, queue summary, in flight, blocked, recommend a skill, session start, what should I do.
---

# pb:status

Read where the project stands and recommend the next move. This is the usual session-start skill and the default "what now?" entry point.

## Output style

Bullet points, not prose. No preamble, no narration, no explaining the queues or the process.

- One ticket per bullet: ID + one-line description + what it needs (if anything).
- Group under the fixed headings below; drop any heading that is empty.
- The recommendation is one line: the skill to run and why, in a few words.
- Report the state. Do not editorialise or pad.

## Steps

1. Read `current-state.md` and inspect each queue in `tickets/`: `merge-queue/`, `human-review/`, `agent-review/`, `in-progress/`, `todo/`, `blocked/`, and the most recent entries in `done/`.
2. Summarise, **action items first** (lead with what needs the developer, then the informational state):
   - **Run halted: systemic failure:** any systemic-failure entry left by `pb:next` when a run aborted (the shared stage or check, the tickets involved, the suspected environmental cause, the evidence path). Lead with this when present: the tickets it hit usually went back to `todo/`, so this entry is the only signal of why the last run stopped, and the cause must be fixed before re-running `pb:next`.
   - **Awaiting review:** every ticket in `human-review/` (ID + one-line description). These need the developer to run `pb:review`.
   - **Blocked:** every ticket in `blocked/` (these hit 3 failures and need you), plus anything stuck on an unmet dependency. For each blocked ticket, read its History note for the reason. Blocked tickets are parked and will not move until you act.
   - **In flight:** tickets still moving on their own (`in-progress/`, `agent-review/`, `merge-queue/`) and the stage each sits at. Informational; nothing needed.
   - **Completed since last session:** the most recent tickets in `done/`. Informational.

   Keep the action items short and plain so they cannot be missed. If there are no action items, say so in one line ("Nothing needs you; the loop is healthy") before the informational summary.
3. Recommend a next step from the queue state:
   - A `Run halted: systemic failure` entry in **⚠ Needs your action** -> tell the developer to fix the named environmental cause before re-running `pb:next`, then clear the entry once it is resolved.
   - Tickets in `blocked/` -> tell the developer to resolve each (read the History note, fix the cause) and re-admit it with `bun ../scripts/move.ts <id> todo` from `state/`.
   - Tickets in `human-review/` -> suggest `pb:review`.
   - Tickets in `merge-queue/`, or unblocked tickets in `todo/` -> suggest `pb:next`.
   - Empty queues with ideas in `docs/roadmap.md` -> suggest `pb:plan`.
   - Empty queues and empty roadmap -> suggest `pb:add` or `pb:plan` to populate the queue.
4. Ask the developer what they want to do.

## Example

```
⚠ Needs you
- auth-1 — login endpoint — awaiting review
- auth-2 — session store — awaiting review
- search-4 — blocked, waits on search-3

In flight
- search-3 — agent-review (checks running)

Done since last session
- infra-2 — CI pipeline

Recommendation: pb:review to clear auth-1, auth-2, then pb:next.
What would you like to do?
```
