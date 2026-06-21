# Backlog Queue and Todo Priority

## Overview

Today every new ticket lands in `todo/` and `pb:next` picks actionable tickets in alphabetical ID order (`next-tickets.ts` → `listQueue()` sorts by directory name). There is no side pen for work that is captured but not yet a contender for implementation, and no way to express which `todo/` tickets should run first beyond the weak hint of incrementing `-n` in the ID (which `**Depends on:**` already enforces for ordering).

This plan adds a **`backlog/` side pen** (like `blocked/` and `aborted/`: outside the pipeline, invisible to `pb:next`) for tickets that are queued for later, and a **`**Priority:**` field** on each ticket's `index.md` so actionable `todo/` tickets are admitted in explicit priority order (lower number = sooner). A new **`pb:promote`** skill moves tickets from `backlog/` to `todo/` when the developer is ready to make them contenders; a new **`pb:rank`** skill sets or changes priority on tickets in `todo/` or `backlog/`. Existing tickets without `**Priority:**` keep today's behaviour (treated as priority `100`, tie-broken by ID).

**Prerequisite:** [plan-ticket-selection-menu.md](plan-ticket-selection-menu.md) is already implemented. This plan assumes `docs/ticket-selection.md`, `scripts/format-ticket-selection.ts`, and `docs/process.md` / `docs/output-format.md` exist. `pb:promote` and `pb:rank` use the shared **`pick-many`** ticket selection menu — do not invent a separate list format.

## Issues

<Leave empty — populated later by plan:check>

## Steps

### Data model and scaffold

1. **Add `backlog/` to the state repo scaffold.**
   - Create `templates/state/tickets/backlog/.gitkeep`.
   - Update `templates/state/tickets/README.md`: document `backlog/` as the side pen for tickets captured but not yet contenders for `pb:next`; only a human promotes them to `todo/` via `pb:promote` or `move.ts`.
   - Update `templates/state/tickets/CLAUDE.md`: new tickets land in `todo/` or `backlog/` per the developer's choice at creation time; `pb:next` never reads `backlog/`.
   - Update `templates/index.md` to list `state/tickets/backlog/` alongside the other side pens.

2. **Add `**Priority:**` to the ticket template.**
   - In `templates/ticket-template/index.md`, add `**Priority:** 100` after `**Failures:** 0` (or document that the line may be omitted and defaults to `100`).
   - Comment in the template HTML block: lower number = higher priority; used by `next-tickets.ts` and `board-tickets.ts` to order tickets within a queue; default `100` when absent so legacy tickets behave as today.

### Shared parsing and sort helpers

