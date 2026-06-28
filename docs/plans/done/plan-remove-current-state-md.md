# Remove current-state.md

## Overview
`current-state.md` is a per-project, human-readable summary file that sits on top of the ticket queues at `state/current-state.md`. The developer does not use it. It is a derived view (the queues are already the source of truth), so it adds no information that `/pb:status` and `/pb:board` cannot regenerate live from the queues. Maintaining it forces almost every skill to read it, edit it, and commit it on every queue change, which slows the agent down and, because the parent agent must be its sole committer (a shared-file write would race parallel sub-agents), it is a structural obstacle to running multiple agents against the same state repo at once. This plan removes `current-state.md` entirely from the templates, skills, docs, and script comments, and makes `/pb:status` and `/pb:next` surface "needs your action" information directly from the live queues (in chat) instead of from a maintained file.

### Why the developer wants this (recorded reasons)
- The developer does not use the file.
- The AI does not need it: the queues are the source of truth and `/pb:status` already regenerates the same view from them on demand.
- It slows the AI down: nearly every skill does an extra read, edit, and commit of this file on every queue change.
- It blocks parallelism: because the file is shared mutable state with a single-committer rule, it prevents multiple AIs from using the same Playbook state repo at the same time.

## Issues
<!-- Leave empty — populated later by plan:check -->

## Steps

The work is doc/instruction editing across the playbook, deletion of the template file, and comment-only edits to three scripts. Done plans under `docs/plans/done/` are immutable history and must NOT be edited. The project repo under `project/` and its worktrees are out of scope.

### A. Decide the replacement behaviour (applied throughout the edits below)
1. The ticket queues under `state/tickets/` remain the single source of truth. Nothing in this plan changes queue mechanics, the move/fail/reset/setup scripts, or `commit-state.ts` (it stays; it is still used to commit newly created tickets and other hand edits, just never `current-state.md`).
2. Wherever a skill previously "updated `current-state.md` and committed it", that step is deleted. The queue change is already captured by the ticket-scoped commit (from `move.ts`, `setup-ticket.ts`, `fail-ticket.ts`, `reset-failures.ts`, or a `commit-state.ts` of the ticket directory). No separate narrative commit is made.
3. Wherever a skill previously surfaced "needs your action" items (blocks, broken main, environmental/setup failures, awaiting-review, session-interrupt, systemic-failure halt) into the top `⚠ Needs your action` section of `current-state.md`, it instead surfaces them **directly in chat** in its run report. `/pb:status` reconstructs the same picture from the live queues on demand.

### B. Templates
4. Delete the file `templates/state/current-state.md`.
5. Edit `templates/index.md`: remove the bullet (line ~22) `- [state/current-state.md](state/current-state.md): empty starting state.`
6. Edit `templates/state/CLAUDE.md`: in the opening paragraph, drop "and the `current-state.md` snapshot" so it reads that the state repo holds the ticket queues (`tickets/`) only.
7. Edit `templates/state/tickets/CLAUDE.md`: in the rule about moving tickets only via `move.ts`, remove the parenthetical "(e.g. updating `current-state.md`)" so it just says the move keeps the queues consistent.

### C. Skills — remove the maintenance steps (`.claude/commands/pb/`)
For each skill below, delete the numbered step(s) and any example-output line that update or commit `current-state.md`, renumber the remaining steps, and reword surrounding prose so the skill still reads cleanly.

8. `add.md`: delete step 4 (update + commit `current-state.md`). The new-ticket commit of the ticket directory itself remains.
9. `promote.md`: delete step 5 and the `current-state.md updated.` example-output line.
10. `unblock.md`: delete step 4 (remove entry from needs-action section + commit). The re-admission is already recorded by the move/reset-failures commit. Remove the `current-state.md updated…` example line. The skill should still print a one-line chat confirmation of what was re-admitted.
11. `rank.md`: delete step 5 (`Update current-state.md if it mentions ordering…`).
12. `reset.md`: in step 3, drop the `current-state.md` update; keep the substantive instruction that requeued tickets are back in `todo/` and nothing is in flight as a chat report. Remove the `current-state.md updated…` example line. Preserve the intent of "clear the systemic-failure note once addressed" by rewording it as a chat acknowledgement (there is no longer a persisted note to clear).
13. `docs.md`: delete step 4 (update + commit `current-state.md` when tickets were queued). The queued tickets are already committed as ticket directories.
14. `plan/break.md`: delete step 8 (update + commit `current-state.md`).
15. `todo/break.md`: delete step 10 (update + commit `current-state.md`).
16. `debug.md`:
    - In the ticket-creation step (line ~26), remove the "Then update `current-state.md` … and commit it" sentence; keep the `commit-state.ts "add <id>" tickets/todo/<id>` commit of the ticket directory.
    - In the escalation rule (line ~43), change "Surface it via `current-state.md`" to "Surface it in chat".

