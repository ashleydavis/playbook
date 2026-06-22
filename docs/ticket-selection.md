# Ticket selection menu

The shared format for any skill that presents a numbered list of tickets and waits for the developer to pick. Defined here and rendered by `scripts/format-ticket-selection.ts`. Skills link this doc under **Output style** and call the script so every menu has the same shape.

## Scope

Applies to skills that ask the developer to choose ticket(s) before acting. Does **not** apply to:

- `pb:board` / `pb:status` (display-only listings)
- Per-ticket action menus (e.g. the **inspect loop** in `pb:review`)

## Data source

Build the menu from each ticket's `index.md` only: ID, one-line description, `**Depends on:**`, `**Failures:**`, and `**Priority:**` when present. Never read `detail.md` before a ticket is selected.

**The menu shown to the developer must be the verbatim stdout of the script, run fresh every time you display it.** Hand-typing the list is never legal: do not reconstruct it from memory, paraphrase it, retype it, or re-use the output of an earlier turn. The queues change between turns (a ticket may be approved, rejected, skipped, or moved by another session), so any list you produce yourself silently misrepresents the live state — if you typed it, it is wrong by construction. Run the script, then paste exactly what it printed and nothing else.

```bash
(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-many --queue blocked --fields failures --prompt 'Which to unblock? (number, several numbers, ticket ID, or "all")')
```

There is no hand-formatting fallback. If the script genuinely cannot represent a case, fix the script; never work around it by typing the menu by hand.

## Interaction modes

| Mode | Use when | Developer picks | Loop |
|---|---|---|---|
| `pick-many` | One-shot action on one or more tickets (`pb:unblock`, `pb:promote`, `pb:rank`) | One number, several numbers (space- or comma-separated), a ticket ID, or `all` | No — act once, then report |
| `pick-one-loop` | Repeated single-ticket work until done or stop (`pb:review`) | One number or ticket ID per turn; `q` / `quit` / `stop` ends the loop | Yes — reprint menu after each ticket is processed |

## Numbering rules (both modes)

- Numbers start at **1**, are contiguous, and are **fixed for the session** in `pick-one-loop` (never renumber when items are checked off).
- In menus spanning multiple queues, numbering is **global** across sections (section headers do not reset the count).
- Each line: `N. <id> — <description>` (em dash between ID and description).
- Optional fields appear **indented on the line below** the ticket line:
  - `depends on: <ids>` when non-empty
  - `priority: <n>` when the skill cares about priority
  - `failures: <n>` when showing blocked tickets
- Section header when one queue: `<Queue label> (<count>)` e.g. `Blocked (2)`.
- Section header when several queues: repeat per queue with its own count.
- Empty source: print `No tickets in <Queue label>.` (single queue) or section headers with `(0)` (multi-queue), and **stop the skill** without asking a question.

## Prompt line

Immediately after the menu, one question line naming the mode's accepted input:

- `pick-many`: `Which to unblock? (number, several numbers, ticket ID, or "all")`
- `pick-one-loop`: `Which ticket do you want to review? (number, ticket ID, or stop)`

## `pick-one-loop` checklist variant (`pb:review` only)

Above the numbered lines, a progress header: `Review (<k> of <n> done)`.

Each ticket line is prefixed with `[ ]` or `[x]`; processed lines keep their number and gain an outcome suffix: `— approved`, `— rejected`, `— skipped`, `— aborted`.

Unchecked tickets stay selectable; checked tickets that left the queue cannot be reselected (tell the developer and reprint).

### Review snapshot (source of truth)

`pb:review` does **not** drive the checklist off the live `human-review/` directory (a resolved ticket would vanish from the list and the numbers would shift). Instead the **review snapshot** is the source of truth:

- `start-review.ts` snapshots `human-review/` into the review snapshot: a temporary, git-ignored JSON file (`state/.pb-review-snapshot.json`). The snapshot order fixes the numbering for the session, and each row carries a precomputed **card** (summary, evidence inventory, screenshot paths, tailored inspect menu) so the loop renders without re-reading `detail.md`/`evidence/` each turn.
- `format-ticket-selection.ts --snapshot <path>` renders the checklist from the review snapshot. A row stays in it — checked, with its outcome — after the ticket leaves the queue, so nothing disappears or renumbers. The live queue is read only to refresh the description of a ticket still present.
- `--mark <id> --outcome <approved|rejected|skipped|aborted>` ticks a row, rewrites the snapshot, and reprints. This is the only way `pb:review` mutates the snapshot; it is never hand-edited.
- Every write stamps `updatedAt`. On render, a snapshot older than `--max-age` seconds (default 6h) is rebuilt from the live queue, with a "stale … rebuilt" notice on stderr.

(The legacy `--checklist <json>` flag, which annotates the live queue rather than driving it, is superseded by `--snapshot` for `pb:review`.)

## After selection

- `pick-many`: validate with `resolveSelection()` (or CLI `--resolve`), then act on every resolved ID.
- `pick-one-loop`: act on one ticket, update checklist state, reprint full menu + prompt.
- Invalid input: say what was wrong in one line and reprint the menu; do not guess.

## Worked examples

### `pick-many` — blocked (`pb:unblock`)

```
Blocked (2)
1. treemap-tooltip-1 — custom treemap hover tooltip
   failures: 3
2. flaky-smoke-1 — smoke suite intermittently times out on this host
   failures: 3

Which to unblock? (number, several numbers, ticket ID, or "all")
```

### `pick-many` — backlog promote (`pb:promote`)

```
Backlog (2)
1. infra-2 — upgrade test runner
   priority: 100
2. docs-5 — rewrite onboarding guide
   priority: 50
   depends on: docs-1

Which to pull into todo? (number, several numbers, ticket ID, or "all")
```

### `pick-many` — multi-queue rank (`pb:rank`)

```
Todo (2)
1. auth-9 — session refresh endpoint
   priority: 10
   depends on: auth-1
2. search-1 — debounced search input
   priority: 50
Backlog (1)
3. infra-2 — upgrade test runner
   priority: 100

Which ticket(s) to rank? (number, several numbers, ticket ID, or "all")
```

### `pick-one-loop` — checklist (`pb:review`)

```
Review (1 of 3 done)
[x] 1. search-3 — debounced search input — approved
[ ] 2. search-4 — result ranking
[ ] 3. search-5 — fuzzy matching

Which ticket do you want to review? (number, ticket ID, or stop)
```
