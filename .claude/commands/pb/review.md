---
name: pb:review
description: "Invoke when there are tickets in human-review/ waiting for the developer to approve, reject, skip, or abort. Walks the developer through each ticket (diff, captured evidence, tests, UI/CLI, docs), transcribes their notes to the right place, and moves the ticket to merge-queue/ on approval, back to todo/ on rejection, to aborted/ on abort, or leaves it in human-review/ when skipped. Keywords: review, human review, approve, reject, abort, kill, abandon, drop, come back later, skip, walk me through, sign off, check the work, review queue, code review, accept changes."
---

# pb:review

Walk the developer through the `human-review/` queue. This is the human approval gate: the one point in the loop where a person decides.

The developer drives this with a **review loop**: you show a numbered list of the reviewable tickets and ask which one to review, they select one, you walk them through it and resolve it, then you return to the same numbered list and question. Repeat until no reviewable tickets remain or the developer stops.

Walking through a ticket is itself a loop, the **inspect loop**: you print a numbered menu of ways to examine the work and the developer picks them in any order until they resolve the ticket. So the review loop (select a ticket) contains the inspect loop (examine that ticket).

## The review snapshot

The whole review loop runs off one **review snapshot**: a temporary, git-ignored JSON snapshot of `human-review/` (`state/.pb-review-snapshot.json`), written by `start-review.ts`. It is the **source of truth** for the loop, not the live `human-review/` directory:

- It fixes the rows, their **order**, and their **numbers** for the session.
- Each row carries a precomputed **card**: the ticket's title, changed-files summary, latest evidence pass, test results, screenshot paths, and a **tailored inspect menu**. So you render both menus from JSON without re-reading `detail.md` and walking `evidence/` every turn.
- A resolved ticket stays in the snapshot (checked, with its outcome) **even after it leaves the queue**, so the checklist never loses a row or renumbers.
- Every write stamps `updatedAt`. When the review snapshot is read back older than the staleness threshold it is **rebuilt automatically** from the live queue (you will see a "stale … rebuilt" notice on stderr). A fresh `start-review.ts` always starts every box unchecked.

You never hand-edit the review snapshot: `start-review.ts` creates it and `format-ticket-selection.ts --snapshot … --mark` updates it.

## Output style

Follow the project's [output format](../../../docs/output-format.md) and [ticket selection menu](../../../docs/ticket-selection.md) (load once per session if not already in context). Mode: **`pick-one-loop`** with checklist variant. Specific to review:

- A review step is two things: *what to look at* (a path, command, or `file:line`) and *what to check*. Nothing else.
- Lead each bullet with the action: **Open `<path>`**, **Run `<command>`**, **Look at `<file>:<line>`**.
- A ticket summary is at most 3 bullets: what changed, the evidence (test result + screenshot paths), the diff (files touched). Build it from the card; do not retell the History.

## Responses

The developer drives with these commands. Each has a single-letter (or short) alias and a full-word form; both are accepted.

| Command | Aliases | When | Does |
|---|---|---|---|
| Select | `<number>`, `<ticket name>` | At the ticket list | Selects the ticket to review (e.g. `1`, or `search-3`). |
| Inspect | `<number>` | At the inspect menu | Runs that menu option (show screenshots, run by hand, start it for you, run the tests, read/show the docs, view/show the diff). You either show the developer how, or perform it (describing what you will do first), then reprint the menu. |
| Approve | `a`, `approve` | In a ticket | Approves the ticket; moves it to `merge-queue/`. |
| Reject | `r`, `reject` | In a ticket | Rejects with notes (a note is required); moves it back to `todo/`. |
| Skip | `s`, `skip` | In a ticket | Leaves it in `human-review/` for later; no note needed. |
| Abort | `ab`, `abort` | In a ticket | Kills the ticket; moves it to `aborted/` (optional reason). |
| Stop | `q`, `quit`, `stop` | At the ticket list | Ends the review loop. |