### D. Skills — `pb:review` (`.claude/commands/pb/review.md`)
17. In the Block action (line ~141): remove the trailing instruction "**Keep the ticket in `current-state.md`** but reword its entry to show it is blocked". The `blocked/` queue is the record.
18. In the Backlog action (line ~142): remove the equivalent "**Keep the ticket in `current-state.md`** …" instruction.
19. In the Abort action (line ~143): remove "**remove the ticket entirely from `current-state.md`** (see below)"; the `aborted/` directory is already its only record.
20. Delete the consolidated "Then update `current-state.md` to reflect the move …" paragraph (line ~147) in its entirety, including its `commit-state.ts "<summary>" current-state.md` command. Each action already moves the ticket via `move.ts` (ticket-scoped commit) and appends any History note before the move.
21. In the worked example (lines ~191, ~198, ~206): remove the `current-state.md updated.` / `Removed from current-state.md.` / `current-state.md entry reworded…` lines, replacing them where needed with the queue outcome only (e.g. "Moved → merge-queue/.").

### E. Skills — `pb:next` (`.claude/commands/pb/next.md`)
This is the heaviest user. Rework so the parent reports needs-action in chat and never maintains a file.
22. Line ~24: delete the paragraph beginning "**`state/current-state.md` is the parent agent's responsibility alone.**". Replace it with a shorter rule that captures the still-true part: a sub-agent's only state writes are to its own ticket (its `evidence/` and a History note in `detail.md` **before** moving its directory via `move.ts`/`fail-ticket.ts`/`reset-failures.ts`, whose ticket-scoped commit captures them); the parent never maintains any shared state file.
23. Lines ~31–32: delete the "Keep `current-state.md` entries to one or two plain lines" bullet. Keep the "**Always write ticket IDs in full**" rule but reword it to apply to the chat run report only (drop "and `current-state.md`").
24. Line ~45 (setup failure): change "Surface it in the top `⚠ Needs your action` section of `current-state.md` with the error message(s) and the evidence path" to "Surface it in chat in the run report with the error message(s) and the evidence path". Keep the move-straight-to-`blocked/` behaviour unchanged.
25. Line ~49 (tell the developer): change to surface every block, environmental failure, and broken-main situation **in chat in the run report**, naming the ticket and the one-line reason. Drop the `⚠ Needs your action` / "leads the file" wording; mention `/pb:status` regenerates the picture from the queues.
26. Line ~51 (broken main): change "surface it in the top `⚠ Needs your action` section of `current-state.md`" to "surface it in chat in the run report".
27. Line ~58 (session interrupt): delete the "add a one-line `Run interrupted (session limit); resume with pb:next` note to the top of `current-state.md` and commit it" instruction. Keep "the queues are the durable record" and have the parent state in chat that the run was interrupted and to resume with `pb:next`.
28. Line ~105 (merge-train broken main): change "record the broken main, surface it in `current-state.md`" to "record the broken main, surface it in chat".
29. Line ~123 (agent-review sub-agent): the sentence already says the sub-agent does not write `current-state.md` and the parent reflects the outcome; change "(that would race with the other sub-agents); the parent reflects the outcome there after the turn (step 3)" to remove the file reference, so it reads that the sub-agent's only writes are to its own ticket and the parent reports the outcome in chat after the turn.
30. Step "Record state" (line ~143): delete this entire step. Its forward-progress bookkeeping is no longer needed; replace it with a "Report" step that prints the run report in chat (tickets that moved or were created this turn, any Fix ticket spawned, any abort/handback), with the same content the file used to hold but transient and chat-only. Remove the `commit-state.ts "<turn summary>" current-state.md` command. Renumber the surrounding steps.
31. Line ~163 (example): change "current-state.md updated by the parent, loop continued" to "the parent reported it and the loop continued".

