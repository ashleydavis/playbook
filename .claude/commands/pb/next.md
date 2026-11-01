---
name: pb:next
description: "Invoke to drive the development loop forward without human input: merge any approved tickets, then implement the next batch of up to 10 unblocked tickets through to human review. Run it once and let it drain the queues; you do not run it again until the developer has unblocked something (e.g. by completing reviews). Keywords: next, work next, run the loop, drive the pipeline, implement, merge, drain the queue, autonomous, batch, keep going, do the work."
---

# pb:next

Drain every ticket the queues can move without human input. `pb:next` keeps running turns until the queues stop making forward progress, so a single invocation is enough. You do not run it again until the developer has unblocked something (e.g. by completing reviews in `pb:review`). The one exception is an **interruption** (a session or rate limit, or the developer stopping the run): that is not a completion, so the developer re-runs `pb:next` to resume from the live queue state (see **When the run is interrupted** below).

## Start with the goal

When `pb:next` is invoked, do nothing else: print this goal for the developer to paste, and stop. The loop runs only under the goal.

```
/goal Run the pb:next loop in .claude/commands/pb/next.md, skipping its "Start with the goal" section, until forward progress is exhausted: every ticket is in human-review/ or done/, or waits on an unmet dependency. Never stop to ask a question or for a decision and never stop because a sub-agent says it is blocked.
```

## Never stop while there is work

- Under the goal, the run never stops until forward progress is exhausted (Step 1). It never stops to ask the developer a question or for a decision.
- A sub-agent that returns with a question, a request for a decision or a claim that it is blocked has not finished. The parent sends it back to decide for itself or unblock itself, and to record the decision or how it unblocked itself in the ticket's History and in its commit message.

Each ticket passes through stages: implement (the stages for its ticket type, see **In-progress stages**) and merge. The parent agent does none of this work itself. For each ticket at each stage it spawns a sub-agent, started with its working directory set to that ticket's worktree so it cannot touch the main project repo by accident. The sub-agent moves the ticket directory itself with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`) when its ticket completion criteria are met.

Every check a sub-agent runs follows the verification rule: run fresh in the foreground (never backgrounded to be woken later), read in full, and captured to the ticket's current evidence subdir (`implementation-N/` or `merge/`) before any pass is claimed.

`bun ../scripts/next-tickets.ts` (run from `state/`) is the parent agent's single source of truth for what to do. One call returns a JSON object keyed by the queues pb:next drives, each value the list of ticket IDs to act on:

```json
{ "conflicts": [...], "merge-queue": [...], "todo": [...], "in-progress": [...] }
```

`conflicts`, `merge-queue` and `in-progress` list every ticket in those queues; `todo` lists only the actionable tickets (dependencies resolved, and not locked to another platform by `**Platforms:**`), capped so that `todo`, `in-progress`, and `conflicts` together never exceed 10 tickets in flight (so `todo` is empty once the other two fill it). Empty queues come back as empty arrays. To decide what to do, the parent agent runs no other command and reads no other file. It acts only on what the report says.

The repo layout is fixed and known: `state/` and `project/` are siblings under the playbook root where Claude Code was launched. There is nothing to discover, so **do not inspect, list, or explore the filesystem to orient yourself** (no `ls`, no checking that `state/` exists, no reading the tree). The first command you run against the filesystem is the report itself (`bun ../scripts/next-tickets.ts` from `state/`); never precede it with a directory listing or any other check.

**No shared state file.** A sub-agent's only state writes are to its own ticket: it writes its `evidence/` and adds a History note to its `detail.md` **before** moving its directory via `move.ts`, whose ticket-scoped commit captures the evidence and History along with the transition. So the sub-agent never commits the state repo by hand. The parent never maintains any shared state file; it reports what moved in chat after the turn.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to next:

- Report the run as terse lines: each ticket and what happened to it.
- **Always write ticket IDs in full** (`performance-tabs-4`, not `-4` or `pt-4`) in the run report. A leading-hyphen shorthand reads as a negative number; never abbreviate, truncate, or drop the feature prefix from an ID.

