---
name: pb:docs
description: Invoke when documentation needs writing or updating (spec, testing manual, how-it-works, roadmap, user guide) outside of planning a feature. Writes or updates the relevant files in docs/, and queues tickets in todo/ if the doc changes imply code or test changes. Keywords: docs, documentation, write docs, update docs, how-it-works, user guide, roadmap, README, document, keep docs current.
---

# pb:docs

Write or update documentation. Use this for documentation work that is not the design of a new feature (that is `pb:plan`).

## Steps

1. Ask the developer what documentation needs writing or updating.
2. Write or update the relevant files in `docs/` (spec, testing manual, how-it-works, or roadmap as appropriate).
3. If the doc changes imply code or test changes, create tickets in `todo/` to cover them. When you create more than one, set each ticket's `**Depends on:**` field to capture the dependencies between them so they implement in the right order, and where possible number them in execution order so a dependent ticket gets a higher number than the tickets it depends on. Commit each new ticket to the state repo as you write it: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`). (The doc files themselves live in the project repo, not the state repo.)
4. If you queued any tickets, update `current-state.md` to reflect them: add or amend only the entries this change affects (leaving the rest of its existing content intact), so the snapshot stays accurate. Commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).

## Example

```
Developer: The how-it-works doc still describes the old single-process design.

Updated docs/how-it-works.md to describe the worker-pool architecture.
The doc now references a `MAX_WORKERS` setting that the code does not read yet,
so I queued todo/infra-5 to wire that config through.
```
