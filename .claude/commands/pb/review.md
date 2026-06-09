---
name: pb:review
description: Invoke when there are tickets in human-review/ waiting for the developer to approve, reject, defer, or abort. Walks the developer through each ticket (diff, captured evidence, tests, UI/CLI, docs), transcribes their notes to the right place, and moves the ticket to merge-queue/ on approval, back to todo/ on rejection, to aborted/ on abort, or leaves it in human-review/ when deferred. Keywords: review, human review, approve, reject, defer, abort, kill, abandon, drop, come back later, skip, walk me through, sign off, check the work, review queue, code review, accept changes.
---

STATUS: NEEDS REVIEW

# pb:review

Walk the developer through the `human-review/` queue. This is the human approval gate: the one point in the loop where a person decides.

## Output style

Follow the project's [output format](../../../output-format.md) (load it once per session if it is not already in your context). Specific to review:

- A review step is two things: *what to look at* (a path, command, or `file:line`) and *what to check*. Nothing else.
- Lead each bullet with the action: **Open `<path>`**, **Run `<command>`**, **Look at `<file>:<line>`**.
- A ticket summary is at most 3 bullets: what changed, the evidence (test result + screenshot paths), the diff (files touched). Do not retell the History.

## Responses

The developer drives the walkthrough with two sets of single-letter (or full-word) commands:

