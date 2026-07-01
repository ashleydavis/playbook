---
name: pb:review
description: "Invoke when there are tickets in human-review/ waiting for the developer to approve, reject, skip, abort, or defer. Walks the developer through each ticket (diff, captured evidence, tests, UI/CLI, docs), transcribes their notes to the right place, and moves the ticket to merge-queue/ on approval, back to todo/ on rejection, to aborted/ on abort, to blocked/ or backlog/ when deferred, or leaves it in human-review/ when skipped. Keywords: review, human review, approve, reject, abort, kill, abandon, drop, come back later, skip, block, blocked, backlog, defer, park, not ready, depends on, wait for, walk me through, sign off, check the work, review queue, code review, accept changes."
---

# pb:review

Walk the developer through the `human-review/` queue. This is the human approval gate: the one point in the loop where a person decides.

The developer drives this with a **review loop**: you show a numbered list of the reviewable tickets and ask which one to review, they select one, you walk them through it and resolve it, then you return to the same numbered list and question. Repeat until no reviewable tickets remain or the developer stops.

Walking through a ticket is itself a loop, the **inspect loop**: you print a numbered menu of ways to examine the work and the developer picks them in any order until they resolve the ticket. So the review loop (select a ticket) contains the inspect loop (examine that ticket).

You drive the whole thing with three scripts, and never anything else:

- `start-review.ts` once, to start the session.
- `format-ticket-selection.ts --mode pick-one-loop --queue human-review …` to render (and reprint) the numbered list, and the same script with `--mark <id> --outcome <x>` to record a ticket's outcome and reprint.
- `format-ticket-selection.ts --card <id>` to get the selected ticket's summary and inspect menu.

The numbered list persists for the session: once started, its rows, their order, and their numbers are fixed and never renumber, and a resolved ticket stays on the list (checked, with its outcome) even after it leaves `human-review/`. The scripts handle all of that; you just run them and paste what they print.

## Output style

Follow the project's [output format](../../../docs/output-format.md) and [ticket selection menu](../../../docs/ticket-selection.md) (load once per session if not already in context). Mode: **`pick-one-loop`** with checklist variant. Specific to review:

- A review step is two things: *what to look at* (a path, command, or `file:line`) and *what to check*. Nothing else.
- **Show only, nothing trailing.** When the developer picks an inspect option (screenshots, diff, docs, tests) or asks to be shown anything, output the artifact and then go straight to the inspect menu. Add nothing in between or after: no description of what it contains, no recap, no analysis, no verdict ("All correct", "Looks good", "Passes"). The developer asked to see it, not to be told about it, and the extra prose is also what makes them wait while you compose it. The verdict is theirs alone at this gate.
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
| Block | `bl`, `block` | In a ticket | Defers a sound ticket that cannot proceed yet because it depends on other work that has not landed; moves it to `blocked/` (optional reason). Re-admitted by `pb:unblock`. |
| Backlog | `bk`, `backlog` | In a ticket | Defers a sound ticket that is wanted but deprioritized for later; moves it to `backlog/` (optional reason). Re-admitted by `pb:promote`. |
| Abort | `ab`, `abort` | In a ticket | Kills the ticket; moves it to `aborted/` (optional reason). |
| Stop | `q`, `quit`, `stop` | At the ticket list | Ends the review loop. |