### F. Skills — `pb:status` and `pb:board`
32. `status.md`:
    - Frontmatter `description` (line ~3): replace "Reads current-state.md and inspects every ticket queue" with "Inspects every ticket queue" and drop "current state" from the keyword list if it implies the file (keep the general "status/where things stand" keywords).
    - Step 1 (line ~20): change "Read `state/current-state.md` and inspect each queue in `state/tickets/`" to "Inspect each queue in `state/tickets/`". `pb:status` becomes a pure live-queue reader that builds its summary (including the needs-your-action items) directly from the queues.
33. `board.md`:
    - Line ~8: reword the contrast with `pb:status`: drop "reads `state/current-state.md`, writes a narrative summary" and describe `pb:status` as "summarises the live queues and recommends a next skill".
    - Line ~24: remove "or read `state/current-state.md`" from the "do not" list (keep "do not summarise / recommend / flag what needs the developer: that is `pb:status`").

### G. Skills — `pb:bootstrap`
34. `bootstrap/new.md`:
    - `description` (line ~3): remove "and populates current-state.md with empty queues".
    - Step 3 (line ~32): remove "current-state.md," from the list of things copied from `templates/state/`.
    - Delete step 5 (line ~37, "Populate `state/current-state.md` … commit it"). Renumber following steps.
    - Remove the `state/current-state.md initialised: all queues empty.` example-output line (line ~49).
35. `bootstrap/existing.md`:
    - `description` (line ~3): remove "and populates current-state.md".
    - Step 3 (line ~32): remove "current-state.md," from the copied-files list.
    - Step 5 (line ~41): the test-suite paragraph currently says to "note the failure in `state/current-state.md`"; change to "note the failure in chat and queue it as a high-priority blocking ticket" (the ticket is the durable record).
    - Delete step 7 (line ~43, "Populate `state/current-state.md` to reflect where things stand"). Renumber.
    - Remove the `state/current-state.md: rate-limiter noted as in flight…` example-output line (line ~58); replace with the queue outcome (bootstrap tickets queued).

### H. Skills — `pb:help`
36. `help.md`:
    - Line ~21: change "a **state repo** (the queues and `state/current-state.md`)" to "a **state repo** (the ticket queues)".
    - Line ~27: change "Check `state/current-state.md`, run a skill, repeat" to "Run `/pb:status` (or `/pb:board`) to see where things stand, run a skill, repeat".

### I. Core docs
37. `docs/process.md`: this is the canonical process description; update every `current-state.md` mention (lines ~51, 63, 72, 73, 74, 109, 116, 126, 135, 152, 205):
    - State-repo description (51): drop "and `current-state.md`"; the state repo holds the queues.
    - Aborted-ticket paragraph (63): remove "it is **removed from `current-state.md`** entirely (the `aborted/` directory is its only record)"; keep "the `aborted/` directory is its only record".
    - Move rule (72): remove "and the agent updates `current-state.md`".
    - Delete the whole `current-state.md` bullet at line ~73 (the derived-summary description). Optionally replace with one sentence: the queues are the source of truth and `/pb:status` summarises them live on demand.
    - Audit-log paragraph (74): remove the "(a `current-state.md` update, …)" example so it cites only "a newly created ticket" as the hand-edit case for `commit-state.ts`.
    - Surface-it / setup-failure / systemic-failure / session-interrupt paragraphs (109, 116, 126, 135): change every "top `⚠ Needs your action` section of `current-state.md`" / "note to the top of `current-state.md`" to "surface in chat" (and for systemic failure, "the queues are the record; `pb:status` shows the in-flight state").
    - Rhythm line (152): change "check `current-state.md`, run a skill, repeat" to "run `/pb:status`, run a skill, repeat".
    - Agent-review paragraph (205): remove "It never writes `current-state.md`; the parent reflects the outcome there after the turn" and replace with the sub-agent writing only its own ticket state and the parent reporting the outcome in chat.
