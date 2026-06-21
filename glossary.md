# Glossary

Definitions of the terms used throughout the [handbook](handbook.md) and the rest of the playbook.

- **Playbook**: the repo holding the process, skills, templates, and scripts. One clone of this repo per project with Claude Code launched from the playbook repo root.
- **Project repo**: the application's own code and docs (spec, rules). Self-contained; knows nothing of the playbook or state repo.
- **State repo**: per-project process state at `state/` under the playbook root: the ticket queues (`state/tickets/`) and `state/current-state.md`. Lives outside the project repo.
- **Skill**: a `pb:*` slash command that drives one stage of the process (e.g. `/pb:next`). Skills instruct; they do not enforce.
- **Ticket**: a unit of work: a directory (`index.md` and `detail.md` plus an `evidence/` subdir) named by its ID, that travels through the queues.
- **Queue**: one of six pipeline directories under `state/tickets/`: `todo/` → `in-progress/` → `agent-review/` → `human-review/` → `merge-queue/` → `done/`. Plus `blocked/`, a side pen (not a pipeline stage) where tickets that hit a hard or repeated failure are parked for the developer.
- **`current-state.md`**: the curated, human-readable summary of where things stand, sitting on top of the queues. At `state/current-state.md` when working from the playbook root.
- **Ticket completion criteria**: the observable state that marks a stage done (files in the right queues, checks green, evidence on disk, commits made), plus an abort condition (a turn count or repeated-failure signal). They are plain text in a sub-agent's prompt; the gate that actually enforces them is `pb:next`'s end-of-turn reconciliation plus the evidence the criteria demand being on disk.
- **Sub-agent**: an agent `/pb:next` spawns to take one ticket through one stage, running in that ticket's worktree. The pipeline diagram's **Work / Review / Merge Agent** are sub-agents at the implement, agent-review, and merge stages.
- **Worktree**: a git working tree per ticket, so parallel tickets do not collide and a sub-agent cannot touch the main repo by accident.
- **Check**: any pass/fail verification of the work, either deterministic (a command: compile, lint, unit, smoke, e2e) or judgement (an agent analysing against a rule). See the Checks section.
- **Stop the line**: halt and fix immediately when a check fails, before moving on.
- **Environmental failure**: two or more tickets failing the same stage or check in one `/pb:next` run, signalling a shared environmental cause (test fixtures, a contended resource, a broken tool) rather than a fault in any one ticket. It stops the run and hands back to the developer. See [Handling Failures](handbook.md#handling-failures).
- **Interruption**: the run being cut off from outside (a session or rate limit, the developer stopping it, or the agent or machine dying), as opposed to a ticket failing. It is never a failure: nothing is recorded, counted, or blocked. The run stops, the queues are left as they are, and the developer resumes by re-running `/pb:next`, which re-drives any mid-stage ticket from the live queue state. See [Interruption and resume](handbook.md#interruption-and-resume).
- **Evidence**: captured proof (test output, screenshots, transcripts) in a ticket's `evidence/` subdir; a ticket's completion criteria require it before a ticket advances.
- **Ticket selection menu**: the numbered list + prompt used when a skill asks the developer to pick ticket(s); defined in `docs/ticket-selection.md`, formatted by `format-ticket-selection.ts`. Distinct from the **inspect loop** (per-ticket action menu in `pb:review`).
- **Spec**: the source of truth for app behaviour, in the project repo at `project/docs/spec/` (`docs/spec/` relative to the project repo root). Tests, the testing manual, and derived docs all follow from it.
- **Setup**: forking (optional) and cloning the playbook and launching Claude Code from the playbook repo root, so the process applies. One clone per project. Distinct from bootstrap, which scaffolds the per-project repos.
- **Bootstrap**: the one-time, per-project setup (`pb:bootstrap:*`) that scaffolds the repos. Distinct from setup, which clones the playbook and launches it.
- **Host**: the developer's own computer, where the repos live and interactive work (planning, review, exploring the UI) runs.
- **VM**: a lightweight virtual machine that contains the blast radius of autonomous work (`/pb:next`). Permissions are off wherever the playbook runs, including the host, so the VM (not a permission prompt) is the safety boundary; the host's repos are shared into it.
