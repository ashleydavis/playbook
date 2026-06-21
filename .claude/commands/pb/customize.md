---
name: pb:customize
description: "Invoke to tune the project's enforced rule set (the files in docs/rules/) during bootstrap or any time afterwards. Interviews the developer across coding style, required documents, testing rules, and standing process rules, then writes the answers into the matching rule files. The agent-review stage reads the whole directory, so anything captured here is enforced on every future ticket. Keywords: customize, rules, coding style, conventions, testing rules, required docs, process rules, change how Claude works, enforce, docs/rules, tune the rule set."
---

# pb:customize

Interactively tune the project's enforced rule set: the files in `project/docs/rules/`. Run during bootstrap or any time afterwards to change how Claude is expected to work in this repo. The agent-review stage reads every file in `project/docs/rules/`, so anything captured here is enforced on every ticket from then on.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to customize:

- One area at a time: show the current setting, ask, then report the change as one line.

## Steps

1. Interview the developer across four areas, showing the current setting for each and asking what to change:
   - **Coding style.** Naming, formatting, file layout, language idioms, and the minimalism defaults. Written to `project/docs/rules/coding-style.md`.
   - **Required documents.** Which docs must exist and stay current beyond the always-required set (e.g. `project/docs/how-it-works.md`, `project/docs/architecture.md`, a user guide), and what each is for. Written to `project/docs/rules/documentation.md`.
   - **Testing rules.** What kinds of tests are required and when (unit always, smoke for endpoints, e2e for UI flows, coverage expectations). Written to `project/docs/rules/testing.md`.
   - **Process rules.** Standing rules every ticket must follow (always write unit tests, always update the spec and testing manual, never leave a failing test, and so on). Written to whichever rule file fits, or a new file under `project/docs/rules/` for a rule category that does not have one yet (e.g. `project/docs/rules/security.md`). No skill edit is needed: the review agent already reads the whole directory.
2. Write the answers into the matching files (creating new ones under `project/docs/rules/` where needed), preserving anything the developer did not change.
3. Show the diff and confirm it with the developer before finishing.

Because the agent-review stage reads the whole of `project/docs/rules/`, re-running `pb:customize` changes what the review agent enforces, including any rule files it adds. The new rules apply to any ticket that reaches `agent-review/` after the change; tickets already merged are not re-checked.

## Example

```
Coding style (current: minimalism defaults only):
  Developer: add "no default exports; named exports only".
  -> appended to docs/rules/coding-style.md.

Testing rules (current: unit always):
  Developer: require a smoke test for every new HTTP endpoint.
  -> appended to docs/rules/testing.md.

Process rules:
  Developer: every PR must update docs/roadmap.md if it closes a roadmap item.
  -> new rule added to docs/rules/documentation.md.

(diff shown, developer confirms)
```
