---
name: pb:review
description: Invoke when there are items in human-review/ waiting for the developer to approve, reject, or defer. Walks the developer through each item (diff, captured evidence, tests, UI/CLI, docs), transcribes their notes to the right place, and moves the item to merge-queue/ on approval, back to todo/ on rejection, or leaves it in human-review/ when deferred. Keywords: review, human review, approve, reject, defer, come back later, skip, walk me through, sign off, check the work, review queue, code review, accept changes.
---

STATUS: NEEDS REVIEW

# pb:review

Walk the developer through the `human-review/` queue. This is the human approval gate: the one point in the loop where a person decides.

## Responses

The developer drives the walkthrough with two sets of single-letter (or full-word) commands:

- **Work item:** `a`/`approve`, `r`/`reject`, `d`/`defer`. Any one of these **exits the review of the current work item** at any point, even mid-walkthrough (the developer does not have to finish every review step first), and moves on to the next item. See [Resolve](#3-resolve).
- **Review step:** `n`/`next`. Advances to the next review step within the current item.

Anything else the developer types mid-walkthrough is treated as a **note** (transcribe it, see below) or a question (answer it); stay on the current review step until they send `n` or a work-item command. Never advance a step or an item on your own: present one review step, then wait for the developer's reply.

## Steps

### 1. Summarise and offer

Read every item in `human-review/`. Give the developer a **very short, easy-to-read bullet-point summary** of the items ready for review (one line each). Then **offer to step them through the review**.

If they decline, stop here.

### 2. Walk through, one item at a time

If they say yes, **make a todo list of all the items** and work through them **one at a time**. Do not move on to the next item until the current one is resolved (approved, rejected, or deferred).

For each item:

1. **Give a short, simple summary** of the work done and the evidence collected (test output, screenshots, command transcripts). Evidence is captured per pass under `evidence/` (`implementation-N/`, `review-N/`); the highest-numbered `implementation-N/` and `review-N/` reflect the current state, with earlier pairs showing prior rejected rounds.

2. **Step them through their review, one step at a time.** Build a review checklist of **review steps** for the item and take the developer through it **one review step at a time** so they are not overwhelmed. Do not dump the whole list at once: present one step, then wait. The developer sends `n`/`next` to advance to the next step (or a work-item command to exit early). Tailor the steps to the item; draw from:
   - which **diffs** to look at (name the files),
   - which **tests** to run,
   - which **UI or CLI output** to explore,
   - which **documentation** to read,
   - anything else specific to the item.

   When the last review step is done, prompt for the work-item resolution (`a`/`r`/`d`).

3. As they review, capture any **notes**. Notes can target whatever the developer is thinking about, not just the current item. Transcribe each note to the right place (confirming when it is not obvious):
   - the current item's Notes section (or its History on rejection),
   - the current feature's Notes, behaviour, acceptance criteria, or open questions in `detail.md`,
   - other features (edits to their specs, or new work items in `todo/` to cover the change),
   - docs (testing manual, user guide, how-it-works),
   - the roadmap (`docs/roadmap.md`) for forward-looking ideas.

### 3. Resolve

Then the developer approves, rejects, or defers. **Rejection requires a note.** Write the outcome into the work item's `detail.md` (rejection notes go to its History section), then move the directory with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`):
- **Approve:** to `merge-queue/`.
- **Reject with notes:** back to `todo/`, notes appended to History. A rejection is not a failure, it is your explicit decision to rework the item: run `bun ../scripts/reset-failures.ts <id>` (from `state/`) to clear its `**Failures:**` count to 0, then move it to `todo/`. It rejoins the loop with a clean slate and `pb:next` re-implements it with your notes. A person decides each round, so there is no cap.
- **Defer:** leave it in `human-review/` to return to later. No move, no note required. Skip to the next item.

Update `current-state.md` to reflect the move (and any follow-up items queued from the notes above): add or amend only the entries these changes affect, leaving the rest of its existing content intact.

## Example

```
Reviewing search-3 (debounced search input).

Evidence (review-1/): unit.txt (12 passed), smoke.txt (exit 0), screenshots/results.png.
Diff: src/search/input.tsx (+44 -3).

Developer: Looks good, but the placeholder text should say "Search docs".
  -> note transcribed to feature search/detail.md behaviour, and a follow-up item
     queued as todo/search-6 (placeholder copy). Approving search-3 as-is.

Moved search-3 to merge-queue/. current-state.md updated.

---

Reviewing search-4 (search result ranking).

Developer: Not sure about this yet, I want to test it more tomorrow.
  -> Deferred. Left in human-review/, no changes made. Moving on to search-5.
```
