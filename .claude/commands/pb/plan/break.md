---
name: pb:plan:break
description: "Invoke when you have a written plan (in project/docs/plans/new/) and want to turn it into queued tickets. Breaks the plan into dependency-linked tickets in todo/ or backlog/, deriving each ticket's acceptance criteria and test plan from the plan. Use after writing a plan with plan:create. Keywords: break plan, breakdown, plan to tickets, split plan, queue tickets from plan, dependencies, schedule work, decompose plan, break up the plan."
---

# pb:plan:break

Turn a written plan into queued tickets. Input is a finished plan (from `plan:create`, living in `project/docs/plans/new/`); output is dependency-linked tickets in `todo/` or `backlog/`. This is decomposition, not design: the plan already decides what to build, and the plan's own steps drive the spec and testing-manual updates when each ticket is implemented.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to break:

- Show the proposed ticket list (IDs, types, one-liners, dependencies) for sign-off before writing any ticket directories.
- When done, report the tickets queued, the queue they landed in, and their dependencies in a few lines.

## Steps

1. Pick the plan. Use the plan in the conversation; otherwise list the most recent files in `project/docs/plans/new/` and ask which to break up.
2. Derive the feature ID from the plan (its target spec dir, e.g. `resource-utilization`). Tickets get IDs `{feature-id}-{n}`. Work not tied to a feature uses a `misc`/`infra` prefix.
3. Chunk the plan into ticket-sized units. Default to one ticket per plan section: a coherent slice that can be implemented and verified on its own, not one ticket per micro-step. Every ticket must produce real output (code, tests, or docs); never a ticket that only reads, researches, or scaffolds empty directories.
4. Set dependencies and order. Derive `**Depends on:**` from the plan's natural ordering (shared libraries before their consumers, types/spec before the code that uses them, e2e after the UI it covers). Number IDs in execution order so a dependent ticket gets a higher number than what it depends on, and assign ascending `**Priority:**` (e.g. `10`, `20`, `30`, ...).
5. Show the proposed ticket list for sign-off: each ticket's ID, type, one-line description, and what it depends on. Adjust on the developer's feedback (split, merge, reorder, re-scope) before writing anything.
6. Ask once for the whole batch where the tickets should land (no default):
   ```
   Where should these tickets go?
   1. todo, ready for pb:next to pick up
   2. backlog, captured for later; pull to todo when ready
   ```
   Accept `1`/`2`, or `todo`/`backlog`. All tickets in the batch share the chosen queue.
7. Create each ticket in `state/tickets/<queue>/<id>/` from `templates/ticket-template/`:
   - `index.md`: ID, Type, Depends on, Failures `0`, Priority, and a one-line description.
   - `detail.md`: Description, Acceptance Criteria, and Test Plan **derived from the plan's own Steps / Unit Tests / Smoke Tests / Verify sections**, not invented. Carry the plan's relevant guidance into Implementation Notes and Testing Notes. Where the plan calls for spec or testing-manual updates, fold them into the ticket that implements that slice (so the spec is authored by the work, not upfront).
   - A Test Plan is required. Use `N/A: <reason>` with a Manual Verification section only when the ticket has no testable behaviour. **A ticket that creates or changes a UI component may not use `N/A`, and may not defer its screenshots to a later ticket** (e.g. the e2e ticket that wires it in). If the slice adds or edits anything that renders, its Test Plan must require screenshots of that component (light + dark), rendered **in isolation** with sample props when no page consumes it yet. If a planned component cannot be screenshotted on its own, do not break it into a standalone ticket: bundle it with the first page that consumes it, or have the ticket add an isolated render/story harness, so screenshots are always possible.
   - **The final ticket archives the plan.** The last ticket in execution order (the one every other ticket depends on) gets an extra acceptance criterion: move the plan from `project/docs/plans/new/` to `project/docs/plans/done/` as part of that ticket's own committed, reviewed work, so the plan is archived on disk exactly when the last slice lands on main. This is a real file move in the project repo, not an output-less step; fold it into that ticket rather than creating a separate cleanup ticket.
   Commit each ticket: `bun ../scripts/commit-state.ts "add <id>" tickets/<queue>/<id>` (from `state/`).
8. Update `state/current-state.md` to reflect the queued tickets (add or amend only the entries this change affects, leaving the rest intact). Commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).
9. Report the tickets queued, the queue they landed in, and the dependency graph.

## Example

```
Developer: break up the resource-utilization plan.

Proposed tickets (sign-off before I write them):
- resource-utilization-1 (Scaffolding): types + spec for cluster totals/health/workloads
- resource-utilization-2 (Feature): backend node requests + workload aggregation   (deps: -1)
- resource-utilization-3 (Feature): shared frontend utilization library             (deps: -1)
- resource-utilization-4 (Feature): shared utilization UI components                 (deps: -3)
- ...
- resource-utilization-9 (Test coverage): e2e + smoke coverage                       (deps: -4..-8)

Where should these go? 1. todo  2. backlog

(after agreement: todo)
Queued 9 tickets in todo/. -2 and -3 depend on -1; the UI tickets depend on -3;
e2e depends on the UI tickets.
```

## Next

Recommend the developer run:
- `pb:next`: if the tickets went to `todo/`.
- `pb:promote`: if they went to `backlog/`, when ready to work them.
