---
name: pb:debug
description: Invoke when something is broken and the root cause is not yet known. Files a Debug work item that proves the root cause (four-phase method, no fix, throwaway worktree); on review it spawns a Fix item, and both flow through the normal pipeline. If the developer already knows the fix, use pb:add instead. Keywords: debug, broken, bug, failing, root cause, investigate, why is this failing, crash, error, reproduce, diagnose, find the cause.
---

# pb:debug

The process is built around forward feature work; `pb:debug` is the path for "something is broken, find out why." The rule is **no fix without a proven root cause first.** Debugging and fixing are split into two separate work items that each flow through the normal pipeline, so the investigation is reviewed on its own merits before any fix is written, and the fix is reviewed against a root cause that has already been proven.

`pb:debug` does not investigate inline. It creates a **Debug** work item (`**Type:** Debug`) in `todo/` describing the symptom. The Debug item's job is to **find the root cause and then prove it.**

## Steps

Create a Debug work item in `todo/` with these acceptance criteria:
- The failure is reproduced consistently, with the reproduction captured to `evidence/`.
- The root cause is found and proven, not guessed: evidence shows the causal chain from root cause to symptom (a trace, a diff against working code, a minimal experiment that toggles the behaviour).
- A written root-cause analysis is recorded in the item's `detail.md`.

A Debug item is a pure investigation. **Any amount of experimentation on the code is allowed:** add logging, hack in instrumentation, comment things out, try ten different changes. None of it is kept. A Debug item produces no commits and its worktree is thrown away when the investigation ends, so the experimentation cannot reach main and does not need to be clean. The only output that survives is the write-up in `detail.md` plus the evidence.

The item then flows through `pb:next` like any other, but the two pipeline stages behave differently.

### In-progress: the debugging session (four-phase method)

The agent experiments freely, writing no production code that needs to last:

1. **Root cause investigation.** Read the error in full. Reproduce the failure consistently and capture the reproduction to `evidence/`. Review recent changes. Trace the data flow backward to where the problem originates.
2. **Pattern analysis.** Find similar working code in the same codebase. Compare working against broken, line by line. Identify every difference, however small, and the assumptions each side makes.
3. **Hypothesis and testing.** State a specific theory of the root cause. Test it with throwaway experiments (logging, probes, toggling the suspected cause), one variable at a time. Confirm it, or discard it and form a new one.
4. **Conclusion.** Write the proven root cause into `detail.md` with the supporting evidence, then discard the worktree's code changes. No fix is written here.

Because nothing is committed, the in-progress goal drops the "changes committed, code lints clean" conditions. Its success condition is only that the root-cause write-up is in `detail.md`, the proving evidence is in `evidence/`, and the item has moved to `agent-review/`.

**Escalation rule:** if three or more hypotheses fail to land, stop. That signals the design is wrong, not a single line. Surface it via `current-state.md` and raise it in `pb:plan` rather than continuing to probe.

### Agent-review: assessing the investigation

The review agent's job for a Debug item is to assess that the root cause has actually been proven, not merely asserted: the reproduction is present in evidence, the causal chain is supported, and the conclusion follows from it.

- **Proven:** the Debug item moves to `done/` (a debugging session produces no code, so it does not go to human-review or merge), and the review agent creates a new **Fix** work item (`**Type:** Fix`) in `todo/`. The Fix item carries the proven root cause and the failing reproduction in its Description/Notes, and acceptance criteria for the fix (below). It links back to the Debug item's ID.
- **Not proven:** the Debug item goes back to `todo/` with notes in History saying what is missing or unconvincing.

### The Fix item

The Fix item then flows through the full pipeline normally (in-progress -> agent-review -> human-review -> merge-queue -> done). Its acceptance criteria:
- The bug no longer reproduces: the failing reproduction from the Debug item now passes, captured to evidence.
- The fix targets the proven root cause, not the symptom.
- The fix is minimal and simple: the smallest change that solves the problem, no extra scope.

For a Fix item, the agent-review goal additionally verifies that the fix actually solves the proven problem (the reproduction passes), that it is the minimal/simplest change that does so, and that the evidence of the fix working is present. If all hold, the Fix item moves to `human-review/`. Otherwise it goes back to `todo/` with notes.

`pb:debug` is for when the cause is unknown. If no debugging is required because the developer already knows the fix, they skip it entirely and use `pb:add` to queue the fix as an ordinary work item (Type `Fix`, or whatever fits). The two-item Debug-then-Fix flow only applies when the root cause has to be found first.

## Example

```
Developer: Search returns stale results after a fast second keystroke.

Created todo/search-d1/index.md (brief surface):
  **ID:** search-d1
  **Type:** Debug
  **Description:** Stale results render when a second query resolves before the first.
  **Depends on:** none

Created todo/search-d1/detail.md (full body):
  **Description:** Stale results render when a second query resolves before the first.
  **Acceptance Criteria:** reproduce consistently (captured), prove the causal chain, write up root cause.
  (the root-cause write-up is added here during the in-progress investigation)

(through pb:next, in-progress)
Reproduced with two queries 50ms apart -> evidence/repro.txt.
Phase 3 hypothesis confirmed: responses are not sequenced, so the slower first
response overwrites the newer one. evidence/trace.txt shows the out-of-order resolve.

(agent-review) Root cause proven -> search-d1 moved to done/.
Created todo/search-d2 (Type: Fix): ignore responses for superseded queries; links search-d1.
```