## Processing order

Each turn works the queues in this priority order: **`conflicts` → `merge-queue` → `todo` → `in-progress`**. The principle is *finish work nearest to done before starting anything new*: merge main into the approved tickets that missed the last train, land approved tickets on main, and only then admit and implement new work. `conflicts/` goes first because its tickets are the nearest to done of all: the developer has already approved them and they need only main merged into them to rejoin the train, so leaving them behind a fresh batch of `todo/` work just lets main drift further from them and makes the next merge of main worse.

## When something goes wrong

A ticket never fails. It never counts setbacks, never moves backwards on its own and is never parked.

- **A stage keeps going until its list is done.** A failing check is work for the stage to fix, not a reason to stop.
- **An unfinished stage runs again.** A sub-agent that returns without finishing its list (it timed out, died or gave up) is spawned again for the same stage, starting from the worktree as it is. The parent adds a History note saying which stage it re-ran and why.
- **Environment problem: stop and hand back.** When a worktree setup or dependency install fails, or two or more tickets hit the same error from a cause outside the tickets (a broken tool, shared test fixtures, a contended resource), the environment is broken. Attempt no workaround: no alternative install path, no substitute toolchain, no borrowing another worktree's state, no patching the environment yourself. Stop launching work, leave every ticket where it sits and report `Run halted: environment problem` in chat with the check, the error, the tickets, the suspected cause and the evidence path. The developer fixes the environment and re-runs `pb:next`, which re-drives the tickets from where they sit.
- **Broken main: stop and hand back.** A merge train lands only after its checks pass on the train, which becomes main verbatim, so a clean run never breaks main. If a later check on main fails anyway, the landed tickets stay **done** (a merge cannot be undone). Report the broken main in chat and stop the run, because every later ticket builds on main. Fixing main is a new ticket.
- **Never invent a recovery.** Do not switch from parallel to serial or loop a broken batch through slowly.
- **Tell the developer.** Report every re-run stage, environment problem and broken main in the run report, naming the ticket and the one-line reason.

## When the run is interrupted

An interruption is the run being cut off from outside: a **session or rate limit** (the most common), the developer stopping the run, or the agent or machine dying. It is not an environment problem, and the correct response is simply to stop and let the developer resume later.

