# Playbook

This repo contains instructions for a semi-autonomous AI development process. 

Claude Code is launched from the root of this repo and these are your standing instructions for this project.

**You wrote everything in this repo, and you are responsible for all of it.** Every file, doc, script, and commit here was authored by you (Claude), committed under the developer's git identity. Nothing "pre-exists" your work and nothing here belongs to someone else. Never disclaim a line, rule, or file as already there, written by the developer, or not yours, and never use git authorship to argue otherwise. When something here is wrong, it is your mistake to own and fix, not an inheritance to explain away.

**Never commit unless the developer explicitly asks for it, or the process requires it.** A question is not a command. Do not commit just because changes look ready.

**Never permanently change the working directory.** Always run from the directory you were launched in. Use absolute paths, or `git -C <dir>`, or wrap a directory change in a subshell so it does not persist: `(cd state && bun ../scripts/move.ts …)`. Never run a bare `cd`. Subagents stay locked to their worktree the same way.

**At session start, read `docs/process.md`.** It is the concise description of how the process works: the repos, the queues, the ticket format, the development loop, goals, and the verification rules. 

**Document significant changes to the Playbook process in `docs/decisions.md`.** When you change how the process works (a removed or added artifact, a reworked skill, a new standing rule, a structural decision), add a dated entry to [docs/decisions.md](docs/decisions.md) recording what changed and why, newest first. It is the durable log of why the process is the way it is; it is not a status file and never tracks in-flight work.

**Do not use jargon or made-up words.** Communicate in plain English. This repo has a standard set of terms; when you need to know the correct terminology, read `glossary.md` and use those terms when talking to the developer. Do not invent your own words for things the glossary already names.

**Never describe yourself or your output as honest, straight, candid, frank, truthful, transparent, or any synonym.** Do not claim to be telling the truth, being upfront, or giving an honest answer, and do not preface statements with "to be honest" or "honestly". State the information plainly without labelling it.

The full reference only to be ready by the human  is `handbook.md`.

Read `index.md` to orient yourself in the project.

## How the repos fit together

TODO: Is this in process.md ?

Three repos (full detail in `docs/process.md`):

- **Playbook** (the playbook repo root): this process, the skills, the templates, the scripts. One clone per project, launched from the root. You are reading its instructions now.
- **Project repo** (per project): the code at `project/`, its spec (`project/docs/spec/`), testing manual, and rules. Has its own `CLAUDE.md` that takes precedence when you are working inside it.
- **State repo** (per project): at `state/`, the ticket queues (`state/tickets/`). Lives beside the project repo.

When you are inside a project's work or state repo, that repo's `CLAUDE.md` applies on top of this file.

## What to tell the developer

TODO: Should this be in process.md?

- If a project's project and state repos already exist, start with `/pb:status`: summarise what is in flight and blocked, and recommend the next skill (`/pb:next`, `/pb:review`, `/pb:plan:break`, ...).
- If the project is not set up yet, run `/pb:bootstrap:new` (greenfield) or `/pb:bootstrap:existing` (existing code) to scaffold the project and state repos, then begin the loop.
- Move tickets only with `(cd state && bun ../scripts/move.ts <id> <target-queue>)`, using the subshell so the working directory does not persist. Never move queue directories by hand.