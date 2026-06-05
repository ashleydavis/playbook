# Playbook

STATUS: REVIEWED

Playbook is a semi-autonomous AI development process centered around human planning and review. The human does the planning, the AI does the work (many tasks in parallel, implementation, testing, docs updates, etc), the human does review and testing.

This repo describes the development process and has skills that the human uses to drive development forward.

## Prerequisites

[`git`](https://git-scm.com/downloads), [`bun`](https://bun.sh/docs/installation), and [Claude Code](https://docs.claude.com/en/docs/claude-code/setup), installed on your machine.

## Quickstart

Try it out on your development machine:

1. Clone the repo to `~/playbook`:
```bash
git clone https://github.com/ashleydavis/playbook.git ~/playbook
```
2. From the directory you want to work in, wire the playbook into a local `.claude/` (leaves your global Claude config untouched):
```bash
mkdir -p .claude/commands
ln -s ~/playbook/config/PLAYBOOK-CLAUDE.md .claude/CLAUDE.md
ln -s ~/playbook/skills/pb .claude/commands/pb
```
3. Launch Claude Code from that directory.
4. In your project, run `/pb:bootstrap:new` (greenfield) or `/pb:bootstrap:existing` (existing code) to scaffold it.
5. Drive the loop: `/pb:status` → `/pb:plan` or `/pb:add` → `/pb:next` → `/pb:review`. New to it? Run `/pb:help`.

## Next steps

- [Playbook installation](handbook.md#playbook-installation): the detailed install steps.
- [Project bootstrap](handbook.md#project-bootstrap): the detailed bootstrap steps.
- [Host + VM](handbook.md#host--vm): a more autonomous, VM-based setup.

## Layout

```bash
playbook/
  README.md
  handbook.md # The handbook. The full process  written for humans.
  process.md  # Concise description of the process for the AI.
  index.md    # Orientation. What lives where.
  config/     # Claude config.
    PLAYBOOK-CLAUDE.md # Global Claude.
    settings.json      # Global settings.
  skills/              # Skills to derive the process.
    pb/                
      help.md          # Get help!
      status.md
      plan.md
      docs.md
      add.md
      next.md
      review.md
      debug.md
      customize.md     # Interview the developer and tune the project's enforced rules.
      bootstrap/       
        new.md         # Bootstrap a new project.
        existing.md    # Bootsrap an existing project.
  templates/           # Templates for new projects and various files.
    project/
    state/
    feature-template/
    work-item-template/
    commit-template.txt # Commit message template.
    ripts/
    install.sh          # One-time install per-machine
    move.ts             # Moves work items between queues.
```

## How it fits with project and state repos
Each project has two further repos, usually siblings on disk:
- **Project repo**: the product you are building, its code, its spec (`docs/spec/`), testing manual, and enforced rules. Source of truth for the project.
- **State repo**: tracks the state of the project, the work-item queues (`work-items/`) and `current-state.md`, tracking what is in flight.

Bootstrap (`pb:bootstrap:new` / `pb:bootstrap:existing`) scaffolds both from [templates/](templates/). The project repo is decoupled from the playbook which remains separate and shareable between multiple projects.

## Start here
- [handbook.md](handbook.md): the full process description, written for humans.
- [process.md](process.md): the concise version Claude reads at session start.
- [index.md](index.md): a compact map of what lives where across all three repos.
- [templates/commit-template.txt](templates/commit-template.txt): the commit message format. Customize it to suit your projects.
