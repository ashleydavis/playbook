---
name: pb:debug
description: "Invoke when something is broken and the root cause is not yet known. Files a Debug ticket that proves the root cause (investigate and prove root cause stages, no fix, throwaway worktree); once proven it spawns a Fix ticket, and both flow through the normal pipeline. If the developer already knows the fix, use pb:add instead. Keywords: debug, broken, bug, failing, root cause, investigate, why is this failing, crash, error, reproduce, diagnose, find the cause."
---

# pb:debug

The process is built around forward feature work; `pb:debug` is the path for "something is broken, find out why." The rule is **no fix without a proven root cause first.** Debugging and fixing are split into two separate tickets that each flow through the normal pipeline, so the root cause is proven on its own before any fix is written, and the fix is reviewed against a root cause that has already been proven.

`pb:debug` does not investigate inline. It creates a **Debug** ticket (`**Type:** Debug`) in `todo/` describing the symptom. Debug tickets always land in `todo/` (immediate attention); the skill does not ask `todo` vs `backlog`. The Debug ticket's job is to **find the root cause and then prove it.**

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to debug:

- Confirm the Debug ticket in a few lines: ID, the symptom, where it landed.
- Report any investigation outcome the same way.

## Steps

Create a Debug ticket in `todo/` with these acceptance criteria:
- The failure is reproduced consistently, with the reproduction captured to `evidence/`.
- The root cause is found and proven, not guessed: evidence shows the causal chain from root cause to symptom (a trace, a diff against working code, a minimal experiment that toggles the behaviour).
- A written root-cause analysis is recorded in the ticket's `detail.md`.

**Allocate the ID with the tooling, never by hand.** Derive the feature prefix (its spec dir, or `misc`/`infra`) and run `bun ../scripts/next-id.ts <prefix> --debug` (from `state/`) for the next free `{prefix}-d{n}`. It scans **every** queue including `done/`, so the ID never collides with a retired ticket.

Ask the developer which platforms the bug occurs on (`linux`, `darwin`, `win32`, comma-separated; default `any`), and write a `**Platforms:**` line in the Debug ticket's `index.md` unless the answer is `any`.

After writing the Debug ticket directory, commit it to the state repo: `bun ../scripts/commit-state.ts "add <id>" tickets/todo/<id>` (from `state/`).

A Debug ticket is a pure investigation. **Any amount of experimentation on the code is allowed:** add logging, hack in instrumentation, comment things out, try ten different changes. None of it is kept. A Debug ticket produces no commits and its worktree is thrown away when the investigation ends, so the experimentation cannot reach main and does not need to be clean. The only output that survives is the write-up in `detail.md` plus the evidence.

The ticket then flows through `pb:next` like any other, with its own stages: **investigate** then **prove root cause**. Each stage's instructions are in [docs/ticket-types/debug.md](../../../docs/ticket-types/debug.md). The prove root cause stage concludes the Debug ticket to `done/` and creates the Fix ticket below.

### The Fix ticket

The Fix ticket copies the Debug ticket's `**Platforms:**` line, if it has one, into its own `index.md`. The Fix ticket then flows through the full pipeline normally (in-progress -> human-review -> merge-queue -> done). Its acceptance criteria:
- The bug no longer reproduces: the failing reproduction from the Debug ticket now passes, captured to evidence.
- The fix targets the proven root cause, not the symptom.
- The fix is minimal and simple: the smallest change that solves the problem, no extra scope.

A Fix ticket runs the Work stages in [docs/ticket-types/work.md](../../../docs/ticket-types/work.md), meeting the acceptance criteria above.

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

(investigate)
Reproduced with two queries 50ms apart -> evidence/repro.txt.
Theory confirmed: responses are not sequenced, so the slower first
response overwrites the newer one. evidence/trace.txt shows the out-of-order resolve.

(prove root cause) Root cause proven -> search-d1 moved to done/.
Created todo/search-1 (Type: Fix): ignore responses for superseded queries; links search-d1.
```

## Next

Recommend the developer run:
- `pb:next`: to drive the Debug ticket (and later the Fix ticket it spawns).
- `pb:review`: once the Fix ticket reaches `human-review/`.
