# Shared Ticket Selection Menu

## Overview

Skills that ask the developer to pick ticket(s) each invent their own menu shape today. `pb:review` uses a checklist with fixed numbers and `pb:unblock` uses a simpler numbered list with multi-select and `all`; planned `pb:rank` and `pb:promote` (in `plan-ticket-backlog-and-priority.md`) specify only “list tickets, pick by number or ID” with no wireframe. There is no shared definition in `output-format.md`, `process.md`, or the glossary.

This plan adds a single reference — `docs/ticket-selection.md` — plus a deterministic formatter/parser in `scripts/format-ticket-selection.ts`, then points every ticket-picking skill at them. The **inspect loop** in `pb:review` (numbered ways to examine one ticket) stays skill-local; this plan covers only **ticket selection** (choosing which ticket(s) to act on).

Agent-facing auxiliary docs (`process.md`, `output-format.md`) move under `docs/` first so the repo root stays uncluttered; see step 0. `glossary.md` stays at the repo root (mainly human-facing; agents still use it for terminology when needed).

## Issues

<Leave empty — populated later by plan:check>

## Steps

### Agent docs layout

0. **Relocate agent-facing docs under `docs/`.** Keeps the repo root for entry points only; groups auxiliary AI reference beside `docs/plans/`.

   **Move** (content unchanged, `git mv`):
   - `process.md` → `docs/process.md`
   - `output-format.md` → `docs/output-format.md`

   **Stay at repo root** (human-facing, orientation, or shared terminology):
   - `README.md`, `CLAUDE.md`, `handbook.md`, `index.md`, `glossary.md`

   **Update references** (grep each old path; no stub files at old locations):
   - `CLAUDE.md`: session-start read `docs/process.md`; terminology from `glossary.md` (repo root); orientation still `index.md`.
   - `index.md`: **In this playbook** lists `docs/process.md`, `docs/output-format.md`, `glossary.md`, `docs/ticket-selection.md` (after step 1), `docs/plans/`.
   - `README.md`: layout tree and Further reading links.
   - `handbook.md`: links to `docs/process.md`; `glossary.md` stays at root.
   - `docs/process.md`: fix relative links to `handbook.md`, `index.md`, `docs/output-format.md`, skill paths.
   - Every `.claude/commands/pb/**/*.md` **Output style** link: `../../../docs/output-format.md` (bootstrap: `../../../../docs/output-format.md`).
   - `templates/state/CLAUDE.md` and any other templates mentioning playbook doc paths.
   - In-flight plans under `docs/plans/` that cite `process.md` at repo root (update line refs or leave as historical in `done/` — update `new/` only).

### Shared specification