A **ticket command** (`a`/`r`/`s`/`bl`/`bk`/`ab`) **exits the inspect loop for the current ticket** at any point (the developer does not have to try every menu option first) and returns to the numbered ticket list. See [Resolve](#3-resolve).

Anything else the developer types at the inspect menu is treated as a **note** (transcribe it, see below) or a question (answer it); then reprint the menu and wait. Never run an option or resolve a ticket on your own: present the menu, then wait for the developer's pick.

## Steps

### 1. Start the session, list as a checklist, and ask

On the **first** time through, start the review session:

`(cd state && bun ../scripts/start-review.ts)`

This prepares the review and precomputes each ticket's card. It confirms the session is ready; it does **not** print the checklist. If it prints `No tickets in Human review.`, say so and stop.

Render the checklist with `format-ticket-selection.ts`. This is the **single render path** for the menu: you call it the same way for the first display and for every later reprint.

`(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review --prompt 'Which ticket do you want to review? (number, ticket ID, or stop)')`

The script prints the checklist in a fixed order with fixed numbers (never reordered when items are checked off). See [docs/ticket-selection.md](../../../docs/ticket-selection.md) for the layout. If it prints a notice on stderr, ignore it and carry on with the reprinted list.

**Run `format-ticket-selection.ts` fresh and paste its exact output into your reply every single time you show the list, the first display and every reprint alike. The script does not show the checklist to the developer; you do.** Its output goes to the tool result (command output / terminal scrollback), which is not your message and the developer may never see it. To "show the list" you must copy the script's checklist into the body of your reply verbatim. **Hand-typing the checklist is never legal**: do not reconstruct it from memory, retype it, re-use a list you printed in an earlier turn, or replace it with a count or paraphrase like "7 tickets in human-review". The numbered list itself is the menu the developer acts on, so it must appear in full. Tickets move between turns (e.g. a rejection in another session), so a remembered list silently misrepresents the queue; the only trustworthy list is the one the script just printed.

Wait for the developer to reply with a number, a ticket name, or `q`/`quit`/`stop`.

Selection rules:
- An **unchecked** ticket: walk through it (Step 2).
- A **skipped** ticket (checked, still in `human-review/`): the developer may reselect it to look again or resolve it now.
- An **approved/rejected/blocked/backlogged/aborted** ticket (checked, gone from `human-review/`): tell the developer it is already resolved and reprint the checklist; do not reopen it.

The deep read stays delayed: the card gives you the summary and the inspect menu. Only open `detail.md` (full History, Issues, acceptance criteria) and the `evidence/` tree for a ticket when the developer drills into something the card does not carry, and only for the selected ticket, never all up front.

End the review loop when the developer stops (`q`/`quit`/`stop`), or when **every box is checked**. When all boxes are checked, say so plainly (e.g. "All tickets processed this pass; skipped ones remain in human-review for next time") so the developer knows the pass is exhausted.

### 2. Walk through the chosen ticket

When the developer selects a ticket (by number or name), walk them through that **one** ticket. Do not move on until it is resolved (approved, rejected, skipped, blocked, backlogged, or aborted).

For the chosen ticket:

1. **Get and summarise the card.** Print the selected ticket's card:

   `(cd state && bun ../scripts/ticket-card.ts <id>)`

   It prints the ticket's summary facts (changed files, the evidence pass, test results, screenshot paths, commit, the paths to its `detail.md` and `evidence/`) and its tailored inspect menu. Give a short, simple summary (≤3 bullets) of the work and the evidence: what changed (the card's changed files), the test results, and the screenshot paths. Only open `detail.md`/`evidence/` when the developer asks for something the card does not cover (the full History/Issues, a specific transcript).

