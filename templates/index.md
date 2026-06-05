# Templates Index

What each template is and when it is used. See [README.md](README.md) for orientation.

Three kinds live here: **repo scaffolds** copied wholesale into a new project by bootstrap, **item templates** whose shape is copied per item by `pb:plan`/`pb:add` (references, not part of any repo), and the **commit template**, a reference for the commit message format.

## Project repo scaffold (`project/`)

Copied wholesale into a new project by `pb:bootstrap:new`.

- [project/CLAUDE.md](project/CLAUDE.md): root project-specific instructions (Stack and How-to-run placeholders, comms style, pointer to `docs/rules/`). References nothing in the playbook.
- [project/docs/spec/README.md](project/docs/spec/README.md): spec conventions, ID rules, "adding a feature" steps.
- [project/docs/spec/CLAUDE.md](project/docs/spec/CLAUDE.md): spec rules for Claude.
- [project/docs/testing-manual/README.md](project/docs/testing-manual/README.md): testing-manual conventions.
- [project/docs/rules/](project/docs/rules/): the enforced rule set (`coding-style.md`, `testing.md`, `documentation.md`, `README.md`). Tuned with `pb:customize`.

## State repo scaffold (`state/`)

Copied wholesale into a new project by `pb:bootstrap:*`.

- [state/CLAUDE.md](state/CLAUDE.md): state repo root rules.
- [state/current-state.md](state/current-state.md): empty starting state.
- [state/work-items/CLAUDE.md](state/work-items/CLAUDE.md): queue and work-item rules.
- [state/work-items/README.md](state/work-items/README.md): work-items orientation.
- `state/work-items/{todo,in-progress,agent-review,human-review,merge-queue,done}/`: the six queue directories (empty, with `.gitkeep`).

## Item templates (references, not copied wholesale)

The shape of a single feature or work item. `pb:plan` and `pb:add` copy these when creating items in a project; the template files themselves stay in the playbook.

- [feature-template/](feature-template/): the shape of a feature's two files (`index.md`, `detail.md`). Copied by `pb:plan` into `docs/spec/<id>/`.
- [work-item-template/](work-item-template/): the shape of a work item's `index.md` + `detail.md`. Copied by `pb:add` into `state/work-items/todo/<id>/`.

## Commit template

- [commit-template.txt](commit-template.txt): git commit message format. A reference for how commits should be written.