1. **Add `docs/ticket-selection.md`** (peer of `docs/output-format.md`). Structure:

   **Scope.** Applies to any skill that presents a numbered list of tickets and waits for the developer to pick. Does not apply to `pb:board`/`pb:status` (display-only) or to per-ticket action menus (e.g. the inspect loop in `pb:review`).

   **Data source.** Build the menu from `index.md` only (ID, one-line description, `**Depends on:**`, `**Failures:**`, `**Priority:**` when present). Never read `detail.md` before a ticket is selected. Always render the menu with `(cd state && bun ../scripts/format-ticket-selection.ts …)` and show its verbatim output; hand-typing or hand-formatting the menu is never legal when a script does the job. There is no fallback: if the script cannot represent a case, fix the script.

   **Two interaction modes** (skill declares which):

   | Mode | Use when | Developer picks | Loop |
   |---|---|---|---|
   | `pick-many` | One-shot action on one or more tickets (`pb:unblock`, `pb:promote`, `pb:rank`) | One number, several numbers (space- or comma-separated), a ticket ID, or `all` | No — act once, then report |
   | `pick-one-loop` | Repeated single-ticket work until done or stop (`pb:review`) | One number or ticket ID per turn; `q` / `quit` / `stop` ends the loop | Yes — reprint menu after each ticket is processed |

   **Numbering rules (both modes).**
   - Numbers start at **1**, contiguous, and are **fixed for the session** in `pick-one-loop` (never renumber when items are checked off).
   - In menus spanning multiple queues, numbering is **global** across sections (section headers do not reset the count).
   - Each line: `N. <id> — <description>` (em dash between ID and description).
   - Optional fields appear **indented on the line below** the ticket line, never inline prose:
     - `depends on: <ids>` when non-empty
     - `priority: <n>` when the skill cares about priority (or `[Pn]` prefix on the ticket line — pick one style in the doc and use it consistently; recommend `[Pn]` prefix only when every ticket has a priority, else indented `priority:` line)
     - `failures: <n>` when showing blocked tickets
   - Section header when one queue: `<Queue label> (<count>)` e.g. `Blocked (2)`.
   - Section header when several queues: repeat per queue with its own count.
   - Empty source: print `<Queue label> (0)` or a single line `No tickets in <queue>.` and **stop the skill** without asking a question.

   **Prompt line.** Immediately after the menu, one question line naming the mode’s accepted input. Examples:
   - `pick-many`: `Which to unblock? (number, several numbers, ticket ID, or "all")`
   - `pick-one-loop`: `Which ticket do you want to review? (number, ticket ID, or stop)`

   **`pick-one-loop` checklist variant** (required for `pb:review` only). Above the numbered lines, a progress header: `Review (<k> of <n> done)`. Each ticket line is prefixed with `[ ]` or `[x]`; processed lines keep their number and gain an outcome suffix: `— approved`, `— rejected`, `— skipped`, `— aborted`. Unchecked tickets stay selectable; checked tickets that left the queue cannot be reselected (tell the developer and reprint).

   **After selection.** `pick-many`: validate with `resolveSelection()` (see step 2), then act on every resolved ID. `pick-one-loop`: act on one ticket, update checklist state, reprint full menu + prompt. Invalid input: say what was wrong in one line and reprint the menu; do not guess.

   **Worked examples.** Include three copy-paste examples in the doc: `pick-many` blocked (matches current `pb:unblock` example), `pick-many` multi-queue with priority (for future `pb:rank`), `pick-one-loop` checklist (matches current `pb:review` example).

2. **Add `scripts/format-ticket-selection.ts`** — single formatter and selection resolver.

   Export types:
   ```typescript
   export type SelectionMode = "pick-many" | "pick-one-loop";

   export interface SelectionTicket {
     id: string;
     description: string;
     dependsOn?: string[];
     priority?: number;
     failures?: number;
     queue?: string;       // section label when multi-queue
     checked?: boolean;    // pick-one-loop only
     outcome?: string;     // e.g. "approved", "skipped"
   }

   export interface FormatOptions {
     mode: SelectionMode;
     sections: { label: string; tickets: SelectionTicket[] }[];
     prompt: string;
     progress?: { done: number; total: number };  // pick-one-loop: drives "k of n done" header
   }

   export function formatTicketSelection(opts: FormatOptions): string;
   export function resolveSelection(
     input: string,
     tickets: SelectionTicket[],
     mode: SelectionMode,
   ): { ids: string[] } | { error: string };
   ```

   Behaviour:
   - `formatTicketSelection`: renders exactly the layout in `docs/ticket-selection.md` (headers, numbering, optional fields, prompt). Assign global numbers in section order.
   - `resolveSelection`: trim input; map numbers to IDs using the same global order; accept ticket IDs case-sensitively; `all` → every unchecked ticket in `pick-many` (in `pick-one-loop`, `all` is an error); `q`/`quit`/`stop` → `{ ids: [] }` with a sentinel or separate `stopped: true` flag (export `ResolveResult` union); reject out-of-range numbers and unknown IDs with a clear `error` string; multiple numbers in one reply (`1 3`, `1, 3`, `1,3`) resolve to multiple IDs in `pick-many`.
   - CLI (run from `state/`): `format-ticket-selection.ts --mode pick-many --queue blocked --fields failures --prompt "Which to unblock? (number, several numbers, ticket ID, or \"all\")"`. Flags: `--mode`, `--queue` (repeatable), `--fields` (comma list: `dependsOn`, `priority`, `failures`), `--prompt`, optional `--checklist` JSON file for loop state. Prints the menu to stdout. Second subcommand or flag `--resolve "<input>"` with `--state <json>` for testing resolution without acting.
   - Implementation: reuse `board()` / `readTicket()` from `board-tickets.ts` and `parsePriority` from `ticket-meta.ts` when that module exists; until `ticket-meta.ts` lands, inline `parsePriority`/`parseDependsOn` imports from `next-tickets.ts` and `board-tickets.ts` as today. Read `**Failures:**` from `index.md` with a small local parser (same pattern as `fail-ticket.ts`).

