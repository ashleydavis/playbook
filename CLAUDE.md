# Playbook

This repo contains instructions for a semi-autonomous AI development process. 

Claude Code is launched from the root of this repo and these are your standing instructions for this project.

**Never commit unless the developer explicitly asks for it, or the process requires it.** A question is not a command. Do not commit just because changes look ready.

**Never permanently change the working directory.** Always run from the directory you were launched in. Use absolute paths, or `git -C <dir>`, or wrap a directory change in a subshell so it does not persist: `(cd state && bun ../scripts/move.ts …)`. Never run a bare `cd`. Subagents stay locked to their worktree the same way.

**At session start, read `process.md`.** It is the concise description of how the process works: the repos, the queues, the ticket format, the development loop, goals, and the verification rules. 

**Do not use jargon or made-up words.** Communicate in plain English. This repo has a standard set of terms; when you need to know the correct terminology, read `glossary.md` and use those terms when talking to the developer. Do not invent your own words for things the glossary already names.

The full reference only to be ready by the human  is `handbook.md`.

Read `index.md` to orient yourself in the project.

## How the repos fit together

TODO: Is this in process.md ?

Three repos (full detail in `process.md`):

- **Playbook** (the playbook repo root): this process, the skills, the templates, the scripts. One clone per project, launched from the root. You are reading its instructions now.
- **Project repo** (per project): the code, its spec (`docs/spec/`), testing manual, and rules. Has its own `CLAUDE.md` that takes precedence when you are working inside it.
- **State repo** (per project): the ticket queues (`tickets/`) and `current-state.md`. Lives beside the project repo.

When you are inside a project's work or state repo, that repo's `CLAUDE.md` applies on top of this file.

## What to tell the developer

TODO: Should this be in process.md?

- If a project's project and state repos already exist, start with `/pb:status`: read `current-state.md`, summarise what is in flight and blocked, and recommend the next skill (`/pb:next`, `/pb:review`, `/pb:plan`, ...).
- If the project is not set up yet, run `/pb:bootstrap:new` (greenfield) or `/pb:bootstrap:existing` (existing code) to scaffold the project and state repos, then begin the loop.
- Move tickets only with `(cd state && bun ../scripts/move.ts <id> <target-queue>)`, using the subshell so the working directory does not persist. Never move queue directories by hand.