- **Stop.** The instant a session/rate limit hits (the parent's own, or a sub-agent returning a limit message), stop launching new work and hand back. Do **not** re-run the stage it cut off and do **not** write a `Run halted: environment problem` entry. A ticket the interruption left mid-stage stays exactly where it is.
- **Leave the queues as the record.** The queues are the durable state, so there is nothing to clean up. State in chat that the run was interrupted and to resume with `pb:next`; the queues themselves are the durable record and `pb:status` will show the in-flight state.
- **Resume by re-running `pb:next`.** When the developer says to resume, they invoke `pb:next` again. Because every script is idempotent and the report is the single source of truth, the run continues from the live queue state with no special handling: `conflicts/` has main merged in and `merge-queue/` is drained, then `todo/` admitted, then `in-progress/` implemented, exactly as on a first run.
- **Inherited strandings are re-driven.** A ticket left in `in-progress/` or `conflicts/` by a prior interrupted run is picked up by this run's normal processing (steps 2.1 and 2.4 already spawn a sub-agent for every ID the report lists in those queues) and **re-driven from where it sits**: an `in-progress/` ticket starts again at the dev stage, which picks up the work already in the worktree, into a fresh `evidence/implementation-N/`. Re-driving is safe because each stage is idempotent and the evidence subdir number increments.

## Agent cleanup

A sub-agent must leave nothing running and nothing stray behind when it returns, whether it finished or not. Cleaning up after itself is a completion criterion, not an optional courtesy.

- **Kill every process you start.** Any long-lived process a sub-agent launches (a `bun run dev` server, a vite frontend, a backend started to capture a screenshot, a test harness, anything that listens on a port or watches the filesystem) **must be killed before the sub-agent returns**. Start such processes in the background under the sub-agent's own control, track their PIDs, and kill them in teardown. An orphaned process from one worktree collides with every other worktree (they share default ports) and leaks host resources (a watcher holding inotify handles), so the next agent fails with `EADDRINUSE` or `ENOSPC` through no fault of its own. The kwok clusters a check creates are torn down the same way: leave no cluster, controller, or lock behind.
- **Leave the project worktree clean.** Commit only the changes that implement the ticket. Remove any throwaway artifacts you created to collect evidence (capture scripts, screenshot specs, `test-results/` dirs, temp output) so they are neither committed nor left untracked in `project/`; capture code never lands in `project/` (see the implement step and Verification and Evidence). `git status --porcelain` in the worktree must be empty but for the ticket's own commit.
- **Parent safety net.** Sub-agents die, time out, or forget, so the parent does not trust teardown alone. The end-of-turn sweep (Step 3) reaps any process still rooted under `project/worktrees/`, so a leaked server never survives the turn that spawned it.

## Verification and Evidence

A ticket's completion criteria are met only when the evidence proving them is on disk. This section defines what that evidence is.

**One subdir per pass.** Each implement pass writes `evidence/implementation-N/` (N one more than the highest existing; the first stage allocates it and the later stages write to the same one), and merge writes `evidence/merge/`. Evidence lives in the ticket's own directory and travels with it through every queue move.

**Each pass is self-proving, and freshly captured.** The **latest** `implementation-N/` must hold **all** the evidence needed to prove the **entire** change, on its own, not just the delta that pass altered. A re-implementation (even a one-line or doc-only pass) re-captures the whole required set into its own subdir. Human review and the ticket card read only the latest pass, so a fact absent from it is treated as absent from the ticket: no fallback to an earlier `implementation-N/` is ever consulted, precisely so that the latest pass cannot silently rest on stale proof. Every artifact (screenshots especially, but all of it) must be **captured fresh from the code as it stands in that pass's commit**; it may **never** be copied, carried forward, or reused from an earlier `implementation-N/`, because evidence from a previous version of the code no longer proves the current code. Earlier passes stay on disk as history, but they never stand in for the latest pass's evidence.

**What counts as sufficient evidence:**

- **Check output.** The full, fresh output of every check the criteria name (compile, lint, unit, smoke, e2e, and any judgement check), with its exit code visible, one file per suite. Captured per the verification rule (run fresh, in the foreground, read in full).
- **UI screenshots.** Any change that affects the UI must be captured as a screenshot of **every** affected view in **both light and dark mode** when the app has a light/dark mode setting (every UI screenshot then exists in both modes). An app with no such setting is screenshotted once per view, in the mode it shows by default: that is not a missing screenshot, and no stage checks which mode a screenshot shows. **Screenshots are captured from the running app in its real shell** (top navbar, left sidebar, and surrounding chrome present), reaching the view the way a user would; a component rendered in isolation (a gallery, scratch render, or story) is **never** an acceptable screenshot when a page already renders the change in the running app. A single representative page is not enough: if the change is applied to several pages (e.g. pods, nodes, deployments, statefulsets, daemonsets), capture each one, in every mode the app has. This includes a **removal**: deleting or hiding a view, page, component, or nav entry is a UI change, and its affected state is the *resulting* UI (e.g. the navigation without the removed entry, the surviving pages still working), capture that after-state. "Nothing to screenshot because it was deleted" is never a valid reason to skip them; a UI-affecting change is never committed without screenshots. **A new or changed UI component is screenshot-required even before any page consumes it.** Adding or editing a reusable UI component (a React component, a widget, a cell/badge/card, anything that renders) is a UI change in its own right: if — and only if — no page renders it yet (its consumers land in later tickets), it must be **rendered in isolation** (a scratch render or story mounting it with sample props, covering each distinct state it carries, including any null/empty case) and screenshotted in every mode the app has; the moment a page does render it, its screenshots must come from the running app, not from continued isolation rendering. "No page consumes it yet", "it's not wired in", "nothing to render", or "the e2e ticket will screenshot it later" are **never** valid reasons to skip a component's screenshots, and they are the only grounds for capturing in isolation rather than in the running app; a UI component is never committed without them, exactly as an affected view is not. **Every screenshot lives in a `screenshots/` subdirectory** of the pass's evidence dir (e.g. `evidence/implementation-N/screenshots/`); never put a screenshot loose in the evidence dir. Capture them however works, but never by committing capture code to `project/`: the capture script lives in the ticket's `evidence/` or a temp dir and is discarded (see Agent cleanup). **Every screenshot the latest pass needs must be taken fresh from that pass's code**, in that pass's `screenshots/` dir. A re-implementation re-captures every required screenshot against its own commit; copying or carrying them forward from an earlier `implementation-N/` is never allowed, even when the change is a one-line or doc-only pass that "alters no pixel" (recapture is cheap and is the only thing that proves the current code still renders correctly). The latest pass never leans on an earlier pass's screenshots.
- **Acceptance check.** The dev stage writes `acceptance-check.md` to its evidence subdir. It lists every acceptance criterion in the ticket, word for word, and for each one whether the code meets it and the evidence files in this pass that prove it (check output, screenshots, transcripts).
- **Command transcripts.** For anything else a claim rests on (a build log, a bug reproduction), the captured command and its output.

Sufficient means enough that the developer can confirm every part of the criteria from the files alone, without re-running anything.

## In-progress stages

A ticket in `in-progress/` goes through the stages listed for its type in `docs/ticket-types/`, in order, each run by its own sub-agent in the ticket's worktree. The file is the one named after the ticket's `**Type:**`, or `work.md` (the default type, Work) when the type has none (see [docs/ticket-types/README.md](../../../docs/ticket-types/README.md)). No stage sends the ticket back: each fixes what it finds itself. The last stage moves the ticket out of `in-progress/`.

## Steps

1. Keep running turns until this loop condition holds: forward progress is exhausted (in-progress/, conflicts/ and merge-queue/ are empty, and every unblocked ticket in todo/ has moved downstream, so what remains is in human-review/ or done/, or waits on unmet dependencies). Stop early on an environment problem or a broken main (see **When something goes wrong**).

2. Each turn, work the queues in processing order (**`conflicts` → `merge-queue` → `todo` → `in-progress`**; see Processing order above). **Begin every step by re-running `bun ../scripts/next-tickets.ts`**, because an earlier step may have moved tickets into this step's queue (the todo step feeds `in-progress`). It is cheap and deterministic, so always act on a freshly generated report, never a stale one:

   1. **Run the report, then for each ID in its `conflicts` list,** spawn a sub-agent in parallel with these ticket completion criteria:

      > <id> has the current main merged into its branch in its existing worktree, with every conflict resolved, with every check the Test Plan names re-run fresh and passing, the evidence required by Verification and Evidence captured to evidence/implementation-N/ (N one more than the highest existing implementation-N), and the ticket moved from conflicts/ to merge-queue/.

      These are tickets the **developer already approved** that would not merge cleanly onto main, because main moved underneath them. Nothing is wrong with the work, so it does not go back to `todo/` and it never returns to `human-review/`: it needs main merged in and a re-verification, not a re-decision. `merge-queue/` is reachable only through the developer's approval at `pb:review`, so every ticket that can land here already carries it.

      The sub-agent works **in the ticket's existing worktree** (`project/worktrees/<id>`), which the failed merge left intact with its commits: it merges the current main into that branch (`git merge main`), resolves the conflicts and commits the merge. A merge only adds a commit, so the ticket's own commits stay as they were and no history is rewritten. This is the one place conflict resolution happens; the merge stage only merges branches that apply cleanly. It then re-runs every check fresh in the foreground and re-captures the **whole** evidence set into a new `evidence/implementation-N/` (the merge produces a new commit, so the pass is judged alone against it, per "Each pass is self-proving"). Resolving the conflict is the only change it may make: it does not re-open the ticket's design, add scope, or "improve" the work the developer approved.

      **The ticket stays in `conflicts/` for the whole rework**, and moves only on success, straight to `merge-queue/` (`bun ../scripts/move.ts <id> merge-queue` from `state/`).

      The sub-agent keeps working until the conflict is resolved and every check passes. A sub-agent that returns with the ticket still in `conflicts/` is spawned again (see **When something goes wrong**).

   2. **Run the report, then merge its whole `merge-queue` list as one train.** If `merge-queue` is non-empty, spawn a single merge sub-agent (not one per ticket). Give it these ticket completion criteria:

      > Every ticket the report listed in merge-queue/ is resolved: either merged into main and moved to done/ with the post-merge checks captured to its evidence/merge/, or moved to conflicts/ because it conflicts with main or breaks the checks on the train. No train worktree is left behind.

      The sub-agent merges the batch with one tool, `bun ../scripts/merge-ticket.ts` (run from `state/`), which stacks the tickets onto a single throwaway **train** worktree so the post-merge checks run **once** on the combined result instead of once per ticket. **Never run `git worktree`, the merge, or the `done/` move by hand**; the script resolves the paths, lands the merge, moves each ticket to `done/`, and cleans up. The flow:

      1. **Build the train.** `merge-ticket.ts build <id> [<id> ...]` with every merge-queue ID, in the report's order. It creates the train worktree and merges each ticket's branch onto it with a merge commit, printing a JSON result with the `trainId` and what was `included` / `noops`.
         - **Built** (exit 0): every ticket stacked cleanly. Go to the post-merge checks below.
         - **Conflict** (exit 2): the JSON names the offending ticket (`conflict.ticket`). A ticket that will not apply onto current main goes to **`conflicts/`**: write a History note naming the conflicting paths and the evidence, then `bun ../scripts/move.ts <id> conflicts` (from `state/`). Then `merge-ticket.ts discard <trainId>` and rebuild the train from the remaining IDs. Repeat until the train builds clean. (This replaces in-worktree conflict resolution: the merge stage only merges, and main is merged into the ticket in the `conflicts/` step, which re-verifies it and returns it here.)
      2. **Run the post-merge checks once, on the train.** In the train worktree, run every post-merge check (compile, lint, unit, smoke, e2e) fresh in the foreground per the Verification and Evidence rule, and read the full output. The train tip is exactly what becomes main (the land is a fast-forward), so this single run is the post-merge evidence for every ticket on the train.
         - **All pass:** write each landed ticket's `evidence/merge/` (the shared check output) and merge History note into its `merge-queue/<id>/` directory **before** landing, then land with `merge-ticket.ts land <trainId> <id> ...` (the train's IDs). The script fast-forwards main, moves each ticket from `merge-queue/` to `done/`, commits that transition (sweeping up the evidence and History written first), and tears down the train and the ticket worktrees. Writing evidence before the land keeps the write-before-move invariant: the move's commit captures it.
         - **A check fails:** bisect to find the breaking ticket. `discard` the train and rebuild smaller trains over the ID list (binary search: build one half, test it, narrow to the half that fails) until a single ticket is identified as the breaker. Write a History note naming the failing check and the evidence, move that ticket to `conflicts/`, where main is merged into it and its checks are fixed, then rebuild the train from the remaining IDs and test again. Repeat until the train is green, then land it as above.

      Once main has moved it cannot be un-merged, so a landed ticket is **done** even if a later check on main fails (the broken-main case below). The train worktree must be gone before the sub-agent returns (`discard` any it abandoned).

      If the sub-agent returns with tickets still in `merge-queue/`, it is spawned again. If a train landed but a later check on main then fails, that is a broken main (see **When something goes wrong**).

   3. **Run the report, then admit each ID in its `todo` list.** These are the actionable tickets (dependencies are already resolved, and each runs on this platform); take them as-is without opening their files. For each ID, run `bun ../scripts/setup-ticket.ts <id>` from `state/`. That one command does the whole admission: it moves the directory from `todo/` to `in-progress/` and creates the ticket's worktree against the project repo at `project/worktrees/<id>`, on a new branch `worktrees/<id>` at the project's current commit. It resolves all the paths itself, so **never run `git worktree` by hand**. It is idempotent: re-running for an already-admitted ticket is a safe no-op.

   4. **Run the report, then for each ID in its `in-progress` list** (the tickets just admitted from `todo/`, plus any left from an interrupted earlier run), read the ticket's `**Type:**` from its `index.md` and work it through the stages its file in `docs/ticket-types/` lists (see **In-progress stages**), with the tickets in parallel and each ticket's stages in order. For each stage spawn one sub-agent and tell it to follow, for `<id>`, `docs/ticket-types/README.md` and that stage's section of the type's file. Start the next stage only when the one before returns. The ticket's completion criteria are:

      > <id> has been through every stage its ticket type lists, in order, each stage's instructions are met, the evidence required by Verification and Evidence is in evidence/implementation-N/, and the last stage has moved the directory out of in-progress/.

      Each stage has no turn limit: it keeps working until its list is done. A stage that returns without finishing its list is spawned again, and an environment problem stops the run (see **When something goes wrong**).