3. **Extend `scripts/board-tickets.ts`** (small, if needed for the formatter).
   - Export `readTicket()` or add optional `failures: number` to `BoardTicket` parsed from `index.md` so the formatter does not duplicate field parsers. Keep the change minimal; prefer extending `BoardTicket` over a third parser.

4. **Update `docs/output-format.md`.** Add one bullet: interactive ticket menus follow `docs/ticket-selection.md`; skills link both files under **Output style**.

5. **Update `docs/process.md`.** After the **Output style** paragraph, add a short **Ticket selection** paragraph: any skill that asks the developer to choose ticket(s) must follow `docs/ticket-selection.md` and use `format-ticket-selection.ts`; name the two modes; note that `pb:review`'s inspect loop is separate.

6. **Update `handbook.md`.** Add a **Ticket selection menu** subsection (under the `pb:review` area or a new **Developer interaction** section): plain-language summary of the two modes, link to `docs/ticket-selection.md`, note that numbering is stable in review.

7. **Update `glossary.md`** (repo root). Add **Ticket selection menu**: the numbered list + prompt used when a skill asks the developer to pick ticket(s); defined in `docs/ticket-selection.md`, formatted by `format-ticket-selection.ts`. Distinguish from the **inspect loop** (per-ticket action menu in `pb:review`).

8. **Update `index.md`.** List `docs/ticket-selection.md` and the other `docs/` agent references under **In this playbook**.

9. **Update `scripts/CLAUDE.md`.** Document `format-ticket-selection.ts` and when skills must call it.

### Align existing skills

10. **Refactor `.claude/commands/pb/unblock.md`.**
    - Under **Output style**, link `docs/ticket-selection.md` (`../../../docs/ticket-selection.md`) and state mode `pick-many`.
    - Replace step 1–3 menu prose with: run `(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue blocked --fields failures --prompt '…')`; if output shows zero tickets, stop; otherwise print stdout verbatim and wait for input; resolve with the shared rules (or `--resolve` in tests).
    - Replace the **Example** block with the example from `docs/ticket-selection.md` (blocked / pick-many) so there is one canonical example.

11. **Refactor `.claude/commands/pb/review.md`.**
    - Link `docs/ticket-selection.md`; state mode `pick-one-loop` with checklist variant.
    - In step 1 (**List as a checklist**), replace hand-rolled checklist formatting rules with: maintain checklist state in session context (`checked`, `outcome` per ID); call `format-ticket-selection.ts` with `--mode pick-one-loop --queue human-review --checklist <session-json>` (or pass checklist via stdin JSON) to render; keep all review-specific rules (snapshot order, never reorder, lazy `detail.md` read, inspect loop, resolve commands) in this file.
    - Trim duplicated numbering/checklist prose that now lives in `docs/ticket-selection.md`; keep the inspect loop and Responses table unchanged.
    - Point the **Example** at the `pick-one-loop` example in `docs/ticket-selection.md`.

### Wire planned skills

