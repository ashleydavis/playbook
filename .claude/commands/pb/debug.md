---
name: pb:debug
description: "Invoke when something is broken and the root cause is not yet known. Files a Debug ticket that proves the root cause (four-phase method, no fix, throwaway worktree); on review it spawns a Fix ticket, and both flow through the normal pipeline. If the developer already knows the fix, use pb:add instead. Keywords: debug, broken, bug, failing, root cause, investigate, why is this failing, crash, error, reproduce, diagnose, find the cause."
---

# pb:debug

The process is built around forward feature work; `pb:debug` is the path for "something is broken, find out why." The rule is **no fix without a proven root cause first.** Debugging and fixing are split into two separate tickets that each flow through the normal pipeline, so the investigation is reviewed on its own merits before any fix is written, and the fix is reviewed against a root cause that has already been proven.

`pb:debug` does not investigate inline. It creates a **Debug** ticket (`**Type:** Debug`) in `todo/` describing the symptom. The Debug ticket's job is to **find the root cause and then prove it.**

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to debug:

- Confirm the Debug ticket in a few lines: ID, the symptom, where it landed.
- Report any investigation outcome the same way.

## Steps

Create a Debug ticket in `todo/` with these acceptance criteria:
- The failure is reproduced consistently, with the reproduction captured to `evidence/`.
- The root cause is found and proven, not guessed: evidence shows the causal chain from root cause to symptom (a trace, a diff against working code, a minimal experiment that toggles the behaviour).
- A written root-cause analysis is recorded in the ticket's `detail.md`.

After writing the Debug ticket directory, commit it to the state repo: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`). Then update `current-state.md` to reflect it: add or amend only the entries this change affects, leaving the rest of its existing content intact, and commit it: `bun ../scripts/commit-state.ts "<summary>" current-state.md`.

A Debug ticket is a pure investigation. **Any amount of experimentation on the code is allowed:** add logging, hack in instrumentation, comment things out, try ten different changes. None of it is kept. A Debug ticket produces no commits and its worktree is thrown away when the investigation ends, so the experimentation cannot reach main and does not need to be clean. The only output that survives is the write-up in `detail.md` plus the evidence.

The ticket then flows through `pb:next` like any other, but the two pipeline stages behave differently.

### In-progress: the debugging session (four-phase method)

The agent experiments freely, writing no production code that needs to last:

1. **Root cause investigation.** Read the error in full. Reproduce the failure consistently and capture the reproduction to this pass's `evidence/implementation-N/` subdir. Review recent changes. Trace the data flow backward to where the problem originates.
2. **Pattern analysis.** Find similar working code in the same codebase. Compare working against broken, line by line. Identify every difference, however small, and the assumptions each side makes.
3. **Hypothesis and testing.** State a specific theory of the root cause. Test it with throwaway experiments (logging, probes, toggling the suspected cause), one variable at a time. Confirm it, or discard it and form a new one.
4. **Conclusion.** Write the proven root cause into `detail.md` with the supporting evidence, then discard the worktree's code changes. No fix is written here.

Because nothing is committed, the in-progress completion criteria drop the "changes committed, code lints clean" requirements. The only success condition is that the root-cause write-up is in `detail.md`, the proving evidence is in `evidence/implementation-N/`, and the ticket has moved to `agent-review/`.

**Escalation rule:** if three or more hypotheses fail to land, stop. That signals the design is wrong, not a single line. Surface it via `current-state.md` and raise it in `pb:plan` rather than continuing to probe.

### Agent-review: assessing the investigation

The review agent's job for a Debug ticket is to assess that the root cause has actually been proven, not merely asserted: the reproduction is present in evidence, the causal chain is supported, and the conclusion follows from it.

- **Proven:** the Debug ticket moves to `done/` (a debugging session produces no code, so it does not go to human-review or merge), and the review agent creates a new **Fix** ticket (`**Type:** Fix`) in `todo/`. The Fix ticket carries the proven root cause and the failing reproduction in its Description/Notes, and acceptance criteria for the fix (below). It links back to the Debug ticket's ID. This spawn happens inside a `pb:next` agent-review sub-agent, so the review agent commits the new Fix ticket ticket-scoped: `bun ../scripts/commit-state.ts "add <fix-id>" tickets/todo/<fix-id>` (from `state/`). It does not touch `current-state.md` (parent-only).
- **Not proven:** the review agent records in History what is missing or unconvincing, then runs `bun ../scripts/fail-ticket.ts <id>` (from `state/`) to increment the ticket's `**Failures:**` count and reads the new count it prints. Below three, it returns the Debug ticket to `todo/` so a fresh investigation session retries with that feedback (it does not give up on the first miss). At three, it moves the ticket to `blocked/` for the developer instead. The count is the deterministic gate, not a re-count of History.

### The Fix ticket

The Fix ticket then flows through the full pipeline normally (in-progress -> agent-review -> human-review -> merge-queue -> done). Its acceptance criteria:
- The bug no longer reproduces: the failing reproduction from the Debug ticket now passes, captured to evidence.
- The fix targets the proven root cause, not the symptom.
- The fix is minimal and simple: the smallest change that solves the problem, no extra scope.

For a Fix ticket, the agent-review stage additionally verifies that the fix actually solves the proven problem (the reproduction passes), that it is the minimal/simplest change that does so, and that the evidence of the fix working is present. If all hold, the Fix ticket moves to `human-review/`. Otherwise the review agent records what failed in History, runs `bun ../scripts/fail-ticket.ts <id>` (from `state/`) to increment the `**Failures:**` count, and reads it: below three it returns the ticket to `todo/` for another attempt with that feedback; at three it moves to `blocked/` for the developer.

`pb:debug` is for when the cause is unknown. If no debugging is required because the developer already knows the fix, they skip it entirely and use `pb:add` to queue the fix as an ordinary ticket (Type `Fix`, or whatever fits). The two-ticket Debug-then-Fix flow only applies when the root cause has to be found first.

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