3. After each turn, **clean up, then report.** This step runs every turn, including when the turn ended on a handback.

   1. **Check the queues.** Re-run `bun ../scripts/next-tickets.ts`. A ticket still in `in-progress/` or `conflicts/` whose sub-agent returned this turn is re-driven next turn from where it sits. A ticket stranded by an interruption stays where it sits until the developer resumes (see **When the run is interrupted**).
   2. **Reap leaked processes (Agent cleanup safety net).** A sub-agent that died or timed out cannot run its own teardown, so the parent sweeps up after it: kill any process whose working directory is under `project/worktrees/` (a leftover `bun`/vite/backend dev server or watcher), and tear down any kwok cluster, controller, or lock a check left behind. This guarantees no orphaned server survives to collide with the next run on a shared port or exhaust the host's inotify watches. Do not end the turn with a process still rooted in a worktree.
   3. **Report.** Print the run report in chat: the tickets that moved or were created this turn (the normal forward progress, every re-run stage, and any Fix ticket spawned from a proven Debug). Surface anything needing the developer (an environment problem, a broken main, tickets in `human-review/`) prominently, naming the ticket and the one-line reason; routine forward progress can be terser. If the turn ended on a handback, say so (the check and error, the tickets involved, the suspected cause, and the evidence path), since the chat report is the only record of why the run stopped. The report is transient and chat-only: the ticket-scoped commits from `move.ts`/`setup-ticket.ts` already captured every queue change, so there is no shared state file to write. The queues are the durable record and `/pb:status` regenerates the picture on demand.

   The parent then re-checks the loop condition from Step 1 against the fresh queues. When forward progress is exhausted, the loop stops and `pb:next` ends. Tickets in `human-review/` wait for `pb:review`.

To interrupt early, stop the run (the developer halts it); `pb:status` shows the live state from the queues.

## Example

```
Loop started.
merge-queue/: 2 approved tickets (search-1, search-2). One merge sub-agent:
  -> merge-ticket.ts build search-1 search-2 -> train built clean.
  -> post-merge checks run once on the train -> all pass.
  -> merge-ticket.ts land -> both fast-forwarded onto main, moved to done/, worktrees torn down.
todo/: 3 unblocked tickets (search-3, search-4, infra-5). Took all 3.
  -> moved to in-progress/, worktrees created.
  -> 3 tickets worked in parallel, each through dev -> test -> rules check -> commit.
search-4's test sub-agent timed out; the parent ran the test stage again.
search-3, search-4, infra-5 committed -> human-review/.
Forward progress exhausted. Loop stopped. search-3, search-4 and infra-5 await pb:review.
```

## Next

Recommend the developer run:
- `pb:review`: walk through tickets now in `human-review/`.
- `pb:next`: to resume, only if the run was interrupted (session or rate limit).