12. **Skipped.** `pb:promote` and `pb:rank` are defined in [plan-ticket-backlog-and-priority.md](plan-ticket-backlog-and-priority.md), which runs after this plan and assumes the shared ticket selection menu exists.

### Tests and packaging

13. **Add `scripts/format-ticket-selection.test.ts`.**
    - `formatTicketSelection` pick-many: correct headers, global numbers across two sections, optional fields, prompt line.
    - `formatTicketSelection` pick-one-loop: progress header, `[ ]`/`[x]` prefixes, outcome suffix, fixed numbers when middle item checked.
    - `resolveSelection` pick-many: single number, multiple numbers, ticket ID, `all`, empty input, out-of-range, unknown ID.
    - `resolveSelection` pick-one-loop: single number/ID, stop synonyms, reject `all`.

14. **Add `scripts/smoke-format-ticket-selection.sh`.**
    - Build a throwaway `state/tickets/` fixture with tickets in `blocked/` and `todo/`.
    - Run CLI pick-many for `blocked`; assert stdout contains `1.`, `failures:`, and the prompt line.
    - Run CLI with two queues; assert ticket 2 is in the second section but still numbered globally.
    - Run `--resolve "1, 3"` and assert correct IDs on stdout.

15. **Wire smoke script** into `scripts/package.json` `"smoke"` script.

## Unit Tests

- `format-ticket-selection.ts` — `formatTicketSelection()` for `pick-many` and `pick-one-loop` (cases listed in step 13).
- `format-ticket-selection.ts` — `resolveSelection()` for both modes (cases listed in step 13).
- `board-tickets.ts` — if `failures` (or exported `readTicket`) is added, one test that `failures` is parsed from `index.md`.

## Smoke Tests

- `scripts/smoke-format-ticket-selection.sh` (step 14): CLI menu shape and `--resolve` for a fixture with `blocked/` and `todo/` tickets.

## Verify

- Run all unit tests: `(cd /home/ash/playbook/scripts && bun run test)`.
- Run all smoke tests: `(cd /home/ash/playbook/scripts && bun run smoke)`.
- Grep `.claude/commands/pb/{unblock,review}.md` for `docs/ticket-selection.md` and confirm hand-rolled menu layout prose is removed in favour of the script + shared doc.
- Grep `docs/plans/new/plan-ticket-backlog-and-priority.md` for `docs/ticket-selection.md` on the promote/rank steps.
- Grep the repo for bare `output-format.md` / `process.md` at repo root (should be no references except git history); confirm `docs/` holds the moved files. `glossary.md` remains at repo root.
- Read `docs/ticket-selection.md` and confirm it contains both modes, numbering rules, prompt templates, and three worked examples.

## Notes

- **Inspect loop stays local.** `pb:review`'s per-ticket menu (screenshots, run tests, diff, …) is an action menu, not ticket selection. A future `action-selection.md` could generalise that later; out of scope here.
- **Checklist state.** The formatter is stateless; `pick-one-loop` passes checklist JSON in so rendering stays deterministic and testable. The skill owns the JSON between turns.
- **Dependency on backlog plan.** `format-ticket-selection.ts` should import `parsePriority` from `ticket-meta.ts` when it exists; until then import from `next-tickets.ts` / inline. Implementing this plan does not require implementing `plan-ticket-backlog-and-priority.md`, but that plan should be updated (step 12) so promote/rank do not invent a second menu shape.
- **`pb:board` display vs selection.** Board listing for humans (`pb:board`) may keep its own indent style; only **selection** menus must use the formatter. Optionally align field order later; not required for this plan.
- **Agent docs under `docs/`.** `process.md` and `output-format.md` move out of the repo root; `glossary.md`, `handbook.md`, and `index.md` stay at root. `CLAUDE.md` must be updated — it is what tells the agent to read `docs/process.md` at session start.
- **No new slash command.** This is a shared doc + script; skills opt in by linking the doc and calling the script.
