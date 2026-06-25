# Developer notes log

## Overview
The process needs a way to surface details to the developer that are **not tied to a particular ticket** but that they should know or act on (an environmental failure, a halted run, a broken main, a heads-up about the project, a reminder). Today this lived in the `⚠ Needs your action` section of `current-state.md`, which is being removed (see `plan-remove-current-state-md.md`). This plan adds a small, durable **developer notes log**: any skill can append a note; outstanding notes are shown to the developer when they use Playbook; and the developer can action each note (mark it done, understood, or skipped). Addressed notes are removed automatically, so the log only ever shows what still needs attention. Notes live in the state repo (per-project state, committed as part of the audit log), separate from the ticket queues.

## Issues
<!-- Leave empty — populated later by plan:check -->

## Steps

This adds one storage file, one library + one CLI script (with tests), a presentation step in `pb:review`, surfacing in `pb:status`, template + bootstrap wiring, and doc updates. It does not change any ticket-queue mechanics.

### A. Data model and storage
1. Notes live in a single file `state/notes.md` in the state repo (human-readable, committed so its history is part of the audit log). One note per entry. Each note has:
   - **id**: short stable handle `n<N>` where `N` is `max(existing ids) + 1` (so ids never collide or get reused within a file). Parsed from the file, not a separate counter.
   - **created**: ISO date (the agent passes the date in; scripts do not call the clock directly so they stay testable).
   - **status**: one of `open`, `done`, `understood`, `skipped`. New notes are `open`.
   - **text**: the note body (one or a few plain lines).
   - **source** (optional): the skill or context that raised it (e.g. `pb:next`, `pb:debug`), for the developer's orientation.
2. File format: a markdown list, newest first, each note a single list item carrying its fields, e.g. a leading `- [n3] (open, 2026-06-25, pb:next) <text>` shape (exact rendering decided in the lib; keep it greppable and human-scannable). The file opens with a one-line header comment explaining it is the developer notes log, not a ticket queue and not a status file.
3. **Auto-removal rule:** `done` and `understood` mean *addressed* — the note is deleted from the file when actioned. `skipped` means *leave it for now* — the note is kept but its status flips to `skipped` so the menu can show it dimmed / at the bottom and stop treating it as new. (So "outstanding" = `open` + `skipped`; "addressed" = removed.)

### B. Library: `scripts/lib/notes.ts` (pure, unit-tested)
4. Create `scripts/lib/notes.ts` exporting pure functions over the notes-file text (no I/O), mirroring the style of `scripts/lib/ticket-meta.ts` / `scripts/lib/review-snapshot.ts`:
   - `type Note = { id: string; created: string; status: 'open'|'done'|'understood'|'skipped'; text: string; source?: string }`
   - `parseNotes(markdown: string): Note[]` — parse the file into notes (newest first).
   - `serializeNotes(notes: Note[]): string` — render notes back to the file format (stable, idempotent: `parse` ∘ `serialize` is identity).
   - `nextId(notes: Note[]): string` — compute the next `n<N>` id.
   - `addNote(notes: Note[], input: { text: string; created: string; source?: string }): Note[]` — prepend a new `open` note.
   - `resolveNote(notes: Note[], idOrText: string, status: 'done'|'understood'|'skipped'): Note[]` — for `done`/`understood`, remove the note; for `skipped`, set its status to `skipped`. Matches by id (preferred) or exact id token; throws if no match.
   - `outstanding(notes: Note[]): Note[]` — notes with status `open` or `skipped`, `open` first.

### C. CLI: `scripts/notes.ts`
5. Create `scripts/notes.ts` (run with the state repo as the working directory, same convention as the other scripts) wrapping the lib with file I/O and commits. Subcommands:
   - `add "<text>" [--source <s>] [--date <iso>]` — read `notes.md` (treat missing as empty), `addNote`, write, then commit via the existing commit helper: `bun ../scripts/commit-state.ts "add note" notes.md` (or call the `lib/commit-state` function directly, matching how the other mutator scripts auto-commit). Print the new note id.
   - `list [--json]` — print outstanding notes as a numbered menu (number, id, status, text), or JSON for programmatic use. Returns a clear "No outstanding notes." when empty.
   - `resolve <id|number> <done|understood|skipped> [--date <iso>]` — resolve one note, write, and commit (`"resolve note <id> (<status>)"`). The number maps to the most recent `list` ordering; prefer id when given.
   - Keep the command surface small; do not add editing/reordering. The agent passes `--date` (today) so the script never reads the clock.
