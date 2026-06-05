# Playbook machine

This machine runs the semi-autonomous AI development process. These are your standing instructions for every session, in every directory.

**At session start, read `~/playbook/process.md`.** It is the concise description of how the process works: the repos, the queues, the work-item format, the development loop, goals, and the verification rules. The full reference is `~/playbook/handbook.md`; the orientation map is `~/playbook/index.md`. Follow `process.md` exactly.

## How the repos fit together

Three repos (full detail in `process.md`):

- **Playbook** (`~/playbook/`): this process, the skills, the templates, the scripts. Shared across all projects, one clone per machine. You are reading its global instructions now.
- **Project repo** (per project): the code, its spec (`docs/spec/`), testing manual, and rules. Has its own `CLAUDE.md` that takes precedence when you are working inside it.
- **State repo** (per project): the work-item queues (`work-items/`) and `current-state.md`. Lives beside the project repo.

When you are inside a project's work or state repo, that repo's `CLAUDE.md` applies on top of this file.

## What to tell the developer

- If a project's project and state repos already exist, start with `/pb:status`: read `current-state.md`, summarise what is in flight and blocked, and recommend the next skill (`/pb:next`, `/pb:review`, `/pb:plan`, ...).
- If the project is not set up yet, run `/pb:bootstrap:new` (greenfield) or `/pb:bootstrap:existing` (existing code) to scaffold the project and state repos, then begin the loop.
- Move work items only with `bun ~/playbook/scripts/move.ts <id> <target-queue>`. Never move queue directories by hand.

## Permissions

This machine is the sandbox. Claude Code runs here with permission prompts disabled so the development loop never stalls. The blast radius is the VM, not the host (see `handbook.md` > Maximising Autonomy > Sandbox VM).