2. **Run the inspect loop.** Print the inspect menu the card lists (already tailored to this ticket) and let the developer pick options **in any order, one at a time**. Do not dump everything at once: run the picked option, then reprint the menu and wait. The full menu, before tailoring, is:

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

   **Showing means pasting into your reply (mandatory, applies to every "show" pick and to any ad-hoc "show me ..." the developer types).** When the task is to *show* content (a file, a diff, a doc, command output), the content must appear **in the body of your reply as a fenced code block** (this is for text content; screenshots are not rendered inline, see option 1 below). Running `git show`/`git diff`/`cat`/`Read`/a test command does **not** count as showing it: command output and terminal scrollback are not your message and the developer may never see them. If you ran a command to fetch the content, copy the relevant content into your reply. For brand-new files, paste the file content itself, not a `+`-prefixed diff with repeated commit headers. Output the content and stop: add no description, recap, analysis, verdict, or summary after it (see **Show only, nothing trailing** in the Output style above). If the developer says they did not see what they asked for, assume it went to command output and re-send it inline.

   1. **Show the screenshots.** Use the card's screenshot paths. State each screenshot's **full file path on disk** (e.g. `state/tickets/human-review/<id>/evidence/implementation-N/screenshots/<name>.png`), then **open them for the developer** in their image viewer (`xdg-open <path>` on Linux, `open <path>` on macOS), one command per screenshot. List every path. Showing the paths is mandatory, not optional. **Do not render the screenshots inline.** A `Read` of a PNG produces a tool result, which is scrollback the developer never sees in chat, so it is wasted work; `xdg-open` is the only thing that reaches their viewer. **Once the screenshots are open, this option is done: return to the inspect menu immediately.** Do not read other files, and add no description, analysis, or verdict.
   2. **Run it by hand.** Work out which part of the app this ticket changed (from its card's changed-files and `detail.md`), then give the developer everything they need to run and explore it themselves. Pull the exact commands from the **testing manual** (`project/docs/testing-manual/`) if the project keeps one, else from the README or run docs; only if none exist, work them out from the code. Do not invent commands the project already documents. Cover all six, in order:
      1. **Point to the source of the commands.** Name the file and section (the testing manual, README, or run docs) that covers running the app and testing this feature, if the project documents it.
      2. **Setup commands.** The exact command(s) from the manual to set up (e.g. load database fixtures, start test clusters).
      3. **Start command(s).** The exact command(s) from the manual to start the app.
      4. **What to look for.** Exactly what in the app relates to the feature added or changed, and what they should see.
      5. **Tear down the app.** How to stop the app.
      6. **Tear down the setup.** How to remove the setup from step 2 (e.g. drop fixtures, delete test clusters).
   3. **Start it for you.** Run the setup and start commands from option 2 to launch the app for the developer, then tell them what to look at in the app for this change (which view, what they should see). **Do not drive or navigate the app yourself** (no clicking, typing, or routing): just start it and hand it over. The developer explores it and closes it themselves when they are ready.
   4. **Run the automated tests.** Say which tests you will run (the card's Test Plan / test results name which apply), then run them fresh in the foreground (unit, smoke, and/or e2e, picking the levels that match what changed) and show the output.
   5. **Show the doc changes.** Run the diff of the docs this ticket touched (the card's `docsChanged` names them; use its `commit`), then **paste the diff content inline into your reply as a fenced ```diff block**, naming the files changed. Do not merely run `git`/the diff command and rely on terminal scrollback: the developer must see the actual diff in your message without asking again. Show the full diff: every changed file and every line of it. Never elide, truncate, collapse, or summarise any part, however large the diff.
   6. **Read the docs yourself.** Do not show the diff: tell the developer which doc files and sections this ticket touched (the card's `docsChanged`, under `project/docs/`) and how to read them, so they open and read the docs themselves.
   7. **Show the code diff.** Run the diff for the ticket's commit (the card's `commit`), then **paste the diff content inline into your reply as a fenced ```diff block**, naming the files changed. Do not merely run `git show`/`git diff` and rely on terminal scrollback: the developer must see the actual diff in your message without asking again. Show the full diff: every changed file and every line of it. Never elide, truncate, collapse, or summarise any part, however large the diff.
   8. **View the code diff yourself.** Do not show the diff: give the developer the exact command(s) to find and view it themselves (e.g. `git -C project show <commit>` from the card), naming the files changed so they know what to look at.

   The developer leaves the inspect loop by resolving the ticket (`a`/`r`/`s`/`bl`/`bk`/`ab`), which takes you to [Resolve](#3-resolve).

3. As they inspect, capture any **notes**. Notes can target whatever the developer is thinking about, not just the current ticket. Transcribe each note to the right place (confirming when it is not obvious):
   - the current ticket's Notes section (or its History on rejection),
   - the current feature's Notes, behaviour, acceptance criteria, or open questions in `detail.md`,
   - other features (edits to their specs, or new tickets in `todo/` to cover the change),
   - docs (testing manual, user guide, how-it-works),
   - the roadmap (`project/docs/roadmap.md`) for forward-looking ideas.

### 3. Resolve

Then the developer approves, rejects, skips, blocks, backlogs, or aborts. **Rejection requires a note.** Write the outcome into the ticket's `detail.md` (rejection, block, backlog, and abort notes go to its History section), then move the directory with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`):
- **Approve:** to `merge-queue/`.
- **Reject with notes:** back to `todo/`, notes appended to History. **Record every issue the developer raises as a new unticked checkbox in the ticket's `## Issues` section** (create the section if absent), in addition to the History note, so `pb:next`'s implement agent must fix each one and tick it, and its review agent fails the ticket until every box is genuinely resolved. A human rejection is not a failure, it is their explicit decision to rework the ticket: run `bun ../scripts/reset-failures.ts <id>` (from `state/`) to clear its `**Failures:**` count to 0, then move it to `todo/`. It rejoins the loop with a clean slate and `pb:next` re-implements it with your notes. A person decides each round, so there is no cap.
- **Skip:** leave it in `human-review/` to return to later. No move, no note required. Return to the list; the skipped ticket stays and reappears there.
- **Block:** to `blocked/`. The ticket is **sound but cannot be worked on now because it depends on other tickets or work that has not landed yet** (e.g. its evidence cannot be produced, or it would conflict, until those merge). This is neither a rejection (no fault in the work) nor an abort (the work is still wanted); it is a deferral that says "not until its blockers clear". A reason note is **optional**; if they give one, append it to the ticket's History section (name the blocker, and what to do once it clears) before the move. Then move the directory to `blocked/`. `pb:next` never picks from `blocked/`, so the ticket waits there until `pb:unblock` resets its `**Failures:**` count to 0 and moves it back to `todo/`; do not reset the count yourself (leave it untouched, `pb:unblock` handles it on re-admission). If the developer also wants the current in-flight work **discarded** (so it is re-implemented from scratch when unblocked), remove its worktree and delete its branch: `git -C project worktree remove --force project/worktrees/<id>` then `git -C project branch -D worktrees/<id>` (force-prune first with `git -C project worktree prune` if the worktree is already gone). The `blocked/` queue is the record that it is parked on its dependencies, not in flight.
- **Backlog:** to `backlog/`. The developer is **deprioritizing a sound ticket for later**, it is still wanted but is not a contender for the current round (unlike a block, it is not waiting on a specific dependency, just set aside). A reason note is **optional**; if they give one, append it to the ticket's History section before the move. Then move the directory to `backlog/`. `pb:next` never picks from `backlog/`, so the ticket waits there until `pb:promote` pulls it back to `todo/`. Leave its `**Failures:**` count untouched. The same optional work-**discard** step as Block applies (remove the worktree and delete the branch if the developer wants it re-implemented from scratch on promotion). The `backlog/` queue is the record that it is parked, not in flight.
- **Abort:** to `aborted/`. The developer is killing the ticket: the work is abandoned and will not be done. A reason note is **optional**; if they give one, append it to the ticket's History section as the abort reason before the move. Then move the directory to `aborted/`, which sets the ticket's state to aborted (the queue it sits in is its status). Unlike a rejection, an aborted ticket does not rejoin the loop and its `**Failures:**` count is left untouched; `pb:next` never touches `aborted/`. The `aborted/` directory is its only record.

The `move.ts` (approve/skip-then-later/block/backlog/abort) and `reset-failures.ts` + `move.ts` (reject) calls above commit their own state change automatically, ticket-scoped, so the History note and `## Issues` edits you wrote into the ticket's `detail.md` before the move ride in that commit. For any **follow-up ticket** you queued in `todo/` from the notes, commit it separately: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`).

Whatever the outcome, **record its outcome by marking it** (this reprints the checklist with the ticket checked off):

`(cd state && bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review --mark <id> --outcome <approved|rejected|skipped|blocked|backlog|aborted> --prompt 'Which ticket do you want to review? (number, ticket ID, or stop)')`

Every outcome checks the box: resolving it (approve/reject/abort) or deferring it (skip/block/backlog) all count as processed. The marked row stays visible with its outcome for the rest of the session, even once the ticket has left `human-review/`.

Once the ticket is marked, **return to the review loop**: the `--mark` call already reprinted the checklist (every processed ticket shown checked with its outcome, the rest unchecked); ask "Which ticket do you want to review?" again. A skipped ticket stays in `human-review/` and remains selectable; an approved, rejected, blocked, backlogged, or aborted ticket has left the queue and cannot be reopened. Keep looping until the developer stops or every box is checked.

## Example

See the `pick-one-loop` checklist example in [docs/ticket-selection.md](../../../docs/ticket-selection.md). After the developer selects a ticket, the inspect loop and resolution proceed as below:

```
Developer: 1

search-3, debounced search input
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
- Approve search-3 -> merge-queue/.
- Mark: format-ticket-selection.ts --mark search-3 --outcome approved (reprints the checklist).

Developer: search-5

search-5, fuzzy matching
Developer: ab, not shipping it.
- Abort reason -> search-5 History. Moved -> aborted/.
- Mark: --mark search-5 --outcome aborted (reprints the checklist).

Developer: search-7

search-7, saved searches
Developer: bl, can't capture this until search-3 merges.
- Block reason (blocked by search-3) -> search-7 History. Moved -> blocked/ (blocked on search-3, not in flight). pb:unblock re-admits it.
- Mark: --mark search-7 --outcome blocked (reprints the checklist).

Developer: s

search-4, result ranking
Developer: s, come back to it later.
- Skipped. Left in human-review. Mark: --mark search-4 --outcome skipped (reprints the checklist).

All tickets processed this pass; search-4 (skipped) remains in human-review for next time.
```

## Next

Recommend the developer run:
- `pb:next`: to land approved tickets and continue the loop.