6. Notes scripts must be lock-safe and ticket-independent: committing `notes.md` is its own commit and never bundled with a ticket move, so it cannot race a `move.ts` ticket-scoped commit.

### D. Raising notes from skills
7. Add a short shared instruction (in `docs/process.md`, see Section G) that any skill surfacing a non-ticket item the developer should know or act on does so with `bun ../scripts/notes.ts add "<text>" --source <skill> --date <today>` (run from `state/`), in addition to mentioning it in chat. This is the durable channel; chat alone is transient.
8. Wire the obvious raisers (these are the items that previously went to the `⚠ Needs your action` section of `current-state.md`):
   - `pb:next` (`.claude/commands/pb/next.md`): on a setup failure → `blocked/`, a broken main, or an environmental/systemic-failure run-halt, add a note as well as reporting in chat. On a session-interrupt handback, add a note "Run interrupted (session limit); resume with pb:next".
   - `pb:debug` (`.claude/commands/pb/debug.md`): on the escalation rule (three+ failed hypotheses), add a note instead of (previously) surfacing via `current-state.md`.
   - `pb:reset` (`.claude/commands/pb/reset.md`): if a systemic-failure halt prompted the reset, the agent may add or resolve the relevant note.
   These edits assume `plan-remove-current-state-md.md` has landed; if this plan is implemented first, the same edits replace the `current-state.md` surfacing directly.

### E. Presenting and actioning notes in `pb:review`
9. Edit `.claude/commands/pb/review.md`: add a **first step, before the ticket-review loop**, that presents outstanding notes and lets the developer action them:
   - Run `bun ../scripts/notes.ts list` (from `state/`) to render the outstanding notes as a numbered list.
   - If there are none, print "No outstanding notes." and proceed straight to the ticket loop.
   - Otherwise loop: the developer picks a note by number or id and chooses an action — `done`, `understood`, or `skip` (or `stop` to move on to ticket review). For each choice, run `bun ../scripts/notes.ts resolve <id> <status> --date <today>`. `done`/`understood` remove the note; `skip` keeps it for a later session. Re-render the remaining outstanding notes after each action until the developer stops or the list is empty.
   - Keep the interaction style consistent with the existing ticket menu (`format-ticket-selection.ts` pick-one-loop): numbered, resolved items shown actioned, accept a number or id.
10. Do not block ticket review on notes: the developer can `stop` at any point and the unresolved notes simply remain outstanding for next time.

### F. Surfacing the count elsewhere
11. Edit `.claude/commands/pb/status.md`: after summarising the queues, run `bun ../scripts/notes.ts list` and include outstanding notes in the summary (count + one line each), so `/pb:status` shows non-ticket items the developer should act on. This is the `current-state.md`-free replacement for the old `⚠ Needs your action` banner.
12. Edit `.claude/commands/pb/board.md`: add a single trailing line showing the outstanding-notes count (e.g. "Notes: 2 outstanding") so the bare board hints at them, without the per-note detail (that stays `pb:status` / `pb:review`).

