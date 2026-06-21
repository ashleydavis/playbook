---
name: pb:bootstrap:new
description: "Invoke once to set up a brand-new greenfield project under this process. Interviews the developer, creates the project repo from templates/project/ and the state repo from templates/state/, writes the initial spec, testing manual, and docs/rules/ rule set, and populates current-state.md with empty queues. Use when there is no existing code yet. Keywords: bootstrap, new project, greenfield, set up, scaffold, start a project, initialise, from scratch, create repos."
---

# pb:bootstrap:new

Bootstrap a greenfield project: create both project/ and state/ repos under the playbook repo, where Claude Code is launched, from the playbook templates and seed the docs from an interview. For an existing codebase, use `pb:bootstrap:existing` instead.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to bootstrap:

- Interview one question at a time.
- Report results as a short list: repos created, docs written, next step.

## Steps

TODO: FACTOR OUT THE INTERVIEW PROCESS TO A SEPERATE FILE AND LINK IT INTO EXISTING AND NEW SKILLS

1. Interview the developer, asking one question at a time:
   - What does the project do?
   - What is the tech stack?
   - What is the coding style?
   - How does testing work?
   - What other rules should the project conform to?
   - How is it deployed and how do I run it locally?

TODO: WHY THERE TWO STEPS HERE AND ONE STEP IN THE EXISTING SKILL?

2. Create the project repo at `project/` under the playbook repo by copying [templates/project/](../../../../templates/project/) and filling the placeholders from the interview answers (CLAUDE.md, src/, scripts/, smoke/, e2e/, docs/).
3. Create the state repo at `state/` under the playbook repo by copying [templates/state/](../../../../templates/state/) (tickets/ queues, current-state.md, and the scoped CLAUDE.md files). Then **initialise it as a git repo** (`git init` in `state/`) and make an initial commit of the scaffolded contents (`scaffold state repo`). This makes the state repo's history an audit log; all subsequent state changes are committed automatically by the helper scripts or via `commit-state.ts` (see the **Queues** audit-log paragraph in `docs/process.md`).

TODO: DOES THIS LINE UP WITH WHAT'S REQUESTED IN EXISTING SKILL:  

4. Write the initial spec, testing manual, and the rule set in `project/docs/rules/` (`coding-style.md`, `testing.md`, `documentation.md`) based on the interview. The rules can be refined at any point with `pb:customize`.
5. Populate `state/current-state.md` (empty queues, no work in flight), then commit it: `bun ../scripts/commit-state.ts "initialise current-state" current-state.md` (from `state/`).
6. Begin the development loop (typically `pb:status` to confirm the empty state, then `pb:plan`).

## Example

```
Building: a markdown note-taking CLI. Stack: TypeScript + Bun. Tests: Bun test + smoke scripts.
Run: `bun run notes`.

Created project/ (from templates/project/, placeholders filled)
Created state/ (from templates/state/, queues empty)
Wrote project/docs/spec/index.md, project/docs/testing-manual/index.md, project/docs/rules/{coding-style,testing,documentation}.md.
state/current-state.md initialised: all queues empty.
Next: pb:plan to design the first feature.
```
