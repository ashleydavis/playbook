---
name: pb:customize
description: Invoke to tune the project's enforced rule set (the files in docs/rules/) during bootstrap or any time afterwards. Interviews the developer across coding style, required documents, testing rules, and standing process rules, then writes the answers into the matching rule files. The agent-review goal reads the whole directory, so anything captured here is enforced on every future work item. Keywords: customize, rules, coding style, conventions, testing rules, required docs, process rules, change how Claude works, enforce, docs/rules, tune the rule set.
---

# pb:customize

Interactively tune the project's enforced rule set: the files in `docs/rules/`. Run during bootstrap or any time afterwards to change how Claude is expected to work in this repo. The agent-review goal reads every file in `docs/rules/`, so anything captured here is enforced on every work item from then on.

## Steps

1. Interview the developer across four areas, showing the current setting for each and asking what to change:
   - **Coding style.** Naming, formatting, file layout, language idioms, and the minimalism defaults. Written to `docs/rules/coding-style.md`.
   - **Required documents.** Which docs must exist and stay current beyond the always-required set (e.g. `docs/how-it-works.md`, `docs/architecture.md`, a user guide), and what each is for. Written to `docs/rules/documentation.md`.
   - **Testing rules.** What kinds of tests are required and when (unit always, smoke for endpoints, e2e for UI flows, coverage expectations). Written to `docs/rules/testing.md`.
   - **Process rules.** Standing rules every work item must follow (always write unit tests, always update the spec and testing manual, never leave a failing test, and so on). Written to whichever rule file fits, or a new file under `docs/rules/` for a rule category that does not have one yet (e.g. `docs/rules/security.md`). No goal edit is needed: the review agent already reads the whole directory.
2. Write the answers into the matching files (creating new ones under `docs/rules/` where needed), preserving anything the developer did not change.
3. Show the diff and confirm it with the developer before finishing.

Because the agent-review goal reads the whole of `docs/rules/`, re-running `pb:customize` changes what the review agent enforces, including any rule files it adds. The new rules apply to any item that reaches `agent-review/` after the change; items already merged are not re-checked.

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
