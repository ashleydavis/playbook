---
name: pb:review
description: Invoke when there are items in human-review/ waiting for the developer to approve, reject, or defer. Walks the developer through each item (diff, captured evidence, tests, UI/CLI, docs), transcribes their notes to the right place, and moves the item to merge-queue/ on approval, back to todo/ on rejection, or leaves it in human-review/ when deferred. Keywords: review, human review, approve, reject, defer, come back later, skip, walk me through, sign off, check the work, review queue, code review, accept changes.
---

STATUS: NEEDS REVIEW

# pb:review

Walk the developer through the `human-review/` queue. This is the human approval gate: the one point in the loop where a person decides.

## Steps

For each item in `human-review/`, prompt the developer to:

1. Read the code diff.
2. Review the captured evidence in the item's `evidence/` subdir (test output, screenshots, command transcripts) as a first pass, before re-running anything by hand.
3. Run the tests.
4. Check the UI or CLI output.
5. Read the updated docs.
6. Make notes about anything that comes up. Notes can target whatever the developer is thinking about, not just the current item. Transcribe each note to the right place (confirming when it is not obvious):
   - the current item's Notes section (or its History on rejection),
   - the current feature's Notes, behaviour, acceptance criteria, or open questions in `detail.md`,
   - other features (edits to their specs, or new work items in `todo/` to cover the change),
   - docs (testing manual, user guide, how-it-works),
   - the roadmap (`docs/roadmap.md`) for forward-looking ideas.

Then the developer approves, rejects, or defers. **Rejection requires a note.** Write the outcome into the work item's `detail.md` (rejection notes go to its History section), then move the directory with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`):
- **Approve:** to `merge-queue/`.
- **Reject with notes:** back to `todo/`, notes appended to History. A rejection is not a failure, it is your explicit decision to rework the item: run `bun ../scripts/reset-failures.ts <id>` (from `state/`) to clear its `**Failures:**` count to 0, then move it to `todo/`. It rejoins the loop with a clean slate and `pb:next` re-implements it with your notes. A person decides each round, so there is no cap.
- **Defer:** leave it in `human-review/` to return to later. No move, no note required. Skip to the next item.

Update `current-state.md` to reflect the move (and any follow-up items queued from the notes above): add or amend only the entries these changes affect, leaving the rest of its existing content intact.

## Example

```
Reviewing search-3 (debounced search input).

Evidence: unit.txt (12 passed), smoke.txt (exit 0), screenshots/results.png.
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
