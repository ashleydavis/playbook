---
name: pb:next
description: Invoke to drive the development loop forward without human input: merge any approved items, then implement the next batch of up to 10 unblocked items through to human review. Run it once and let it drain the queues; you do not run it again until the developer has unblocked something (e.g. by completing reviews). Keywords: next, work next, run the loop, drive the pipeline, implement, merge, drain the queue, autonomous, batch, keep going, do the work.
---

STATUS: REVIEWED

# pb:next

Drain every item the queues can move without human input. `pb:next` sets a `/goal` for itself and keeps running turns until the queues stop making forward progress, so a single invocation is enough. You do not run it again until the developer has unblocked something (e.g. by completing reviews in `pb:review`).

Each work item passes through stages: merge, implement, agent-review. The parent agent does none of this work itself. For each item at each stage it spawns a sub-agent, started with its working directory set to that item's worktree so it cannot touch the main project repo by accident. The sub-agent moves the item directory itself with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`) when its goal is met.

Every check a sub-agent runs follows the verification rule: run fresh in the foreground (never backgrounded to be woken later), read in full, and captured to the item's current evidence subdir (`implementation-N/`, `review-N/`, or `merge/`) before any pass is claimed. A check that cannot finish within the turn's budget becomes a failure, not an idle wait.

`bun ../scripts/next-items.ts` (run from `state/`) is the parent agent's single source of truth for what to do. One call returns a JSON object keyed by the queues pb:next drives, each value the list of item IDs to act on:

```json
{ "merge-queue": [...], "agent-review": [...], "todo": [...], "in-progress": [...] }
```

`merge-queue`, `agent-review`, and `in-progress` list every item in those queues; `todo` lists only the actionable items (dependencies resolved), capped so that `todo` and `in-progress` together never exceed 10 items in flight (so `todo` is empty once `in-progress` is full). Empty queues come back as empty arrays. To decide what to do, the parent agent runs no other command and reads no other file. It acts only on what the report says.

The repo layout is fixed and known: `state/` and `project/` are siblings under the playbook root where Claude Code was launched. There is nothing to discover, so **do not inspect, list, or explore the filesystem to orient yourself** (no `ls`, no checking that `state/` exists, no reading the tree). The first command you run against the filesystem is the report itself (`bun ../scripts/next-items.ts` from `state/`); never precede it with a directory listing or any other check.

**`current-state.md` is the parent agent's responsibility alone.** Only the parent agent updates it. Sub-agents must never write to it: they run in parallel and a shared-file write would race. A sub-agent's only state changes are to its own item (move its directory with `move.ts`, write its `evidence/`, add a History note to its `detail.md`, commit). The parent reflects those changes into `current-state.md` after the turn.

## Processing order

Each turn works the queues in this priority order: **`merge-queue` → `agent-review` → `todo` → `in-progress`**. The principle is *finish work nearest to done before starting anything new*: land approved items on main first, then clear every review already in flight, and only then admit and implement new work. Draining `agent-review/` ahead of `todo/` keeps items flowing through to `human-review/` instead of piling up fresh `in-progress/` work behind a backlog of unreviewed items.

## When anything fails

A failure is any setback from any source: a sub-agent times out or exhausts its turn budget, a check fails, a merge conflict cannot be resolved, a Debug root cause comes back not proven, a Fix does not solve its problem, or post-merge checks fail on main. Every failure is handled the same way:

