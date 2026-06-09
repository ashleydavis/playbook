# Templates Index

What each template is and when it is used. See [README.md](README.md) for orientation.

Three kinds live here: **repo scaffolds** copied wholesale into a new project by bootstrap, **ticket templates** whose shape is copied per ticket by `pb:plan`/`pb:add` (references, not part of any repo), and the **commit template**, a reference for the commit message format.

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
- [state/tickets/CLAUDE.md](state/tickets/CLAUDE.md): queue and ticket rules.
- [state/tickets/README.md](state/tickets/README.md): tickets orientation.
- `state/tickets/{todo,in-progress,agent-review,human-review,merge-queue,done}/`: the six pipeline queue directories (empty, with `.gitkeep`).
- `state/tickets/blocked/`: a side pen for tickets that hit a problem and need human attention (empty, with `.gitkeep`).
- `state/tickets/aborted/`: a side pen for tickets the developer kills during `pb:review` (abandoned, terminal; empty, with `.gitkeep`).

## Ticket templates (references, not copied wholesale)

The shape of a single feature or ticket. `pb:plan` and `pb:add` copy these when creating tickets in a project; the template files themselves stay in the playbook.

- [feature-template/](feature-template/): the shape of a feature's two files (`index.md`, `detail.md`). Copied by `pb:plan` into `docs/spec/<id>/`.
- [ticket-template/](ticket-template/): the shape of a ticket's `index.md` + `detail.md`. Copied by `pb:add` into `state/tickets/todo/<id>/`.

## Commit template

- [commit-template.txt](commit-template.txt): git commit message format. A reference for how commits should be written.
