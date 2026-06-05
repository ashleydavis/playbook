# Playbook Index

STATUS: REVIEWED

A compact orientation map: what lives where across the playbook and a project's project/state repos. Read when looking something up; read the handbook for full detail.

## In this playbook
- [README.md](README.md): short orientation for anyone landing in the repo.
- [handbook.md](handbook.md): full process description (human reference).
- [process.md](process.md): concise version Claude reads at session start.
- [skills/pb/](skills/pb/): help, status, plan, docs, add, next, review, debug, customize.
- [skills/pb/bootstrap/](skills/pb/bootstrap/): new, existing. Run once per project (`pb:bootstrap:*`).
- [config/](config/): machine-level Claude config. `PLAYBOOK-CLAUDE.md` (global instructions) and `settings.json` (permission prompts off). [scripts/install.sh](scripts/install.sh) symlinks them to `~/.claude/CLAUDE.md` and `~/.claude/settings.json`.
- [templates/](templates/): all templates, with its own [README.md](templates/README.md) and [index.md](templates/index.md). `project/` and `state/` are scaffolded into new projects by `pb:bootstrap:*`; `feature-template/` and `work-item-template/` are copied per item by `pb:plan`/`pb:add`; `commit-template.txt` is registered in place via `git config commit.template`.
- [scripts/install.sh](scripts/install.sh): one-time per-machine install. Wires the playbook into Claude Code (symlinks `~/.claude/CLAUDE.md`, `~/.claude/commands/pb`, and `~/.claude/settings.json`).
- [scripts/move.ts](scripts/move.ts): moves a work item between queues.

## In a project repo (project-specific)
- `CLAUDE.md` at the root: project-specific instructions (stack, how to run, comms style). Always present. Knows nothing about the playbook (that is wired in globally); the enforced rules live in `docs/rules/`, not here.
- `docs/spec/`: source of truth. `docs/spec/index.md` is the feature index; each `<feature>/index.md` declares an ID; `<feature>/detail.md` is the full spec.
- `docs/testing-manual/`: mirrors `docs/spec/`. `detail.md` for full steps.
- `docs/rules/`: the enforced rule set (coding-style, testing, documentation, and any others). The review agent reads it in full. Tuned with `pb:customize`.
- `docs/roadmap.md`: forward-looking ideas.
- Code, tests, derived docs: project-specific layout. See the project repo's CLAUDE.md.

## In a state repo (project-specific)
- `work-items/{todo,in-progress,agent-review,human-review,merge-queue,done}/`: the queues. Each holds one directory per work item (`<id>/` with `index.md` (brief) + `detail.md` (full) plus an optional `evidence/`); listing a queue enumerates IDs.
- `current-state.md`: scannable snapshot of what's in flight, what's blocked, what needs developer attention.

## Conventions
- A work item's ID is `{feature-id}-{n}`, declared in its `index.md` `**ID:**` field and mirrored by the item's directory name.
- A feature's ID is declared in its `index.md` `**ID:**` field. Globally unique, flat kebab-case.
- Project and state repos are typically siblings on disk (`~/projects/foo/project/`, `~/projects/foo/state/`).