- **Ticket:** `a`/`approve`, `r`/`reject`, `d`/`defer`, `ab`/`abort`. Any one of these **exits the review of the current ticket** at any point, even mid-walkthrough (the developer does not have to finish every review step first), and moves on to the next ticket. See [Resolve](#3-resolve).
- **Review step:** `n`/`next`. Advances to the next review step within the current ticket.

Anything else the developer types mid-walkthrough is treated as a **note** (transcribe it, see below) or a question (answer it); stay on the current review step until they send `n` or a ticket command. Never advance a step or a ticket on your own: present one review step, then wait for the developer's reply.

## Steps

### 1. Summarise and offer

List the tickets in `human-review/`. For the one-line summary, **read only each ticket's `index.md`**, which already holds the title and a one-line summary. **Do not read `detail.md` here** (its History and evidence logs run to thousands of lines and must not be slurped). Then **offer to step them through the review**.

Defer the deep read: `detail.md` (History, Issues, acceptance criteria) and the `evidence/` tree for a given ticket are only read in Step 2, lazily, when you reach that ticket, never all up front.

If they decline, stop here.

### 2. Walk through, one ticket at a time

If they say yes, **make a todo list of all the tickets** and work through them **one at a time**. Do not move on to the next ticket until the current one is resolved (approved, rejected, or deferred).

For each ticket:

1. **Now read this one ticket in full** (its `detail.md` and the relevant `evidence/` files) and **give a short, simple summary** of the work done and the evidence collected (test output, screenshots, command transcripts). This is the point to read the whole `detail.md`, not before. Evidence is captured per pass under `evidence/` (`implementation-N/`, `review-N/`); the highest-numbered `implementation-N/` and `review-N/` reflect the current state, with earlier pairs showing prior rejected rounds, so read the latest pass first and only go back if needed.

2. **Step them through their review, one step at a time.** Build a review checklist of **review steps** for the ticket and take the developer through it **one review step at a time** so they are not overwhelmed. Do not dump the whole list at once: present one step, then wait. The developer sends `n`/`next` to advance to the next step (or a ticket command to exit early).

   Order the steps by what matters most. The first two steps are fixed:

   1. **Show the UI screenshots first** (if the ticket's evidence contains any), before anything else. This step is *show the developer where to find the screenshot*: state its **full file path on disk** (e.g. `state/tickets/human-review/<id>/evidence/implementation-N/screenshots/<name>.png`) so the developer can open it themselves, then also render it inline. Naming the path is mandatory, not optional: rendering the image is not a substitute for telling them where it lives. If there are several screenshots, list every path. **Every affected view must be captured, each in both light and dark mode**: show every page the change touches, in both modes (all paths, all renders). If a UI change is missing any affected view, or has a view in only one mode (or no screenshot at all), flag that coverage gap to the developer as a defect, since agent-review should have required a both-mode screenshot of every affected view. Then **stop and wait** for the developer's command (`n`/`next`, or `a`/`r`/`d`/`ab`). Do not proceed to the next step until they give it.
   2. **Let the developer experience the app themselves.** This is the most important step after the screenshots. The developer wants to run the part of the app that changed and walk through it. Cover both kinds of running, choosing what fits the change:
      - **Run it by hand.** Work out which part of the app this ticket changed (from its `detail.md` and diff), then tell the developer exactly how to launch and walk through that part: the command(s) to run and the steps to follow. Point them to the **relevant section of the testing manual** (`docs/testing-manual/`) that covers this area, naming the file and section so they can read the manual walkthrough for themselves, and offer to launch the app for them (the `run` skill) so they can drive it.
      - **Run the automated tests** that exercise the change, fresh in the foreground: unit, smoke, and/or e2e, picking the levels that match what changed (read the ticket's Test Plan in `detail.md` for which tests apply). Show them the output.

   Then tailor the remaining steps to the ticket; draw from:
   - which **diffs** to look at (name the files),
   - any further **UI or CLI output** to explore,
   - which **documentation** to read,
   - anything else specific to the ticket.

   When the last review step is done, prompt for the ticket resolution (`a`/`r`/`d`/`ab`).

3. As they review, capture any **notes**. Notes can target whatever the developer is thinking about, not just the current ticket. Transcribe each note to the right place (confirming when it is not obvious):
   - the current ticket's Notes section (or its History on rejection),
   - the current feature's Notes, behaviour, acceptance criteria, or open questions in `detail.md`,
   - other features (edits to their specs, or new tickets in `todo/` to cover the change),
   - docs (testing manual, user guide, how-it-works),
   - the roadmap (`docs/roadmap.md`) for forward-looking ideas.

### 3. Resolve

Then the developer approves, rejects, defers, or aborts. **Rejection requires a note.** Write the outcome into the ticket's `detail.md` (rejection and abort notes go to its History section), then move the directory with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`):
- **Approve:** to `merge-queue/`.
- **Reject with notes:** back to `todo/`, notes appended to History. **Record every issue the developer raises as a new unticked checkbox in the ticket's `## Issues` section** (create the section if absent), in addition to the History note, so `pb:next`'s implement agent must fix each one and tick it, and its review agent fails the ticket until every box is genuinely resolved. A human rejection is not a failure, it is their explicit decision to rework the ticket: run `bun ../scripts/reset-failures.ts <id>` (from `state/`) to clear its `**Failures:**` count to 0, then move it to `todo/`. It rejoins the loop with a clean slate and `pb:next` re-implements it with your notes. A person decides each round, so there is no cap.
- **Defer:** leave it in `human-review/` to return to later. No move, no note required. Skip to the next ticket.
- **Abort:** to `aborted/`. The developer is killing the ticket: the work is abandoned and will not be done. A reason note is **optional**; if they give one, append it to the ticket's History section as the abort reason before the move. Then move the directory to `aborted/`, which sets the ticket's state to aborted (the queue it sits in is its status). Unlike a rejection, an aborted ticket does not rejoin the loop and its `**Failures:**` count is left untouched; `pb:next` never touches `aborted/`. Then **remove the ticket entirely from `current-state.md`** (see below): an aborted ticket is not tracked in the narrative, the `aborted/` directory is its only record.

The `move.ts` (approve/defer-then-later/abort) and `reset-failures.ts` + `move.ts` (reject) calls above commit their own state change automatically, ticket-scoped, so the History note and `## Issues` edits you wrote into the ticket's `detail.md` before the move ride in that commit. For any **follow-up ticket** you queued in `todo/` from the notes, commit it separately: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`).

Then update `current-state.md` to reflect the move (and any follow-up tickets queued from the notes above): add, amend, or remove only the entries these changes affect (an aborted ticket is removed outright), leaving the rest of its existing content intact. Commit that edit as its own commit: `bun ../scripts/commit-state.ts "<summary>" current-state.md` (from `state/`).

## Example

```
search-3 — debounced search input
- Changed: src/search/input.tsx (+44 -3)
- Evidence (review-1/): unit 12 passed, smoke exit 0
- Screenshot: state/tickets/human-review/search-3/evidence/review-1/screenshots/results.png

Step 1 — screenshot
- Open the path above (rendered below). Check: results list updates after typing stops.
[n]

Step 2 — run it
- Run: bun run dev, then type in the search box.
- Manual: docs/testing-manual/search.md "Debounce".
[n]

Developer: placeholder should say "Search docs".
- Note -> search/detail.md behaviour; follow-up todo/search-6 (placeholder copy).
- Approve search-3 -> merge-queue/. current-state.md updated.

---
search-4 — result ranking
Developer: d
- Deferred. Left in human-review/. Next: search-5.

---
search-5 — fuzzy matching
Developer: ab — not shipping it.
- Abort reason -> search-5 History. Moved -> aborted/. Removed from current-state.md.
```
