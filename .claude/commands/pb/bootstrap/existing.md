---
name: pb:bootstrap:existing
description: "Invoke once to bring an existing codebase under this process. Interviews the developer, clones the project into project/ and creates the state repo from templates/state/ at state/, and confirms a green test baseline. Assumes the project's documentation is already complete. Use when there is already code. Keywords: bootstrap, existing project, adopt, onboard, brownfield, retrofit, set up process on existing code, create state repo."
---

# pb:bootstrap:existing

Bootstrap an existing project: clone the project into `project/`, create the state repo at `state/`, and confirm the test baseline is green. **Assume the project's documentation is already complete**: do not analyse for or report missing docs, and never ask the developer to add anything. If the project later wants a rule set or more docs, that is the normal `pb:customize` / `pb:docs` flow, not part of bootstrap.

Both repos are nested under the playbook repo, where Claude Code is launched. For a brand-new project with no code, use `pb:bootstrap:new` instead.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to bootstrap:

- Interview one question at a time.
- Report results as a short list: repos created, test baseline, next step.

## Steps

1. Clone the existing project repo into `project/` under the playbook repo. If you don't know where the project is, ask the developer to identify it (Git URL or local path).
2. Learn about the project from the cloned repo. Inspect the code, README, and docs to work out as much as you can:
   - What the project does
   - The tech stack
   - The coding style
   - How testing works
   - What other rules the project should conform to
   - How it is built, run locally, and deployed
   - What is currently in flight or planned

   Then ask the developer only about what you could not determine from the repo, one question at a time.
3. Create the state repo at `state/` by copying [templates/state/](../../../../templates/state/) (tickets/ queues, scoped CLAUDE.md files). Then **initialise it as a git repo** (`git init` in `state/`) and make an initial commit of the scaffolded contents (`scaffold state repo`). This makes the state repo's history an audit log; all subsequent state changes are committed automatically by the helper scripts or via `commit-state.ts` (see the **Queues** audit-log paragraph in `docs/process.md`).
4. Run the project's full test suite (unit, smoke, e2e: whatever exists) and confirm it passes. A project under this process should always be passing its tests, including the moment it is first imported. If any tests fail, do not start feature work on top of a broken baseline: queue a high-priority ticket to get the suite green (this is the only ticket bootstrap creates, and only when needed), and note the failure in chat (the ticket is the durable record).
5. Begin the development loop (typically `pb:next` if a green-baseline ticket was queued, otherwise `pb:status`, then plan the first work with `plan:create` / `pb:add` / `pb:docs`).

## Example

```
Project: an Express API. Stack: Node + TypeScript. Tests: Jest (unit only, no smoke/e2e).
In flight: a rate-limiter branch, half done.

Cloned the project into project/; created state/ (from templates/state/).
Ran the Jest suite: 84 passing, baseline is green (documentation assumed complete; nothing analysed or queued).
Next: plan the first work with plan:create / pb:plan:break (or pb:add / pb:docs).
```

## Next

Recommend the developer run:
- `pb:status`: confirm the empty state.
- `plan:create` then `pb:plan:break` (or `pb:add` / `pb:docs`): to put the first work into `todo/`.