A **ticket command** (`a`/`r`/`s`/`ab`) **exits the inspect loop for the current ticket** at any point (the developer does not have to try every menu option first) and returns to the numbered ticket list. See [Resolve](#3-resolve).

Anything else the developer types at the inspect menu is treated as a **note** (transcribe it, see below) or a question (answer it); then reprint the menu and wait. Never run an option or resolve a ticket on your own: present the menu, then wait for the developer's pick.

## Steps

### 1. Start the session, list as a checklist, and ask

On the **first** time through, start the session:

`(cd state && bun ../scripts/start-review.ts)`

This snapshots `human-review/` into the review snapshot, precomputes each ticket's card, and prints the snapshot path (first line, `snapshot: <path>`) followed by the initial checklist. Keep the path; you pass it back on every reprint. If it prints `No tickets in Human review.`, say so and stop.

Reprint the checklist at any later point with:

`(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review --snapshot <path> --prompt 'Which ticket do you want to review? (number, ticket ID, or stop)')`

The script prints the checklist in **snapshot order** with **fixed numbers** (never reordered when items are checked off). See [docs/ticket-selection.md](../../../docs/ticket-selection.md) for the layout. If it emits a "stale … rebuilt" notice on stderr, the snapshot was too old and was rebuilt from the live queue; just carry on with the reprinted list.

Wait for the developer to reply with a number, a ticket name, or `q`/`quit`/`stop`.

Selection rules:
- An **unchecked** ticket: walk through it (Step 2).
- A **skipped** ticket (checked, still in `human-review/`): the developer may reselect it to look again or resolve it now.
- An **approved/rejected/aborted** ticket (checked, gone from `human-review/`): tell the developer it is already resolved and reprint the checklist; do not reopen it.

The deep read stays delayed: the card gives you the summary and the inspect menu. Only open `detail.md` (full History, Issues, acceptance criteria) and the `evidence/` tree for a ticket when the developer drills into something the card does not carry, and only for the selected ticket, never all up front.

End the review loop when the developer stops (`q`/`quit`/`stop`), or when **every box is checked**. When all boxes are checked, say so plainly (e.g. "All tickets processed this pass; skipped ones remain in human-review for next time") so the developer knows the pass is exhausted.

### 2. Walk through the chosen ticket

When the developer selects a ticket (by number or name), walk them through that **one** ticket. Do not move on until it is resolved (approved, rejected, skipped, or aborted).

For the chosen ticket:

1. **Summarise from the card.** Read the selected ticket's card in the review snapshot and give a short, simple summary (≤3 bullets) of the work and the evidence: what changed (the card's changed-files), the test results, and the screenshot paths. The card's `latestImplementation`/`latestReview` name the current evidence pass; earlier passes show prior rejected rounds. Only open `detail.md`/`evidence/` when the developer asks for something the card does not cover (the full History/Issues, a specific transcript).

