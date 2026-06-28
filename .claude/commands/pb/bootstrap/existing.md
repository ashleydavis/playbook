---
name: pb:bootstrap:existing
description: "Invoke once to bring an existing codebase under this process. Interviews the developer, clones the project into project/ and creates the state repo from templates/state/ at state/, analyses the project repo for missing process artifacts, and queues a ticket per gap in todo/. Use when there is already code. Keywords: bootstrap, existing project, adopt, onboard, brownfield, retrofit, set up process on existing code, analyse gaps, create state repo."
---

# pb:bootstrap:existing

Bootstrap an existing project: clone the project into `project/`, create the state repo at `state/`, and queue tickets to fill whatever process artifacts the repo is missing. 

Both repos are nested under the playbook repo, where Claude Code is launched. For a brand-new project with no code, use `pb:bootstrap:new` instead.

## Output style

Follow the project's [output format](../../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to bootstrap:

- Interview one question at a time.
- Report results as a short list: repos created, gaps found, tickets queued, next step.

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
4. Analyse the project repo to identify what is missing or incomplete:
   - `CLAUDE.md` at the root (use the shared template as a starting point)
   - `project/docs/spec/` source of truth
   - `project/docs/testing-manual/`
   - `project/docs/rules/` (`coding-style.md`, `testing.md`, `documentation.md`) (run `pb:customize` to fill these from the interview)
   - `project/docs/roadmap.md`
   - `smoke/` and `e2e/` setup
   - Unit test framework wired up
5. Run the project's full test suite (unit, smoke, e2e: whatever exists) and confirm it passes. A project under this process should always be passing its tests, including the moment it is first imported. If any tests fail, do not start feature work on top of a broken baseline: queue a high-priority ticket to get the suite green and make it a dependency of the other bootstrap tickets, and note the failure in chat (the ticket is the durable record).
6. For each gap, create a ticket in `state/tickets/todo/` with acceptance criteria and a test plan. These tickets are dependencies for most future feature work. Explicitly set the `**Depends on:**` field on each ticket to capture the dependencies between these gap tickets so they implement in the right order (e.g. the spec before the testing manual, the testing manual before the smoke/e2e setup).
7. Begin the development loop, typically starting with `pb:next` to address the bootstrap tickets.

## Example

```
Project: an Express API. Stack: Node + TypeScript. Tests: Jest (unit only, no smoke/e2e).
In flight: a rate-limiter branch, half done.

Cloned the project into project/; created state/ (from templates/state/).
Ran the Jest suite: 84 passing, baseline is green.
Project repo analysis found gaps:
  - no project/docs/spec/        -> todo/bootstrap-1 (write the spec from current behaviour)
  - no project/docs/rules/       -> todo/bootstrap-2 (run pb:customize to seed rules)
  - no smoke/ or e2e/    -> todo/bootstrap-3 (add smoke scripts), todo/bootstrap-4 (Playwright setup)
Bootstrap tickets queued (the rate-limiter work in flight stays in the project repo).
Next: pb:next to start clearing the bootstrap tickets.
```

## Next

Recommend the developer run:
- `pb:status`: confirm the empty state.
- `plan:create` then `pb:plan:break` (or `pb:add` / `pb:docs`): to put the first work into `todo/`.