38. `index.md` (line ~39): delete the `current-state.md: scannable snapshot…` bullet.
39. `README.md` (line ~96): in the state-repo bullet, remove "and `state/current-state.md`, tracking what is in flight" so it reads that the state repo tracks the ticket queues.
40. `glossary.md`:
    - State-repo entry (line ~7): drop "and `state/current-state.md`".
    - Delete the whole `**`current-state.md`**` glossary entry (line ~13).
41. `CLAUDE.md` (repo root):
    - Line ~31: in the state-repo bullet, remove "and `state/current-state.md`".
    - Line ~39: in the `pb:status` guidance, remove "read `state/current-state.md`," so it reads "summarise what is in flight and blocked, and recommend the next skill".
42. `handbook.md` (human-only reference, 15 mentions): rewrite the passages that describe `current-state.md` as the developer's at-a-glance view. The developer now sees state by running `/pb:status` or `/pb:board`, which read the live queues. Update each of: the autonomous-run paragraph (~31), the bootstrap-leaves-you-with paragraph (~81), the "check where things stand" step (~96), the "source of truth / keep it open in editor" paragraph (~108, recast so the queues are the source of truth and `/pb:status` is the view), and the "developer is told through `current-state.md`" paragraph (~172, recast as told in chat / via `/pb:status`). Sweep the remaining mentions in the same pass so none remain.
43. `scripts/CLAUDE.md` (line ~20): in the `commit-state.ts` description, change the example "(a `current-state.md` update, a newly created ticket)" to "(e.g. a newly created ticket)".

### J. Scripts — comment-only edits (no behaviour change)
`commit-state.ts` and the move/fail/reset scripts keep working unchanged; only comments that name `current-state.md` as an example are reworded.
44. `scripts/move.ts` (comment ~line 7): reword the comment so it no longer says the agent updates `current-state.md`; state that the script moves the directory only and the queue is the record.
45. `scripts/commit-state.ts` (comment ~line 10): change the example "(a current-state.md update, a newly created ticket)" to "(e.g. a newly created ticket)".
46. `scripts/lib/commit-state.ts` (comment ~line 8): change "the affected ticket's directory (or current-state.md)" to "the affected ticket's directory".

### K. Live state file (this project's own state repo)
47. Delete the live `state/current-state.md` (≈166 KB) from the `playbook-karse` state repo and commit the deletion in the state repo with `commit-state.ts` (e.g. `(cd state && git rm current-state.md && bun ../scripts/commit-state.ts "remove current-state.md")`, or a plain `git rm` + commit if `commit-state.ts` rejects a pure deletion). This is the developer's project state, so confirm before deleting. `state/.gitignore` needs no change (it only ignores `.pb-review-snapshot.json`).

### L. Start a decisions log (`docs/decisions.md`)
The developer wants an ongoing record of process decisions, so that removals like this one are explained in one durable place rather than only in a plan that later moves to `done/`. This is the inverse of the transient `current-state.md`: it records *why the process is the way it is*, not *what is in flight*.
48. Create a new file `docs/decisions.md` with:
    - A short header explaining the file's purpose: a chronological log of decisions about the Playbook process (what changed, why), newest first. Each entry has a date, a one-line title, and a short "what / why" body. It is not a queue or a status file and never tracks in-flight work.
    - The first entry, dated `2026-06-25`, titled "Removed `current-state.md`", recording both halves the developer asked for:
      - **What the file did:** `current-state.md` was a per-project, human-readable summary that sat on top of the ticket queues at `state/current-state.md`. It had a top `⚠ Needs your action` section (blocks, broken main, environmental/setup failures, awaiting-review, run-halt and session-interrupt notes) and a `Progress` section (in-flight and recently completed tickets). It was a *derived* view: the queues were always the source of truth, and the parent agent maintained the file by hand on every queue change, committing it via `commit-state.ts`.
      - **Why it was removed:** the developer did not use it; the AI did not need it (the queues are the source of truth and `/pb:status` regenerates the same view live); maintaining it added a read/edit/commit to nearly every skill on every queue change, slowing the agent; and its single-committer rule (a shared-file write would race parallel sub-agents) blocked multiple AIs from using one state repo at once. Its only non-derived content (the systemic-failure-halt and session-interrupt banners) is now surfaced transiently in chat; the queues remain the durable record.