- **Always record it with the script.** Whoever hits the failure runs `bun ../scripts/fail-work-item.ts <id>` (from `state/`) to increment the item's `**Failures:**` count, and writes a History entry in the item's `detail.md` documenting this failure: the stage, what failed, and where the evidence is. No failure is handled without doing both, so the item carries a complete, deterministic record of everything that went wrong.
- **Leave nothing mid-stage (the invariant).** A turn ends only with `in-progress/` empty: every admitted item sits in a terminal queue (`agent-review/` on success, `todo/`/`blocked/` on failure). A sub-agent self-routes its own failure when it can, but a timed-out, dead, or bare-verdict sub-agent cannot, so the parent never trusts that. As the last act of every turn the parent re-runs `next-items.ts`: any item still shown in `in-progress/` is an un-recorded failure (no sub-agent is working it now), so the parent records it with `fail-work-item.ts`, writes the History note, and routes it by count. The same applies to anything stranded in `agent-review/` by a dead review agent. This reconciliation runs on a clean exit and on an environmental-failure handback alike (see Step 3).
- **Retry under the cap, block at it.** Three failures of any kind, from any source, park the item. If the new count is below 3, the item returns to `todo/` and the loop retries it from the start on a later pass. If it reaches 3, it moves to `blocked/`; `pb:next` never retries a blocked item, and only a human re-admits it (`bun ../scripts/move.ts <id> todo` from `state/`).
- **Continue with the rest.** One failed item does not stop the run; the loop keeps processing the others.
- **Stop on an environmental failure.** Two or more items failing the same stage or check in one run is an environmental failure (the cause is the environment, not the items): reconcile every failed item first (per the invariant above and Step 3), record the cause, and hand back. See the **Environmental failure** section in `process.md` for the full handling. Handing back never means leaving items mid-stage.
- **Never invent a recovery.** Do not switch from parallel to serial, do not re-drive a failed item by hand outside this retry path, do not loop a broken batch through slowly. A failure is recorded and surfaced, not absorbed. Slow-but-grinding for hours is itself a failure to report.
- **Tell the developer.** Record every block, environmental failure, and broken-main situation in the top `⚠ Needs your action` section of `current-state.md`, naming the item and the one-line reason. That section leads the file so it is the first thing the developer sees, directly or via `pb:status`.

The one exception is a **broken main**: if a merge lands on main but its post-merge checks then fail, the item still goes to `todo/` (not `blocked/`) so fixing main stays actionable, the failure is recorded as above, and the run stops because every later item builds on main.

## Agent cleanup

A sub-agent must leave nothing running and nothing stray behind when it returns, on success or failure alike. Cleaning up after itself is a completion criterion, not an optional courtesy.

- **Kill every process you start.** Any long-lived process a sub-agent launches (a `bun run dev` server, a vite frontend, a backend started to capture a screenshot, a test harness, anything that listens on a port or watches the filesystem) **must be killed before the sub-agent returns**. Start such processes in the background under the sub-agent's own control, track their PIDs, and kill them in teardown. An orphaned process from one worktree collides with every other worktree (they share default ports) and leaks host resources (a watcher holding inotify handles), so the next agent fails with `EADDRINUSE` or `ENOSPC` through no fault of its own. The kwok clusters a check creates are torn down the same way: leave no cluster, controller, or lock behind.
- **Leave the project worktree clean.** Commit only the changes that implement the item. Remove any throwaway artifacts you created to collect evidence (capture scripts, screenshot specs, `test-results/` dirs, temp output) so they are neither committed nor left untracked in `project/`; capture code never lands in `project/` (see the implement step and Verification and Evidence). `git status --porcelain` in the worktree must be empty but for the item's own commit.
- **Parent safety net.** Sub-agents die, time out, or forget, so the parent does not trust teardown alone. The end-of-turn reconciliation (Step 3) reaps any process still rooted under `project/worktrees/` as well as any item left mid-stage, so a leaked server never survives the turn that spawned it.

## Verification and Evidence

A goal is met only when the evidence proving it is on disk. Each sub-agent goal requires "the evidence required by Verification and Evidence" captured to the pass's subdir; this section defines what that evidence is, so the goals never enumerate it themselves.

**One subdir per pass.** Implement passes write `evidence/implementation-N/`, review passes `evidence/review-N/` (N one more than the highest existing for that kind), and merge writes `evidence/merge/`. Evidence lives in the item's own directory and travels with it through every queue move.

