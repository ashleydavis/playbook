---
name: pb:bootstrap:existing
description: Invoke once to bring an existing codebase under this process. Interviews the developer, clones the project into project/ and creates the state repo from templates/state/ at state/, analyses the project repo for missing process artifacts, queues a work item per gap in todo/, and populates current-state.md. Use when there is already code. Keywords: bootstrap, existing project, adopt, onboard, brownfield, retrofit, set up process on existing code, analyse gaps, create state repo.
---

STATUS: REVIEWED

# pb:bootstrap:existing

Bootstrap an existing project: clone the project into `project/`, create the state repo at `state/`, and queue work items to fill whatever process artifacts the repo is missing. 

Both repos are nested under the playbook repo, where Claude Code is launched. For a brand-new project with no code, use `pb:bootstrap:new` instead.

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
3. Create the state repo at `state/` by copying [templates/state/](../../../../templates/state/) (work-items/ queues, current-state.md, scoped CLAUDE.md files).
4. Analyse the project repo to identify what is missing or incomplete:
   - `CLAUDE.md` at the root (use the shared template as a starting point)
   - `docs/spec/` source of truth
   - `docs/testing-manual/`
   - `docs/rules/` (`coding-style.md`, `testing.md`, `documentation.md`) (run `pb:customize` to fill these from the interview)
   - `docs/roadmap.md`
   - `smoke/` and `e2e/` setup
   - Unit test framework wired up
5. For each gap, create a work item in `todo/` with acceptance criteria and a test plan. These items are dependencies for most future feature work.
6. Populate `current-state.md` to reflect where things stand (existing in-flight work, recent commits, known issues).
7. Begin the development loop, typically starting with `pb:next` to address the bootstrap work items.

## Example

```
Project: an Express API. Stack: Node + TypeScript. Tests: Jest (unit only, no smoke/e2e).
In flight: a rate-limiter branch, half done.

Cloned the project into project/; created state/ (from templates/state/).
Project repo analysis found gaps:
  - no docs/spec/        -> todo/bootstrap-1 (write the spec from current behaviour)
  - no docs/rules/       -> todo/bootstrap-2 (run pb:customize to seed rules)
  - no smoke/ or e2e/    -> todo/bootstrap-3 (add smoke scripts), todo/bootstrap-4 (Playwright setup)
current-state.md: rate-limiter noted as in flight; bootstrap items queued.
Next: pb:next to start clearing the bootstrap items.
```
