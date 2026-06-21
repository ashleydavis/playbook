# Playbook Index

A compact orientation map: what lives where across the playbook and a project's project/state repos. Read when looking something up; read the handbook for full detail.

## In this playbook
- [README.md](README.md): short orientation for anyone landing in the repo.
- [handbook.md](handbook.md): full process description (human reference).
- [docs/process.md](docs/process.md): concise version Claude reads at session start.
- [docs/output-format.md](docs/output-format.md): how skills present output to the developer.
- [docs/ticket-selection.md](docs/ticket-selection.md): shared ticket selection menu format.
- [docs/plans/](docs/plans/): implementation plans.
- [CLAUDE.md](CLAUDE.md): standing instructions, loaded when Claude Code launches from the playbook repo root.
- [glossary.md](glossary.md): standard terminology.
- [.claude/commands/pb/](.claude/commands/pb/): help, status, board, plan, docs, add, promote, rank, next, review, debug, customize, reset.
- [.claude/commands/pb/bootstrap/](.claude/commands/pb/bootstrap/): new, existing. Run once per project (`pb:bootstrap:*`).
- [.claude/settings.json](.claude/settings.json): Claude Code settings for the playbook repo (permission prompts off).
- [templates/](templates/): all templates, with its own [README.md](templates/README.md) and [index.md](templates/index.md). `project/` and `state/` are scaffolded into new projects by `pb:bootstrap:*`; `feature-template/` and `ticket-template/` are copied per ticket by `pb:plan`/`pb:add`; `commit-template/` is registered in place via `git config commit.template`.
- [scripts/move.ts](scripts/move.ts): moves a ticket between queues.
- [scripts/format-ticket-selection.ts](scripts/format-ticket-selection.ts): formats ticket selection menus for skills.
- [scripts/reset-loop.ts](scripts/reset-loop.ts): unwinds a run (in-progress -> todo, tears down worktrees). Used by `pb:reset`.
- [scripts/install-prereqs.sh](scripts/install-prereqs.sh): installs git, bun, and Claude Code.

## In a project repo (project-specific)

Paths below are under `project/` when working from the playbook root (e.g. `project/docs/spec/`).

- `CLAUDE.md` at the root: project-specific instructions (stack, how to run, comms style). Always present. Knows nothing about the playbook; the rules enforced by agents live in `docs/rules/`, not in `CLAUDE.md`.
- `docs/spec/`: source of truth. `docs/spec/index.md` is the feature index; each `<feature>/index.md` declares an ID; `<feature>/detail.md` is the full spec.
- `docs/testing-manual/`: mirrors `docs/spec/`. `detail.md` for full steps.
- `docs/rules/`: the enforced rule set (coding-style, testing, documentation, and any others). The review agent reads it in full. Tuned with `pb:customize`.
- `docs/roadmap.md`: forward-looking ideas.
- Code, tests, derived docs: project-specific layout. See the project repo's CLAUDE.md.

## In a state repo (project-specific)

Paths below are under `state/` when working from the playbook root (e.g. `state/tickets/todo/`).

- `tickets/{todo,backlog,in-progress,agent-review,human-review,merge-queue,done}/`: the pipeline queues plus `backlog/` (captured work, not picked by `pb:next` until promoted). Each holds one directory per ticket (`<id>/` with `index.md` (brief) + `detail.md` (full) plus an optional `evidence/`); listing a queue enumerates IDs. `todo/` admission order for `pb:next` is by `**Priority:**` then ID.
- `current-state.md`: scannable snapshot of what's in flight, what's blocked, what needs developer attention.

## Conventions
- A ticket's ID is `{feature-id}-{n}`, declared in its `index.md` `**ID:**` field and mirrored by the ticket's directory name.
- A feature's ID is declared in its `index.md` `**ID:**` field. Globally unique, flat kebab-case.
- Project and state repos nest under the playbook repo, as `project/` and `state/`.