**What counts as sufficient evidence:**

- **Check output.** The full, fresh output of every check the goal names (compile, lint, unit, smoke, e2e, and any judgement check), with its exit code visible, one file per suite. Captured per the verification rule (run fresh, in the foreground, read in full).
- **UI screenshots.** Any change that affects the UI must be captured as a screenshot of **every** affected view in **both light and dark mode** (every UI screenshot exists in both modes). A single representative page is not enough: if the change is applied to several pages (e.g. pods, nodes, deployments, statefulsets, daemonsets), capture each one, in both modes. Capture them however works, but never by committing capture code to `project/`: the capture script lives in the item's `evidence/` or a temp dir and is discarded (see Agent cleanup).
- **Command transcripts.** For anything else a claim rests on (a build log, a bug reproduction), the captured command and its output.

Sufficient means enough that the developer can confirm every part of the goal from the files alone, without re-running anything.

## Steps

1. Set the overall goal for this turn of the development loop:

   ```
   /goal Forward progress is exhausted: in-progress/ is empty (no item left mid-stage), merge-queue/ and agent-review/ are empty, and every unblocked item in todo/ has moved downstream (what remains is in human-review/, done/, blocked/, or blocked by unmet dependencies). Abort early if two or more items fail the same stage or check in one run (an environmental failure), or after 50 turns; a single failure does not abort the loop. Even on an environmental-failure abort, in-progress/ must be empty first: reconcile every failed item before handing back.
   ```