3. **Add `scripts/ticket-meta.ts`** — shared, unit-tested helpers for reading ticket surface fields from `index.md`. (`format-ticket-selection.ts` from the selection-menu plan should import from here once this lands; if it still inlines parsers, switch it to `ticket-meta.ts` in this step.)
   - Export `parsePriority(indexMd: string): number` — reads `**Priority:** <n>`; returns `100` when the line is absent, non-numeric, or empty. Reject/ignore negative values by clamping to `0` (or treat invalid as `100`; pick one and test it).
   - Export `compareTickets(a: { id: string; priority: number }, b: { id: string; priority: number }): number` — sort ascending by `priority`, then ascending by `id` (lexicographic, same as today's `listQueue().sort()`).
   - Export `async function readTicketMeta(ticketsDir: string, queue: string, id: string): Promise<{ id: string; priority: number; dependsOn: string[]; description: string }>` — reads `index.md`, reuses `parseDependsOn()` from `next-tickets.ts` and `parseDescription()` from `board-tickets.ts` (import, do not duplicate).
   - Keep this module free of queue-specific policy; it only parses and compares.

4. **Add `scripts/set-priority.ts`** — deterministic priority updates.
   - CLI: `set-priority.ts <id> <priority>`, run from `state/`.
   - Locate the ticket in any queue except `done/` and `aborted/` (same search pattern as `move.ts`). Error if not found or if target queue is terminal.
   - Read `index.md`, insert or replace the `**Priority:**` line (place it after `**Failures:**` when inserting), write back.
   - In `main()`, after a successful write, call `commitState(cwd, \`set priority ${id} -> ${priority}\`, [\`tickets/<queue>/<id>\`])` using the ticket's current queue path. Do not commit inside the exported core function (same pattern as `move.ts`).
   - Export `function setPriority(indexMd: string, priority: number): string` for unit tests.

### Queue machinery

5. **Update `scripts/move.ts`.**
   - Add `"backlog"` to the `QUEUES` array (with `blocked` and `aborted`, after the six pipeline queues). Update the file header comment.
   - No other logic changes; `backlog/` is a valid move target and source like `blocked/`.

6. **Update `scripts/next-tickets.ts`** — priority-ordered todo admission.
   - Import `parsePriority` and `compareTickets` from `ticket-meta.ts`.
   - Replace the linear scan over alphabetically sorted `todoIds` with:
     1. List all IDs in `todo/` (unchanged `listQueue`).
     2. For each ID, read `index.md`, compute `{ id, priority: parsePriority(indexMd), deps: parseDependsOn(indexMd) }`.
     3. Filter to actionable tickets (`deps.every(dep => done.has(dep))`).
     4. Sort actionable tickets with `compareTickets`.
     5. Take the first `todoBudget` IDs from the sorted list.
   - Update the file header comment: todo list is sorted by priority then ID, not ID alone.
   - Export `parseDependsOn` remains here (or re-export from ticket-meta if moved — prefer keeping it in `next-tickets.ts` and importing from there in `ticket-meta.ts` to avoid a circular import; if circular, move `parseDependsOn` into `ticket-meta.ts` and update `board-tickets.ts` import).

7. **Update `scripts/board-tickets.ts`.**
   - Add `"backlog"` to `QUEUES`, placed after `todo` and before `in-progress` (backlog is "upcoming work", visible early on the board).
   - Extend `BoardTicket` with `priority: number`.
   - In `readTicket()`, populate `priority` via `parsePriority()`.
   - Change `listQueue()` usage for `todo` and `backlog`: after listing IDs, read each ticket's priority and sort with `compareTickets` before slicing to `DISPLAY_LIMIT`. Other queues keep their current ordering (`done/` recent-first, others by ID).
   - Update the file header comment and `board-tickets.test.ts` fixtures accordingly.

8. **Confirm `scripts/setup-ticket.ts` stays todo-only.** It moves `tickets/todo/<id>/` → `in-progress/`; no change needed, but add a one-line comment that tickets in `backlog/` must be promoted to `todo/` first. Add a unit test (or extend `setup-ticket.test.ts`) asserting that calling `setup` when the ticket is only in `backlog/` fails with a clear error (if it does not already fail via `move()` — verify and test).

### Skills

9. **Add `.claude/commands/pb/promote.md`** — new skill `pb:promote`.
   - Link `docs/output-format.md` and `docs/ticket-selection.md` under **Output style**; mode **`pick-many`**.
   - Steps:
     1. Run `(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue backlog --fields priority,dependsOn --prompt 'Which to pull into todo? (number, several numbers, ticket ID, or "all")')`. If the menu shows no tickets, say so and stop.
     2. Print the script output verbatim; wait for the developer's pick. Resolve the selection per `docs/ticket-selection.md` (import `resolveSelection` behaviour — same rules as `pb:unblock`).
     3. Optionally ask whether to change priority on promotion (default: keep existing); if changed, `bun ../scripts/set-priority.ts <id> <n>` before or after the move.
     4. For each selected ID: `bun ../scripts/move.ts <id> todo` (from `state/`).
     5. Update `current-state.md`; commit via `commit-state.ts`.
   - Output: confirm each ticket's new queue (and priority if changed). No custom menu layout in this skill file — point at `docs/ticket-selection.md` for the `pick-many` backlog example if one is added there.

10. **Add `.claude/commands/pb/rank.md`** — new skill `pb:rank`.
    - Link `docs/output-format.md` and `docs/ticket-selection.md`; mode **`pick-many`**.
    - Steps:
      1. Run `format-ticket-selection.ts` with `--mode pick-many --queue todo --queue backlog --fields priority,dependsOn --prompt 'Which ticket(s) to rank? (number, several numbers, ticket ID, or "all")'` (global numbering across both sections per `docs/ticket-selection.md`).
      2. Print output verbatim; resolve selection per shared rules.
      3. For each selected ID, ask the new priority (lower = sooner) — one question per ticket, or a single priority if the developer gives one number for all selected.
      4. `bun ../scripts/set-priority.ts <id> <priority>` for each.
      5. Update `current-state.md` if it mentions ordering; commit when changed.
    - Document that priority affects `pb:next` admission order for actionable `todo/` tickets only.

11. **Update ticket-creating skills — always ask `todo` vs `backlog`.**
    - Add a shared rule (also state it in `docs/process.md` **Tickets**): before writing any new ticket directory, the skill **always** asks where it should land. Present a numbered choice with no default and do not create the ticket until the developer picks:
      ```
      Where should this ticket go?
      1. todo — ready for pb:next to pick up
      2. backlog — captured for later; pull to todo when ready
      ```
      Accept `1`/`2`, or the words `todo`/`backlog`. If the reply is ambiguous, ask again; never assume `todo/`.
    - `.claude/commands/pb/add.md`: after collecting ticket details, ask the numbered choice above, then create `state/tickets/<queue>/<id>/`. Set `**Priority:**` when the developer specifies one (default `100`). Commit path: `tickets/<queue>/<id>`.
    - `.claude/commands/pb/plan.md`: when breaking a feature into tickets, ask the numbered choice **once per batch** before creating any ticket directories in that step (all tickets in the batch share the chosen queue). When landing in `backlog/`, still set `**Depends on:**` and assign ascending priorities (e.g. first ticket `Priority: 10`, next `20`). Commit paths use the chosen queue.
    - `.claude/commands/pb/docs.md`: when doc changes imply new tickets, same numbered choice once per batch before creating directories.
    - `.claude/commands/pb/debug.md`: **Exception** — Debug tickets are always created in `todo/` (immediate attention); no ask. Fix tickets spawned after a proven Debug use the numbered ask unless the spawning sub-agent context makes `todo/` explicit in the ticket body.

12. **Update observability skills.**
    - `.claude/commands/pb/board.md`: mention `backlog/` in the description and steps; print `priority` per ticket using the same `[Pn]` / indented `priority:` style as `docs/ticket-selection.md`. Show `backlog` queue in the example output between `todo` and `in-progress`. Board display stays separate from selection menus (per selection-menu plan); only align priority field presentation.
    - `.claude/commands/pb/status.md`: inspect `backlog/`; add an informational **Backlog** heading (count + one line each) when non-empty; recommend `pb:promote` when the developer wants to pull work forward, or `pb:rank` to reorder `todo/`.
    - `.claude/commands/pb/help.md`: add `pb:promote` and `pb:rank` to the skills table; extend the queue tour with `backlog/` (side pen, not picked by `pb:next`); note that `todo/` order is by `**Priority:**` then ID.

### Process documentation

13. **Update `docs/process.md`.**
    - Queues section: add `backlog/` as a side pen (not a pipeline stage). `pb:next` never picks from it; pull to `todo/` explicitly via `pb:promote` or `move.ts`.
    - Tickets section: document `**Priority:**` on `index.md` (lower = sooner; default `100`; tie-break by ID). New tickets: the creating skill always asks `1. todo` / `2. backlog` before writing directories (see step 11); no silent default to `todo/`.
    - Development loop table: add `pb:promote` and `pb:rank` rows.
    - Clarify that the `-n` suffix in ticket IDs remains a reading-order hint only; `**Priority:**` is what governs `pb:next` admission among unblocked `todo/` tickets.

14. **Update `handbook.md`** (human reference): mirror `docs/process.md` with fuller prose — when to use `backlog/` vs `todo/`, how `pb:promote` works, how priority interacts with dependencies (priority only orders tickets whose dependencies are all in `done/`).

15. **Update `glossary.md`** (repo root).
    - Extend **Queue** definition to mention side pens include `backlog/` (captured work, not yet contenders), `blocked/`, and `aborted/`.
    - Add **Backlog**: the `backlog/` side pen; tickets here are outside the pipeline until promoted.
    - Add **Priority**: the numeric `**Priority:**` field on a ticket's `index.md`; lower values are admitted first by `pb:next`.

16. **Update `index.md`** (playbook orientation): list `pb:promote` and `pb:rank` under `.claude/commands/pb/`; mention `backlog/` under the state repo queues line.

17. **Update `scripts/CLAUDE.md`**: document `ticket-meta.ts`, `set-priority.ts`, and the new `backlog/` queue in the helpers list.

18. **Extend `docs/ticket-selection.md`.** Add worked `pick-many` examples for backlog promote and multi-queue rank (if not already present from the selection-menu plan), so `pb:promote` and `pb:rank` point at canonical examples in one place.

### Migration for existing projects

19. **Document one-time migration for bootstrapped state repos already in use.**
    - In `handbook.md` (short "Upgrading" note) or `templates/state/tickets/README.md`: create `state/tickets/backlog/` (with `.gitkeep` if empty), commit via `commit-state.ts`. Existing tickets need no `**Priority:**` line; they default to `100`.

## Unit Tests

- `ticket-meta.ts` — `parsePriority()`: returns `100` when line absent; parses integer; handles invalid/empty gracefully per chosen rule.
- `ticket-meta.ts` — `compareTickets()`: lower priority first; equal priority sorts by ID ascending.
- `set-priority.ts` — `setPriority()`: inserts `**Priority:**` after `**Failures:**` when missing; replaces existing line; leaves other fields intact.
- `set-priority.ts` — CLI/core: updates a ticket in `todo/` and `backlog/`; rejects unknown ID; rejects `done/` and `aborted/` tickets.
- `next-tickets.test.ts` — update "sorted" test: todo actionable tickets ordered by priority then ID (e.g. `auth-9` priority 10 before `auth-1` priority 50 before `search-1` priority 100); cap still applies after sort; dependency blocking unchanged.
- `move.test.ts` — move `backlog/` ↔ `todo/` round trip.
- `board-tickets.test.ts` — `backlog/` queue present; `todo` and `backlog` lists sorted by priority; `priority` field populated on each ticket.

## Smoke Tests

Add `scripts/smoke-ticket-priority.sh`:
- Build a throwaway `state/tickets/` fixture with three `todo/` tickets at priorities 30, 10, 20 (non-alphabetic IDs).
- Run `next-tickets.ts` from the fixture's state root; assert `todo` array order is `[priority-10-id, priority-20-id, priority-30-id]`.
- Run `set-priority.ts` to change one ticket's priority; re-run `next-tickets.ts`; assert order updated.
- Create a ticket in `backlog/`; assert `next-tickets.ts` `todo` does not include it; `move.ts` to `todo/`; assert it appears in `next-tickets.ts` output.
- Run `board-tickets.ts`; assert `backlog` key exists and tickets include `priority`.

Wire the smoke script into `scripts/package.json` `"smoke"` script alongside existing smoke tests.

## Verify

- Run all unit tests: `(cd /home/ash/playbook/scripts && bun run test)`.
- Run all smoke tests: `(cd /home/ash/playbook/scripts && bun run smoke)`.
- Grep the repo for hard-coded queue lists (`QUEUES` in `move.ts`, `board-tickets.ts`) and confirm `backlog` appears everywhere `blocked`/`aborted` side pens are enumerated; confirm `next-tickets.ts` does **not** include `backlog` in its driven queues.
- Grep `.claude/commands/pb/{promote,rank}.md` for `format-ticket-selection.ts` and `docs/ticket-selection.md`; confirm neither skill defines its own menu layout.
- Manually run `(cd state && bun ../scripts/next-tickets.ts)` against a scratch fixture (or temp dir) and confirm JSON todo order matches priority.

## Notes

- **Prerequisite:** Implements after [plan-ticket-selection-menu.md](plan-ticket-selection-menu.md). Reuse `format-ticket-selection.ts` and `docs/ticket-selection.md`; do not duplicate menu rules in `pb:promote` / `pb:rank`.
- **Why a side pen, not priority alone?** Putting everything in `todo/` with low priority still mixes "not ready to build" with "ready but deprioritized". `backlog/` makes intent explicit: those tickets are invisible to `pb:next` until pulled to `todo/`.
- **Default priority `100`:** Keeps backward compatibility; existing projects need no mass edit. Bootstrap tickets that should jump the queue (e.g. "get tests green") can use `Priority: 1` in the ticket body.
- **Priority vs dependencies:** Priority only orders tickets that are already actionable (all deps in `done/`). A high-priority ticket blocked on an unmerged dependency is still omitted from `next-tickets.ts` output, same as today.
- **No automatic demotion:** Failed tickets returning to `todo/` keep their priority. The developer lowers priority or moves to `backlog/` explicitly if rework should wait.
- **Naming:** `backlog/` follows standard agile/kanban terminology for work that is captured but not yet ready for implementation (promotion to `todo/` is explicit). Skill descriptions can say "contenders" in prose when explaining that step.
- **Queue at creation:** Every ticket-creating skill (`pb:add`, `pb:plan`, `pb:docs`) always presents `1. todo` / `2. backlog` before writing directories; no default. `pb:plan`/`pb:docs` ask once per batch. `pb:debug` is the exception (always `todo/`).
