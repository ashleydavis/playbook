---
name: pb:rank
description: "Invoke to set or change **Priority:** on tickets in todo/ or backlog/. Lower number = sooner admission by pb:next (among actionable todo/ tickets whose dependencies are merged). Lists tickets across both queues as one numbered menu. Use when you want to reorder what pb:next picks next. Keywords: rank, priority, reorder todo, reprioritize, bump priority, lower priority, ticket order, what runs first."
---

# pb:rank

Set or change `**Priority:**` on tickets in `todo/` or `backlog/`. Lower number = higher priority. Among actionable `todo/` tickets (all dependencies in `done/`), `pb:next` admits them in priority order, then ID.

Priority on `backlog/` tickets affects display and is ready when promoted; `pb:next` never reads `backlog/` directly.

## Output style

Follow the project's [output format](../../../docs/output-format.md) and [ticket selection menu](../../../docs/ticket-selection.md) (load once per session if not already in context). Mode: **`pick-many`**.

## Steps

1. Run `(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue todo --queue backlog --fields priority,dependsOn --prompt 'Which ticket(s) to rank? (number, several numbers, ticket ID, or "all")')`. If every section is empty, say so and stop.
2. Print the script output verbatim and wait for the developer's pick. Resolve the selection per [docs/ticket-selection.md](../../../docs/ticket-selection.md).
3. For each selected ID, ask the new priority (lower = sooner). One question per ticket, unless the developer gives one number for all selected.
4. For each ID, run `(cd state && bun ../scripts/set-priority.ts <id> <priority>)` from `state/`. Each call auto-commits its ticket-scoped change.
5. Update `current-state.md` if it mentions ordering. Commit when changed: `(cd state && bun ../scripts/commit-state.ts "<summary>" current-state.md)`.
6. Report each ticket's new priority.

## Example

See the `pick-many` multi-queue rank example in [docs/ticket-selection.md](../../../docs/ticket-selection.md).

```
ranked: auth-9, priority 10 (was 50)
ranked: search-1, priority 50 (was 100)
Run pb:next to pick up actionable todo/ tickets in the new order.
```
