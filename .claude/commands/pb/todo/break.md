---
name: pb:todo:break
description: "Invoke when the project keeps a todo list and you want to turn it into queued tickets. Finds the todo source in project/ (todo.md, then todos.md, then a Todo/Todos section in readme.md), breaks each item into a dependency-linked ticket in todo/ or backlog/, and derives each ticket's acceptance criteria and test plan from the item plus the affected feature's spec. Use to clear a todo list into the pipeline. Keywords: todo, todos, todo list, break todos, todo to tickets, queue todos, decompose todo, todo.md, readme todos, clear the todo list."
---

# pb:todo:break

Turn a project's todo list into queued tickets. Input is a free-form todo list kept in the project repo; output is dependency-linked tickets in `todo/` or `backlog/`. This is decomposition, not design.

A todo list is **not** a written plan. Its items are terse, independent wants, bugs, tweaks, and open questions, with no Steps / Unit Tests / Verify sections to copy from. So unlike `pb:plan:break`, this skill works one item at a time, treats items as independent by default, derives each ticket's detail from the item's intent plus the affected feature's spec, and stops to ask the developer about any item that is really a question rather than a task.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to break:

- Report which source file (and section) the todo list came from.
- Show the proposed ticket list (IDs, types, one-liners, dependencies) for sign-off before writing any ticket directories. List separately any items you are flagging as questions for the developer to decide.
- When done, report the tickets queued, the queue they landed in, and any dependencies in a few lines.

## Steps

1. Find the todo source. Look **only in the project repo (`project/`)**, in this order, and use the first that exists:
   1. `project/todo.md`
   2. `project/todos.md`
   3. a `Todo` or `Todos` section (a heading) in `project/readme.md`.
   Report which source (and section) you are using. If none exists, stop and say so; do not invent a list.
2. Parse the list into candidate items. Each top-level bullet (or numbered entry) is one candidate. Keep sub-bullets with their parent.
3. Triage each candidate before ticketing:
   - **Task** (a concrete change): becomes a ticket. Classify its type (`Tweak`, `Fix`, `Feature`, `Doc`, `Refactor`, ...).
   - **Investigation** (e.g. "check if X is missing", "fix if necessary", root cause unknown): make it a `Debug` ticket (Debug tickets always land in `todo/`), not a guessed fix.
   - **Question / decision** (e.g. "or should they?", "is there any way to improve this?"): this is the developer's call, not a task. Do **not** silently ticket it. Collect these and surface them at sign-off so the developer can resolve each into a concrete ticket, send it to Debug, or drop it.
4. For each task item, derive its feature and detail:
   - Map it to the feature it touches and use that feature's spec dir as the ID prefix (e.g. a logs item → `live-logs`, a "Status page" rename → `cluster-overview`). Items not tied to a feature use a `misc`/`infra` prefix. IDs are `{feature-id}-{n}`.
   - The todo line is terse, so derive Acceptance Criteria and Test Plan from the item's intent **plus the affected feature's `docs/spec/` and `docs/testing-manual/`** (and the code where needed), not from the one line alone. Where the change implies a spec or testing-manual update, fold that into the same ticket.
5. Set dependencies. Treat items as **independent by default (no `Depends on:`)**. Add a dependency only where one item genuinely must land before another (e.g. a rename that a later item references, a shared component two items both change). Number IDs so any dependent ticket is higher than what it depends on, and set `**Priority:**` to order the batch (e.g. `10`, `20`, `30`, ...), keeping the todo list's own order unless a dependency forces otherwise.
6. Show the proposed ticket list for sign-off: each ticket's ID, type, one-line description, and what it depends on. List the flagged questions (step 3) separately and ask the developer to resolve them. Adjust on feedback (split, merge, reorder, re-scope, drop, or convert a question to a ticket) before writing anything.
7. Ask once for the whole batch where the tickets should land (no default):
   ```
   Where should these tickets go?
   1. todo, ready for pb:next to pick up
   2. backlog, captured for later; pull to todo when ready
   ```
   Accept `1`/`2`, or `todo`/`backlog`. All tickets in the batch share the chosen queue (Debug tickets always go to `todo/` regardless).
8. Create each ticket in `state/tickets/<queue>/<id>/` from `templates/ticket-template/`:
   - `index.md`: ID, Type, Depends on (omit the line if none), Failures `0`, Priority, and a one-line description.
   - `detail.md`: Description, Acceptance Criteria, and Test Plan derived per step 4. Carry any useful guidance into Implementation Notes and Testing Notes. Quote the original todo line in the Description so the source is traceable.
   - **Every ticket must have a verifiable output, named in its Acceptance Criteria and Test Plan.** A behaviour change needs a test written and run; a UI-affecting change (the common case for todo items, including a rename, a colour change, or a removal) needs before/after screenshots in light **and** dark, which agent-review hard-rejects if missing; anything else names the concrete file, directory, or command output that proves it. **A ticket that creates or changes a UI component needs screenshots of that component too, even before any page consumes it: rendered in isolation with sample props when nothing renders it yet.** It may not use `N/A` and may not defer its screenshots to a later ticket; if a component cannot be screenshotted on its own, bundle it with the first page that uses it rather than queuing it alone. A Test Plan is required; use `N/A: <reason>` with a Manual Verification section only when there is genuinely no testable behaviour. Never write a ticket whose only output is reading or research; route those to a `Debug` ticket instead.
   Commit each ticket: `bun ../scripts/commit-state.ts "add <id>" tickets/<queue>/<id>` (from `state/`).
9. Remove the ticketed items from the source file so they are not processed again. Do this automatically once the tickets are created; do not ask. Leave the question items (step 3) in place. This edits the project repo; leave the change uncommitted for the developer (this skill never commits to `project/`).
10. Update `state/current-state.md` to reflect the queued tickets (add or amend only the entries this change affects). Commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).
11. Report the tickets queued, the queue they landed in, the dependency graph, and any unresolved question items left in the source.

## Example

```
Developer: break up the todo list.

Source: project/todo.md (10 items).

Proposed tickets (sign-off before I write them):
- performance-tabs-1 (Tweak): rename Performance tabs to "Resource Utilization"
- cluster-overview-1 (Tweak): rename "Status" page/nav to "Cluster"
- all-resources-1 (Debug): check whether the all-resources page omits resource kinds
- live-logs-1 (Feature): highlight "error" red and "warning" yellow in the log viewer
- live-logs-2 (Fix): keep global Logs auto-scroll pinned to the end           (deps: none)
- live-logs-3 (Tweak): enlarge the pod picker so all pods are visible
- live-logs-4 (Feature): remove a pod from the Logs page via a close button
- nodes-view-1 (Tweak): keep the actions column on screen on narrow windows
- misc-1 (Tweak): show each page title once (navbar only), audit all pages

Questions for you to decide (not ticketed yet):
- "Status -> Cluster" rename: also rename the left sidebar entry? (assumed yes)
- "renamed to Resource Utilization (or should they?)" - confirm the rename is wanted.

Where should these go? 1. todo  2. backlog

(after agreement: todo)
Queued 9 tickets in todo/. All independent (no dependencies). Cleared the 9 ticketed
items from project/todo.md (left uncommitted); the rename question stays in the list.
```

## Next

Recommend the developer run:
- `pb:next`: if the tickets went to `todo/`.
- `pb:promote`: if they went to `backlog/`, when ready to work them.
