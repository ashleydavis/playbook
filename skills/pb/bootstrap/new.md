---
name: pb:bootstrap:new
description: Invoke once to set up a brand-new greenfield project under this process. Interviews the developer, creates the project repo from templates/project/ and the state repo from templates/state/, writes the initial spec, testing manual, and docs/rules/ rule set, and populates current-state.md with empty queues. Use when there is no existing code yet. Keywords: bootstrap, new project, greenfield, set up, scaffold, start a project, initialise, from scratch, create repos.
---

# pb:bootstrap:new

Bootstrap a greenfield project: create both per-project repos from the playbook templates and seed the docs from an interview. Assumes the playbook is already cloned and its skills wired into Claude Code (a one-time per-machine setup). For an existing codebase, use `pb:bootstrap:existing` instead.

## Steps

1. Interview the developer:
   - What are you building?
   - What is the tech stack?
   - What is the coding style?
   - How does testing work?
   - How is it deployed and run locally?
2. Create the project repo by copying [playbook/templates/project/](../../templates/project/) and filling the placeholders from the interview answers (CLAUDE.md, src/, scripts/, smoke/, e2e/, docs/).
3. Create the state repo by copying [playbook/templates/state/](../../templates/state/) (work-items/ queues, current-state.md, and the scoped CLAUDE.md files).
4. Write the initial spec, testing manual, and the rule set in `docs/rules/` (`coding-style.md`, `testing.md`, `documentation.md`) based on the interview. The rules can be refined at any point with `pb:customize`.
5. Populate `current-state.md` (empty queues, no work in flight).
6. Begin the development loop (typically `pb:status` to confirm the empty state, then `pb:plan`).

## Example

```
Building: a markdown note-taking CLI. Stack: TypeScript + Bun. Tests: Bun test + smoke scripts.
Run: `bun run notes`.

Created ~/projects/notes/project/ (from templates/project/, placeholders filled)
Created ~/projects/notes/state/ (from templates/state/, queues empty)
Wrote docs/spec/index.md, docs/testing-manual/index.md, docs/rules/{coding-style,testing,documentation}.md.
current-state.md initialised: all queues empty.
Next: pb:plan to design the first feature.
```