49. Add a `docs/decisions.md` bullet to `index.md` (in the same edit as the step 38 change to that file, so `index.md` is written once) describing it as the log of process decisions and their rationale, so the file is discoverable from the orientation index.

## Unit Tests
No script logic changes, so no new unit tests are required. The existing Jest suites in `scripts/` and `scripts/lib/` (including `commit-state.test.ts`, `move.test.ts`, `fail-ticket.test.ts`, `reset-failures.test.ts`, `setup-ticket.test.ts`, `next-tickets.test.ts`) must continue to pass unchanged. Confirm none of them reference `current-state.md` (a pre-change grep returns no matches) so the comment edits cannot break them.

## Smoke Tests
- Existing script smoke tests in `scripts/smoke-*.sh` (notably `smoke-commit-state.sh`, `smoke-move.sh`, `smoke-fail-ticket.sh`, `smoke-reset-failures.sh`, `smoke-setup-ticket.sh`) must still pass; none reference `current-state.md`.
- Add a repository guard check (a short shell snippet, runnable ad hoc or saved as `scripts/smoke-no-current-state.sh`) that greps the whole repo for `current-state` excluding `docs/plans/done/`, `node_modules/`, `.git/`, the `project/` subtree, and this plan file, and exits non-zero if any match is found. This is the authoritative "it is fully removed" check.

## Verify
The AI agent runs all of these after implementation and reports results:
1. `templates/state/current-state.md` no longer exists (`test ! -e templates/state/current-state.md`).
2. Repo-wide grep finds no remaining references outside immutable history:
   `grep -rn "current-state" . --include="*.md" --include="*.ts" --include="*.js" --include="*.sh" | grep -v "docs/plans/done/" | grep -v "/node_modules/" | grep -v "^./project/"` returns nothing (and the live `state/current-state.md` is gone). The only acceptable remaining matches are inside `docs/plans/done/` (immutable history) and this plan file itself.
3. Run the full unit suite from `scripts/` (the project's `bun`/Jest test command) and confirm all tests pass.
4. Run the script smoke tests in `scripts/smoke-*.sh` and confirm they pass.
5. Run the new no-`current-state` guard check (Smoke Tests) and confirm it exits 0.
6. Read `docs/process.md`, `glossary.md`, `index.md`, `README.md`, and each edited skill end-to-end to confirm step numbering is consistent and no sentence dangles referring to a removed step or file.
7. Confirm `docs/decisions.md` exists, opens with the purpose header, and contains the dated "Removed `current-state.md`" entry recording both what the file did and why it was removed; confirm `index.md` links to it.

## Notes
- **Scope boundary:** `docs/plans/done/` plans and everything under `project/` (including `project/worktrees/`) are out of scope and must not be edited. The two done plans that mention `current-state.md` are historical records.
- **`commit-state.ts` stays.** Removing `current-state.md` does not remove the script; it is still the mechanism for committing newly created tickets and other hand edits in the state repo. Only its doc comments change.
- **What replaces the file:** nothing persistent. The ticket queues are already the source of truth; `/pb:status` (live-queue summary + next-skill recommendation) and `/pb:board` (bare listing) regenerate the view on demand, and `/pb:next` reports needs-action items in its chat run report.
- **Accepted trade-off (open question for the developer):** two pieces of information were previously persisted only in `current-state.md` and will now be transient (chat-only): the `Run halted: systemic failure` note when `pb:next` aborts a run, and the `Run interrupted (session limit)` note. After removal, the durable record of these is the queue state (affected tickets return to `todo/`) plus whatever the agent said in chat; there is no across-session persisted banner. The developer has accepted this; if a persisted record is later wanted, it should be a small dedicated artifact, not a revived `current-state.md`.
- **Parallelism payoff:** the single-committer rule for `current-state.md` in `pb:next` was the main shared-mutable-state obstacle to running multiple agents against one state repo. Removing the file removes that rule; remaining cross-agent safety relies only on ticket-scoped, lock-safe commits, which are already per-ticket.
