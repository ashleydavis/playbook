# Playbook

Playbook is a semi-autonomous AI development process centered around human planning and review. The human does the planning, the AI does the work (many tasks in parallel, implementation, testing, docs updates, etc), the human does review and testing.

This repo describes the development process and has skills that the human uses to drive development forward.

## The loop at a glance

The developer plans the work, Claude builds and self-reviews it, the developer review and approves or rejects.

```mermaid
flowchart LR
    DEV["Developer:<br/>plan / add work"] --> Q[("Work queue")]
    Q --> AI["Claude:<br/>implement, test, review"]
    AI --> REV{"Developer:<br/>review, test, read"}
    REV -->|approve| DONE(["merged"])
    REV -->|reject, with notes| Q
```

## Prerequisites

[`git`](https://git-scm.com/downloads), [`bun`](https://bun.sh/docs/installation), and [Claude Code](https://docs.claude.com/en/docs/claude-code/setup), installed on your machine.

## Quickstart

Try it out on your development machine:

1. Clone the repo:
```bash
git clone https://github.com/ashleydavis/playbook.git
```
2. Change directory into the repo:
```bash
cd playbook
```
2. Launch Claude Code from the playbook repo root.
3. Run `/pb:bootstrap:new` (greenfield project) or `/pb:bootstrap:existing` (existing project) to scaffold the project into `project/` and the state into `state/`.
4. Run `/pb:status` (or `/pb:help` if you're new). It summarises where things stand and recommends what to run next; each skill points you to the following step from there.

> **Permissions warning.** The committed `.claude/settings.json` sets `bypassPermissions`, so Claude Code runs with permission prompts **off** wherever the playbook repo is launched, including your own host. Run it inside a sandbox VM (see [Host + VM](handbook.md#host--vm)) so the blast radius is the VM, not your machine.

> **Your remotes are your responsibility.** Bootstrap scaffolds `project/` and `state/` as local git repos only. It does not create GitHub repos or push for you. Create a remote for each (the state repo too) and push periodically; Playbook won't do that for you.

## Next steps

- [Handbook](handbook.md#setup): read the Playbook handbook.
- [Setup](handbook.md#setup): the detailed setup steps.
- [Project bootstrap](handbook.md#project-bootstrap): the detailed bootstrap steps.
- [Host + VM](handbook.md#host--vm): a more autonomous, VM-based setup.

## Layout

```bash
playbook/
  CLAUDE.md   # Standing instructions, loaded when Claude Code launches from here.
  README.md
  handbook.md # The handbook. The full process written for humans.
  docs/
    process.md        # Concise process for the AI.
    output-format.md  # How skills present output.
    ticket-selection.md  # Shared ticket selection menu.
  index.md    # Orientation. What lives where.
  .claude/             # Claude Code config for the playbook repo.
    settings.json      # Permissions off (bypassPermissions).
    commands/
      pb/              # The pb:* skills.
        help.md        # Get help!
        status.md
        plan/
          break.md   # Break a written plan into tickets.
        docs.md
        add.md
        next.md
        review.md
        debug.md
        customize.md   # Interview the developer and tune the project's enforced rules.
        bootstrap/
          new.md       # Bootstrap a new project.
          existing.md  # Bootstrap an existing project.
  templates/           # Templates for new projects and various files.
    project/
    state/
    feature-template/
    ticket-template/
    commit-template/   # Commit message template.
  scripts/
    install-prereqs.sh # Installs git, bun, and Claude Code.
    move.ts            # Moves tickets between queues.
  project/    # The project repo (created by bootstrap, gitignored).
  state/      # The state repo (created by bootstrap, gitignored).
```

## How it fits with project and state repos
Each project has two further repos, nested in the playbook repo root:
- **Project repo**: the product you are building at `project/`, its code, its spec (`project/docs/spec/`), testing manual, and enforced rules. Source of truth for the project.
- **State repo**: at `state/`, tracks the state of the project: the ticket queues (`state/tickets/`).

Bootstrap (`pb:bootstrap:new` / `pb:bootstrap:existing`) scaffolds both from [templates/](templates/). The project repo is decoupled from the playbook which remains separate and shareable between multiple projects.

## Further reading
- [handbook.md](handbook.md): the full process description, written for humans.
- [docs/process.md](docs/process.md): the concise version Claude reads at session start.
- [index.md](index.md): a compact map of what lives where across all three repos.
- [templates/commit-template/commit-template.txt](templates/commit-template/commit-template.txt): the commit message format. Customize it to suit your projects.