2. **Run the inspect loop.** Print the card's **tailored inspect menu** (its `inspect` array, already filtered to this ticket and in canonical order) and let the developer pick options **in any order, one at a time**. Do not dump everything at once: run the picked option, then reprint the menu and wait. The full menu, before tailoring, is:

   ```
   1. Show the screenshots
   2. Run it by hand (I show you how)
   3. Start it for you (I launch the app, you explore it)
   4. Run the automated tests
   5. Show the doc changes (I show you the diff)
   6. Read the docs yourself (I point you to them)
   7. Show the code diff (I show you the diff)
   8. View the code diff yourself (I show you how)
   ```

   The card has already dropped options that cannot apply (no screenshots → no option 1; no doc changes → no options 5/6; no runnable code → no options 2/3) and numbered the rest. Print it as given. When there are screenshots, suggest starting with them.

   For each pick you either **show the developer how** to do it themselves, or **do it for them**. When you do it for them, **first print a one-line description of what you are about to do, then do it.** After the option finishes, reprint the menu and wait. The options:

   **Showing means pasting into your reply (mandatory, applies to every "show" pick and to any ad-hoc "show me ..." the developer types).** When the task is to *show* content — a file, a diff, a doc, command output — the content must appear **in the body of your reply as a fenced code block** (images rendered inline). Running `git show`/`git diff`/`cat`/`Read`/a test command does **not** count as showing it: command output and terminal scrollback are not your message and the developer may never see them. If you ran a command to fetch the content, copy the relevant content into your reply. For brand-new files, paste the file content itself, not a `+`-prefixed diff with repeated commit headers. Lead with the content; keep any summary short and **after** it, never instead of it. If the developer says they did not see what they asked for, assume it went to command output and re-send it inline.

   1. **Show the screenshots.** Use the card's screenshot paths. State each screenshot's **full file path on disk** (e.g. `state/tickets/human-review/<id>/evidence/implementation-N/screenshots/<name>.png`), then **open them for the developer** in their image viewer (`xdg-open <path>` on Linux, `open <path>` on macOS), one command per screenshot, and also render each inline. List every path. Showing the paths is mandatory, not optional. **Every affected view must be captured, each in both light and dark mode.** If any affected view is missing, or is in only one mode (or has no screenshot), flag that coverage gap to the developer as a defect, since agent-review should have required a both-mode screenshot of every affected view.
   2. **Run it by hand.** Work out which part of the app this ticket changed (from its card's changed-files and `detail.md`), then give the developer everything they need to run and explore it themselves. Pull the exact commands from the **testing manual** (`project/docs/testing-manual/`); do not invent them. Cover all six, in order:
      1. **Point to the testing manual.** Name the file and section in `project/docs/testing-manual/` that covers running the app and testing this feature.
      2. **Setup commands.** The exact command(s) from the manual to set up (e.g. load database fixtures, start test clusters).
      3. **Start command(s).** The exact command(s) from the manual to start the app.
      4. **What to look for.** Exactly what in the app relates to the feature added or changed, and what they should see.
      5. **Tear down the app.** How to stop the app.
      6. **Tear down the setup.** How to remove the setup from step 2 (e.g. drop fixtures, delete test clusters).
   3. **Start it for you.** Run the setup and start commands from the testing manual (option 2) to launch the app for the developer, then tell them what to look at in the app for this change (which view, what they should see). **Do not drive or navigate the app yourself** (no clicking, typing, or routing): just start it and hand it over. The developer explores it and closes it themselves when they are ready.
   4. **Run the automated tests.** Say which tests you will run (the card's Test Plan / test results name which apply), then run them fresh in the foreground (unit, smoke, and/or e2e, picking the levels that match what changed) and show the output.
   5. **Show the doc changes.** Run the diff of the docs this ticket touched (the card's `docsChanged` names them; use its `commit`), then **paste the diff content inline into your reply as a fenced ```diff block**, naming the files changed. Do not merely run `git`/the diff command and rely on terminal scrollback: the developer must see the actual diff in your message without asking again. For a large diff, show every changed file but you may elide unchanged context; never elide changed lines.
   6. **Read the docs yourself.** Do not show the diff: tell the developer which doc files and sections this ticket touched (the card's `docsChanged`, under `project/docs/`) and how to read them, so they open and read the docs themselves.
   7. **Show the code diff.** Run the diff for the ticket's commit (the card's `commit`), then **paste the diff content inline into your reply as a fenced ```diff block**, naming the files changed. Do not merely run `git show`/`git diff` and rely on terminal scrollback: the developer must see the actual diff in your message without asking again. For a large diff, show every changed file but you may elide unchanged context; never elide changed lines.
   8. **View the code diff yourself.** Do not show the diff: give the developer the exact command(s) to find and view it themselves (e.g. `git -C project show <commit>` from the card), naming the files changed so they know what to look at.

   The developer leaves the inspect loop by resolving the ticket (`a`/`r`/`s`/`ab`), which takes you to [Resolve](#3-resolve).

3. As they inspect, capture any **notes**. Notes can target whatever the developer is thinking about, not just the current ticket. Transcribe each note to the right place (confirming when it is not obvious):
   - the current ticket's Notes section (or its History on rejection),
   - the current feature's Notes, behaviour, acceptance criteria, or open questions in `detail.md`,
   - other features (edits to their specs, or new tickets in `todo/` to cover the change),
   - docs (testing manual, user guide, how-it-works),
   - the roadmap (`project/docs/roadmap.md`) for forward-looking ideas.

### 3. Resolve

Then the developer approves, rejects, skips, or aborts. **Rejection requires a note.** Write the outcome into the ticket's `detail.md` (rejection and abort notes go to its History section), then move the directory with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`):
- **Approve:** to `merge-queue/`.
- **Reject with notes:** back to `todo/`, notes appended to History. **Record every issue the developer raises as a new unticked checkbox in the ticket's `## Issues` section** (create the section if absent), in addition to the History note, so `pb:next`'s implement agent must fix each one and tick it, and its review agent fails the ticket until every box is genuinely resolved. A human rejection is not a failure, it is their explicit decision to rework the ticket: run `bun ../scripts/reset-failures.ts <id>` (from `state/`) to clear its `**Failures:**` count to 0, then move it to `todo/`. It rejoins the loop with a clean slate and `pb:next` re-implements it with your notes. A person decides each round, so there is no cap.
- **Skip:** leave it in `human-review/` to return to later. No move, no note required. Return to the list; the skipped ticket stays and reappears there.
- **Abort:** to `aborted/`. The developer is killing the ticket: the work is abandoned and will not be done. A reason note is **optional**; if they give one, append it to the ticket's History section as the abort reason before the move. Then move the directory to `aborted/`, which sets the ticket's state to aborted (the queue it sits in is its status). Unlike a rejection, an aborted ticket does not rejoin the loop and its `**Failures:**` count is left untouched; `pb:next` never touches `aborted/`. Then **remove the ticket entirely from `current-state.md`** (see below): an aborted ticket is not tracked in the narrative, the `aborted/` directory is its only record.

The `move.ts` (approve/skip-then-later/abort) and `reset-failures.ts` + `move.ts` (reject) calls above commit their own state change automatically, ticket-scoped, so the History note and `## Issues` edits you wrote into the ticket's `detail.md` before the move ride in that commit. For any **follow-up ticket** you queued in `todo/` from the notes, commit it separately: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`).

Then update `current-state.md` to reflect the move (and any follow-up tickets queued from the notes above): add, amend, or remove only the entries these changes affect (an aborted ticket is removed outright), leaving the rest of its existing content intact. Only ever write entries that reflect a queue change to this project's tickets; never use `current-state.md` to track anything outside the queues (playbook edits, other repos, reminders) — surface those in chat or their own commit. Commit that edit as its own commit: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).

Whatever the outcome, **check the ticket off in the review snapshot** and record its outcome by marking it (this updates the snapshot and reprints the checklist):

`(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review --snapshot <path> --mark <id> --outcome <approved|rejected|skipped|aborted> --prompt 'Which ticket do you want to review? (number, ticket ID, or stop)')`

All four outcomes check the box: resolving it or deferring it both count as processed. The marked row stays visible with its outcome for the rest of the session, even once the ticket has left `human-review/`.

Once the ticket is marked, **return to the review loop**: the `--mark` call already reprinted the checklist (every processed ticket shown checked with its outcome, the rest unchecked); ask "Which ticket do you want to review?" again. A skipped ticket stays in `human-review/` and remains selectable; an approved, rejected, or aborted ticket has left the queue and cannot be reopened. Keep looping until the developer stops or every box is checked.

## Example

See the `pick-one-loop` checklist example in [docs/ticket-selection.md](../../../docs/ticket-selection.md). After the developer selects a ticket, the inspect loop and resolution proceed as below:

```
Developer: 1

search-3 — debounced search input
- Changed: src/search/input.tsx (+44 -3)
- Evidence (review-1/): unit 12 passed, smoke exit 0

How do you want to inspect it?
1. Show the screenshots
2. Run it by hand (I show you how)
3. Start it for you (I launch the app, you explore it)
4. Run the automated tests
5. Show the doc changes (I show you the diff)
6. Read the docs yourself (I point you to them)
7. Show the code diff (I show you the diff)
8. View the code diff yourself (I show you how)
(Suggest starting with 1.)

Developer: 1
- state/tickets/human-review/search-3/evidence/review-1/screenshots/results.png (rendered below).
- Check: results list updates after typing stops. Both light + dark mode present.
[menu]

Developer: 4
- I'll run the unit + smoke tests for search-3 in the foreground.
- unit 12 passed, smoke exit 0. [output shown]
[menu]

Developer: placeholder should say "Search docs".
- Note -> search/detail.md behaviour; follow-up todo/search-6 (placeholder copy).
- Approve search-3 -> merge-queue/. current-state.md updated.
- Mark: format-ticket-selection.ts --snapshot <path> --mark search-3 --outcome approved (reprints the checklist).

Developer: search-5

search-5 — fuzzy matching
Developer: ab — not shipping it.
- Abort reason -> search-5 History. Moved -> aborted/. Removed from current-state.md.
- Mark: --mark search-5 --outcome aborted (reprints the checklist).

Developer: s

search-4 — result ranking
Developer: s — come back to it later.
- Skipped. Left in human-review. Mark: --mark search-4 --outcome skipped (reprints the checklist).

All tickets processed this pass; search-4 (skipped) remains in human-review for next time.
```
