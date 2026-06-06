---
name: pb:next
description: Invoke to drive the development loop forward without human input: merge any approved items, then implement the next batch of up to 10 unblocked items through to human review. Run it once and let it drain the queues; you do not run it again until the developer has unblocked something (e.g. by completing reviews). Keywords: next, work next, run the loop, drive the pipeline, implement, merge, drain the queue, autonomous, batch, keep going, do the work.
---

STATUS: NEEDS REVIEW

# pb:next

Drain every item the queues can move without human input. `pb:next` sets a `/goal` for itself and keeps running turns until the queues stop making forward progress, so a single invocation is enough. You do not run it again until the developer has unblocked something (e.g. by completing reviews in `pb:review`).

Each per-item stage runs as a sub-agent started with its working directory set to the item's worktree, so it cannot touch the main project repo by accident. The sub-agent moves the item directory itself with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`) when its goal is met.

## Steps

1. Set the overall goal for this turn of the development loop:

   ```
   /goal Forward progress is exhausted: merge-queue/ is empty, agent-review/ is empty, and every unblocked item in todo/ has moved downstream. Remaining items are in human-review/, done/, or blocked by unmet dependencies. Or abort: any item has accumulated two timeout notes from sub-agents during this run, or 50 turns have elapsed. On abort, current-state.md is updated to surface the stuck items and the developer is told what to look at.
   ```

2. Each turn, work the queues in order:

   1. **Process `merge-queue/` first.** For each item, spawn a sub-agent with:

      ```
      /goal <id>'s changes are merged into main, the work item directory is in done/, and every post-merge check passes on main: compile, lint, unit tests, smoke tests, e2e (Playwright) tests. Each check is run fresh and its full output captured to the item's evidence/ subdir as proof; completion is claimed only with that evidence present (see Verification and Evidence). Any commits made (post-merge fixes on main) follow the commit template (see Commit Format). Or stop after 15 turns.
      ```

      The sub-agent attempts the merge first, and the directory location follows the result:
      - **Merge fails** (e.g. unresolvable conflicts): the item stays in `merge-queue/` with a History note explaining why. Main is untouched.
      - **Merge succeeds**: the item moves to `done/` immediately (the changes are on main now). The sub-agent then runs the post-merge checks and fixes any failures on main, committing each fix per the commit template, until they pass.

      Timeout (abort): update `current-state.md` so the developer sees the stuck item, and exit `pb:next` (clear the parent `/goal`). The directory tells the developer the state of main: still in `merge-queue/` means the merge never happened (main is clean); already in `done/` means the merge happened but post-merge checks did not all pass (main may be broken). Do not keep pushing more items. The developer resolves the failure before invoking `pb:next` again.

   2. **Read `todo/`,** find items with no unmet dependencies, take up to 10. For each, move the directory from `todo/` to `in-progress/` and create a git worktree named after the work item's ID. The worktree uses the project repo's current branch directly (no new branch).

   3. **For each item in `in-progress/`,** spawn a sub-agent in parallel with:

      ```
      /goal <id>'s acceptance criteria are all implemented in its worktree. Every test in the work item's Test Plan is written and passes: unit tests, smoke tests, and e2e (Playwright) tests where applicable. The code compiles and lints clean. Each check is run fresh and its full output captured to the item's evidence/ subdir as proof, including screenshots of any UI the change affects; completion is claimed only with that evidence present (see Verification and Evidence). The relevant docs are updated: matching acceptance criteria boxes ticked in the feature's detail.md, the testing manual updated, and any other docs the change touches. The changes are committed following the commit template (see Commit Format). The work item directory has been moved from in-progress/ to agent-review/. Or stop after 20 turns.
      ```

      The sub-agent implements the code, writes tests, updates docs, commits per the commit template, and moves the directory to `agent-review/` only once every check in the goal passes. Timeout (abort): the item stays in `in-progress/` with a History note explaining where it got stuck, `current-state.md` is updated, and `pb:next` skips this item but continues with the rest.

      A **Debug** item is the exception (see `pb:debug`): it is a throwaway investigation, not an implementation. Its goal drops the commit/compile/lint conditions; the agent experiments freely, and its only success condition is that the root-cause write-up is in `detail.md`, the proving evidence is in `evidence/`, and the item has moved to `agent-review/`. The worktree's code changes are discarded.

   4. **For each item in `agent-review/`,** spawn a sub-agent with:

      ```
      /goal <id>'s implementation conforms to every rule in the repo's rule set: every file in docs/rules/, plus the root CLAUDE.md and any scoped CLAUDE.md files for directories touched. The documents required by docs/rules/documentation.md exist and are up to date. All agent review checks pass in its worktree: lint, format, unit tests, smoke tests, and any other project checks. Each check is run fresh and its full output captured to the item's evidence/ subdir as proof; completion is claimed only with that evidence present (see Verification and Evidence). Any fixes are committed following the commit template (see Commit Format). The work item directory has been moved from agent-review/ to human-review/. Or stop after 10 turns.
      ```

      The sub-agent runs the review checks, fixes anything that fails (committing each fix per the commit template), and moves the directory to `human-review/` once everything passes. Timeout (abort): the item stays in `agent-review/` with a History note, `current-state.md` is updated, and `pb:next` skips this item but continues with the rest.

      Two item types change the agent-review behaviour (see `pb:debug` for the full flow):
      - **Debug** items produce no code, only a proven root cause. The review agent assesses that the root cause is proven with evidence. On pass it moves the Debug item to `done/` (not `human-review/`) and creates a `Fix` item in `todo/` carrying the proven root cause. On fail it returns the item to `todo/` with notes.
      - **Fix** items additionally require that the fix solves the proven problem (the reproduction now passes), is the minimal/simplest change that does so, and ships with evidence the fix worked. On pass the Fix item moves to `human-review/` as normal; on fail it returns to `todo/` with notes.

3. After each turn, the `/goal` evaluator checks the condition. When forward progress is exhausted, the goal clears and `pb:next` stops. Items in `human-review/` wait for `pb:review`.

Use `/goal clear` to interrupt early. `/goal` with no argument shows status.

## Example

```
/goal set for the loop.
merge-queue/: empty.
todo/: 3 unblocked items (search-3, search-4, infra-5). Took all 3.
  -> moved to in-progress/, worktrees created.
  -> 3 implement sub-agents running in parallel.
search-3, infra-5 passed implementation -> agent-review/ -> human-review/.
search-4 timed out in agent-review/ (lint loop); History note added, current-state.md updated, skipped.
Forward progress exhausted. Goal cleared. search-3 and infra-5 await pb:review.
```
