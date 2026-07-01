---
name: pb:bootstrap:new
description: "Invoke once to set up a brand-new greenfield project under this process. Interviews the developer, creates the project repo from templates/project/ and the state repo from templates/state/, and fills in the starter rule set from the interview. Use when there is no existing code yet. Keywords: bootstrap, new project, greenfield, set up, scaffold, start a project, initialise, from scratch, create repos."
---

# pb:bootstrap:new

Bootstrap a greenfield project: create both project/ and state/ repos under the playbook repo, where Claude Code is launched, from the playbook templates and seed the starter rules from an interview. For an existing codebase, use `pb:bootstrap:existing` instead.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to bootstrap:

- Interview one question at a time.
- Report results as a short list: repos created, rules seeded, next step.

## Steps

1. Interview the developer, asking one question at a time:
   - What does the project do?
   - What is the tech stack?
   - What is the coding style?
   - How does testing work?
   - What other rules should the project conform to?
   - How is it deployed and how do I run it locally?

2. Create the project repo at `project/` under the playbook repo by copying [templates/project/](../../../../templates/project/) and filling the placeholders from the interview answers (CLAUDE.md, src/, scripts/, smoke/, e2e/, docs/).
3. Create the state repo at `state/` under the playbook repo by copying [templates/state/](../../../../templates/state/) (tickets/ queues and the scoped CLAUDE.md files). Then **initialise it as a git repo** (`git init` in `state/`) and make an initial commit of the scaffolded contents (`scaffold state repo`). This makes the state repo's history an audit log; all subsequent state changes are committed automatically by the helper scripts or via `commit-state.ts` (see the **Queues** audit-log paragraph in `docs/process.md`).

4. The project repo comes with the template's `docs/` scaffold from step 2 (a spec, testing manual, how-it-works, and the starter rule set, whatever `templates/project/` ships). Fill in the starter rules in `project/docs/rules/` (`coding-style.md`, `testing.md`, `documentation.md`) from the interview answers; refine anytime with `pb:customize`. Leave the doc stubs for the developer to grow through the normal `pb:docs` / planning flow as the project takes shape. Bootstrap does not author a full spec or testing manual upfront, and does not ask which docs to adopt.
5. Begin the development loop (typically `pb:status` to confirm the empty state, then plan the first feature with `plan:create` and `pb:plan:break`).

## Example

```
Building: a markdown note-taking CLI. Stack: TypeScript + Bun. Tests: Bun test + smoke scripts.
Run: `bun run notes`.

Created project/ (from templates/project/, placeholders filled; incl. its docs/ scaffold: docs/spec/, docs/testing-manual/, docs/how-it-works.md, left as stubs)
Created state/ (from templates/state/, queues empty)
Filled in project/docs/rules/{coding-style,testing,documentation}.md from the interview.
Next: plan the first feature with plan:create, then pb:plan:break to queue tickets.
```

## Next

Recommend the developer run:
- `pb:status`: confirm the empty state.
- `plan:create` then `pb:plan:break` (or `pb:add` / `pb:docs`): to put the first work into `todo/`.