2. Each turn, work the queues in processing order (**`merge-queue` → `agent-review` → `todo` → `in-progress`**; see Processing order above). **Begin every step by re-running `bun ../scripts/next-items.ts`**, because an earlier step may have moved items into this step's queue (the todo step feeds `in-progress`). It is cheap and deterministic, so always act on a freshly generated report, never a stale one:

   1. **Run the report, then process its `merge-queue` list first.** For each ID, spawn a sub-agent with:

      ```
      /goal <id> is merged into main and its directory is in done/, with every post-merge check (compile, lint, unit, smoke, e2e) passing on main and the evidence required by Verification and Evidence captured to evidence/merge/. Or stop after 15 turns.
      ```

      The sub-agent merges with `bun ../scripts/finalize-work-item.ts <id>` (run from `state/`), which rebases the item's worktree onto the project's current branch, fast-forwards the merge, and removes the worktree. **Never run `git worktree` or the merge by hand**; the script resolves the paths and handles the cleanup. Its exit status drives what happens next:
      - **Conflict** (exit 2): the script aborts cleanly and leaves the worktree intact. The sub-agent resolves the conflict in the worktree (merge main in, fix the conflicted files, commit per the commit template), then re-runs `finalize-work-item.ts <id>`. If it cannot resolve the conflict, handle it as a failure (see **When anything fails**): record it and route the item by its count, leaving main untouched.
      - **Merged** (exit 0): the changes are on the project's branch now and the worktree is gone. The item moves to `done/`. The sub-agent then runs the post-merge checks and fixes any failures on main, committing each fix per the commit template, until they pass.

      Problem (timeout or exhausted budget): if the merge never happened (the item is still in `merge-queue/`, main is clean), handle it as a failure (see **When anything fails**) and carry on with the rest. If the merge happened but the post-merge checks did not all pass, the changes are on main and may have broken it: record the failure, move the item to `todo/` so fixing main stays actionable (the broken-main exception), note it in `current-state.md`, and stop the run because every later item builds on main. The developer resolves it before invoking `pb:next` again.

   2. **Run the report, then for each ID in its `agent-review` list,** spawn a sub-agent with:

      ```
      /goal <id> has passed agent review and moved from agent-review/ to human-review/, with the evidence required by Verification and Evidence captured to evidence/review-N/ (N one more than the highest existing review-N), or it has been rejected back to todo/ as a failure (an item with any unticked issue in its `## Issues` section, or a ticked issue that is not actually fixed, is rejected automatically). Or stop after 10 turns.
      ```

      The sub-agent **reviews only**: it makes no code changes and writes nothing but the item's own state. It re-runs the deterministic checks fresh (lint, format, unit, smoke, and any others), runs the judgement checks (every file in `docs/rules/`, the touched `CLAUDE.md` files, and `documentation.md`), and reviews the committed diff hunk by hunk against the acceptance criteria, capturing all of it to `evidence/review-N/`.

      **The review rejects the item if any of these is true:**
      - A deterministic check fails (lint, format, unit, smoke, or any other).
      - A judgement check fails (any rule in `docs/rules/`, a touched `CLAUDE.md`, or `documentation.md`).
      - The committed diff does not meet the acceptance criteria.
      - The commit contains any change not required by the item (committed evidence-collection code being the leading example).
      - Any checkbox in the item's `## Issues` section is unticked.
      - A ticked issue checkbox is not actually resolved.
      - A change touches the UI but the required UI screenshots are missing (see Verification and Evidence).

      When the review finds a new fault, it records that fault as a new unticked checkbox in the item's `## Issues` section (in addition to a History note) before rejecting, so the issue is tracked in the section, not only in history. Resolved issues stay in the section ticked as a permanent record; checkboxes are never deleted. On a clean pass it moves the item to `human-review/`; on any fault it rejects the item back to `todo/` as a failure (routed per **When anything fails**), never fixing the work it judges. It does not write `current-state.md` itself (that would race with the other sub-agents); the parent reflects the outcome there after the turn (step 3). Problem (timeout, exhausted budget): the parent handles it the same way, recording it and routing the item by its count, then continues with the rest.

      Two item types change the agent-review behaviour (see `pb:debug` for the full flow):
      - **Debug** items produce no code, only a proven root cause. The review agent assesses that the root cause is proven with evidence. On pass it moves the Debug item to `done/` (not `human-review/`) and creates a `Fix` item in `todo/` carrying the proven root cause. On fail it returns the item to `todo/` with notes.
      - **Fix** items additionally require that the fix solves the proven problem (the reproduction now passes), is the minimal/simplest change that does so, and ships with evidence the fix worked. On pass the Fix item moves to `human-review/` as normal; on fail it returns to `todo/` with notes.

   3. **Run the report, then admit each ID in its `todo` list.** These are the actionable items (dependencies are already resolved); take them as-is without opening their files. For each ID, run `bun ../scripts/setup-work-item.ts <id>` from `state/`. That one command does the whole admission: it moves the directory from `todo/` to `in-progress/` and creates the item's worktree against the project repo at `project/worktrees/<id>`, on a new branch `worktrees/<id>` at the project's current commit. It resolves all the paths itself, so **never run `git worktree` by hand**. It is idempotent: re-running for an already-admitted item is a safe no-op.

   4. **Run the report, then for each ID in its `in-progress` list** (the items just admitted from `todo/`, plus any left from an interrupted earlier run), spawn a sub-agent in parallel with:

      ```
      /goal <id>'s acceptance criteria are implemented in its worktree, with every Test Plan test (unit, smoke, and e2e where applicable) passing, the code compiling and linting clean, and the evidence required by Verification and Evidence captured to evidence/implementation-N/ (N one more than the highest existing implementation-N). The relevant docs are updated, every issue in the item's `## Issues` section (in detail.md) is resolved and its checkbox ticked, only the changes that implement the item are committed, and the directory has moved from in-progress/ to agent-review/. Or stop after 20 turns.
      ```

      The sub-agent first reads the item's `## Issues` section in `detail.md` (if present) and **must resolve every issue listed there**, ticking each issue's checkbox only once that issue is genuinely fixed (tick the box, never delete it: resolved issues stay in the section as a permanent record). The item must not move to `agent-review/` while any issue checkbox is unticked. Any further issue the sub-agent discovers and fixes during implementation must also be recorded as a ticked checkbox in the `## Issues` section (in addition to any History note), so the section is the complete ledger of issues raised and resolved. It then implements the code, writes tests, and updates docs (ticking the matching acceptance-criteria boxes in the feature's `detail.md`, the testing manual, and any other docs the change touches). It captures the evidence required by Verification and Evidence to the pass's `evidence/implementation-N/`, collecting it however works but **committing no capture code to `project/`**. It commits only the changes that implement the item, per the commit template, and moves the directory to `agent-review/` once every completion criterion is met. Problem (timeout, exhausted budget, check failure): the parent handles it as a failure, recording it and routing the item by its count, then continues with the rest (see **When anything fails**).

      A **Debug** item is the exception (see `pb:debug`): it is a throwaway investigation, not an implementation. Its goal drops the commit/compile/lint conditions; the agent experiments freely, and its only success condition is that the root-cause write-up is in `detail.md`, the proving evidence is in `evidence/`, and the item has moved to `agent-review/`. The worktree's code changes are discarded.

