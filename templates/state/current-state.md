# Current state

<!-- The top section is for things that need the developer. Keep every entry to one or two plain lines so it is impossible to miss. The "Progress" section below is just informational and can grow as long as it likes. -->

## ⚠ Needs your action

<!-- Anything in this section is waiting on the developer. If it is empty, the loop is healthy and nothing needs you. List the action items in this order of urgency: -->

### Run halted: systemic failure

<!-- Written by pb:next when it aborts a run because two or more tickets failed the same stage or check (an environment problem, not a ticket problem). Each entry: the shared stage or check, the tickets involved, the suspected cause, the evidence path, and the one thing to fix. The tickets themselves usually return to todo/, so this is the only record of why the run stopped. Fix the cause, then clear this entry and re-run pb:next. -->

### Awaiting review (human-review/)

<!-- Tickets sitting in human-review/ that need the developer to run pb:review (approve / reject / defer). One line each: ID + one-line description. -->

### Blocked

<!-- Tickets in blocked/ (reached 3 failures) plus anything stuck on an unmet dependency. One line each: ID + the reason (from its History note). These will not move until the developer fixes the cause and re-admits with move.ts <id> todo. -->

## Progress

<!-- Informational only. Nothing here needs the developer. -->

### In progress

<!-- Tickets moving through the pipeline right now (in-progress/, agent-review/, merge-queue/). -->

### Last completed

<!-- Most recent tickets merged to done/, newest first. -->