### G. Templates, bootstrap, and docs
13. Add `templates/state/notes.md` containing only the header comment and an empty list (the starting state). Add a bullet for it to `templates/index.md`.
14. `templates/state/CLAUDE.md`: note that the state repo also holds `notes.md`, the developer notes log (non-ticket items), distinct from the ticket queues.
15. `bootstrap/new.md` and `bootstrap/existing.md`: include `notes.md` in the files copied from `templates/state/`, and have `existing` seed a note for anything it wants the developer to know at import time (e.g. a red test suite) instead of writing it into `current-state.md`.
16. `docs/process.md`: add a short subsection (near the Queues / "Surface it" material) describing the developer notes log: what it is (durable, non-ticket items for the developer), where it lives (`state/notes.md`), how notes are raised (`notes.ts add`), how they are actioned (`pb:review`, statuses `done`/`understood`/`skipped`), and that addressed notes are auto-removed. State explicitly that notes are **not** a ticket queue and never track in-flight ticket work (that is the queues).
17. `glossary.md`: add a `**developer notes / notes.md**` entry.
18. `index.md`: add a bullet for `state/notes.md`.
19. `docs/decisions.md` (created by `plan-remove-current-state-md.md`): if that plan has landed, add a dated entry "Added developer notes log" recording that the non-ticket `⚠ Needs your action` role of `current-state.md` was replaced by `state/notes.md`. If this plan lands first, create the decisions entry as part of the other plan instead (cross-reference, do not duplicate).

## Unit Tests
- `scripts/lib/notes.test.ts` covering `parseNotes`, `serializeNotes` (round-trip idempotency on a multi-note fixture), `nextId` (empty file → `n1`; gaps respected, no reuse), `addNote` (prepends as `open`), `resolveNote` (`done`/`understood` remove; `skipped` flips status; unknown id throws), and `outstanding` (filters and orders `open` before `skipped`).
- `scripts/notes.test.ts` covering the CLI: `add` then `list` shows the note; `resolve <id> done` removes it; `resolve <id> skipped` keeps it as skipped; `list` on an empty/missing file prints the empty message; bad arguments exit non-zero. Use a temp state dir fixture as the other CLI tests do.

## Smoke Tests
- Add `scripts/smoke-notes.sh` (mirroring `smoke-move.sh` / `smoke-commit-state.sh`): in a throwaway git-backed state dir, `add` two notes, `list` (assert both shown, numbered), `resolve` one as `done` (assert removed), `resolve` one as `skipped` (assert kept, marked skipped), `list` again (assert the skipped one still shows), and assert each mutating command produced a state-repo commit.

## Verify
1. Run the full unit suite from `scripts/` and confirm all tests pass, including the two new test files.
2. Run all `scripts/smoke-*.sh` including the new `smoke-notes.sh`; all pass.
3. Manually exercise the CLI in a scratch state dir: `notes.ts add`, `list`, `resolve … done`, `resolve … skipped`, and confirm `notes.md` content and commits match expectations.
4. Confirm `templates/state/notes.md` exists and is the empty starting state, and that `templates/index.md`, `index.md`, `glossary.md`, and `docs/process.md` reference the notes log.
5. Read `pb:review`, `pb:status`, and `pb:board` end-to-end to confirm the notes step/summary reads cleanly and step numbering is consistent.

## Notes
- **Relationship to `plan-remove-current-state-md.md`:** that plan removes the file; this plan provides the durable replacement for its one non-derived job (non-ticket items the developer should act on). They are independent but complementary. Implement the removal first if possible, so the skill edits in Section D/E replace `current-state.md` surfacing rather than adding a parallel channel. Order is not strictly required; the cross-references above handle either sequence.
- **Why a file in the state repo, not a ticket:** these items are not units of work to be implemented, reviewed, and merged; they are messages to the developer. Modelling them as tickets would pollute the queues and the board. A separate, tiny, auto-pruning log keeps them out of the pipeline.
- **Why not just chat:** chat is transient and lost across sessions. The notes log persists across sessions and is committed, so a heads-up raised during an autonomous `pb:next` run is still there when the developer next opens Playbook.
- **Open question (scope):** whether notes need a type/severity (info vs action-needed) or whether the three statuses are enough. Started minimal (no type); `plan:simp` can confirm. If a type is later wanted, it is an additive field on `Note` and one extra column in the menu.
- **Determinism:** scripts take `--date` from the caller and never read the clock, matching the repo's testability convention (the same reason workflow scripts avoid `Date.now`).