3. After each turn, **reconcile first, then record state.** This step runs every turn, including when the turn ended on an environmental-failure handback.

   1. **Reconcile (the invariant).** Re-run `bun ../scripts/next-items.ts` one final time. All sub-agents for the turn have returned, so its `in-progress` list must be empty. Every ID still in it is an un-recorded failure a sub-agent left behind (a timeout, a death, or a bare failure verdict the parent's prompt told it not to route). For each such ID: run `bun ../scripts/fail-work-item.ts <id>` (from `state/`), append a History note to its `detail.md` (the stage, what failed, the evidence path), and `move.ts` it to `todo/` (or `blocked/` at the third failure) per **When anything fails**. Do the same for anything stranded in `agent-review/` by a dead review agent. Do not end the turn while `in-progress/` is non-empty.
   2. **Reap leaked processes (Agent cleanup safety net).** A sub-agent that died or timed out cannot run its own teardown, so the parent sweeps up after it: kill any process whose working directory is under `project/worktrees/` (a leftover `bun`/vite/backend dev server or watcher), and tear down any kwok cluster, controller, or lock a check left behind. This guarantees no orphaned server survives to collide with the next run on a shared port or exhaust the host's inotify watches. Do not end the turn with a process still rooted in a worktree.
   3. **Record state.** Now update `current-state.md` to reflect the items that moved or were created this turn (not only the abort cases but the normal forward progress, plus any Fix item spawned from a proven Debug, and every item the reconciliation just routed): add or amend only the entries these changes affect, leaving the rest of its existing content intact. Keep the file's shape: anything needing the developer (environmental failures, items in `human-review/`, blocked items) goes in the top `⚠ Needs your action` section, one or two plain lines each; routine forward progress goes in the `Progress` section below. If the turn ended on an environmental-failure handback, write the `Run halted: environmental failure` entry at the top (the shared stage or check, the items involved, the suspected cause, and the evidence path), since those items usually returned to `todo/` and would otherwise leave no record of why the run stopped.

   Then the `/goal` evaluator checks the condition. When forward progress is exhausted, the goal clears and `pb:next` stops. Items in `human-review/` wait for `pb:review`.

Use `/goal clear` to interrupt early. `/goal` with no argument shows status.

## Example

```
/goal set for the loop.
merge-queue/: empty.
agent-review/: empty.
todo/: 3 unblocked items (search-3, search-4, infra-5). Took all 3.
  -> moved to in-progress/, worktrees created.
  -> 3 implement sub-agents running in parallel.
search-3, infra-5 passed implementation -> agent-review/.
Next turn: agent-review/ drained first -> search-3, infra-5 reviewed -> human-review/.
search-4 failed agent-review (committed a change unrelated to the item); reviewer recorded a History note and returned it to todo/; current-state.md updated by the parent, loop continued.
Forward progress exhausted. Goal cleared. search-3 and infra-5 await pb:review.
```
