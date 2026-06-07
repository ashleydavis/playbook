# Glossary

Definitions of the terms used throughout the [handbook](handbook.md) and the rest of the playbook.

- **Playbook**: the repo holding the process, skills, templates, and scripts. One clone of this repo per project with Claude Code launched from the playbook repo root.
- **Project repo**: the application's own code and docs (spec, rules). Self-contained; knows nothing of the playbook or state repo.
- **State repo**: per-project process state: the work-item queues and `current-state.md`. Lives outside the project repo.
- **Skill**: a `pb:*` slash command that drives one stage of the process (e.g. `/pb:next`). Skills instruct; they do not enforce.
- **Work item**: a unit of work: a directory (`index.md` and `detail.md` plus an `evidence/` subdir) named by its ID, that travels through the queues.
- **Queue**: one of six pipeline directories under `state/work-items/`: `todo/` → `in-progress/` → `agent-review/` → `human-review/` → `merge-queue/` → `done/`. Plus `blocked/`, a side pen (not a pipeline stage) where items that hit a hard or repeated failure are parked for the developer.
- **`current-state.md`**: the curated, human-readable summary of where things stand, sitting on top of the queues.
- **Goal (`/goal`)**: a pass condition checked after every turn; an agent is not "done" until it holds. Goals enforce what skills only instruct.
- **Goal evaluator**: the mechanism that re-checks a `/goal` against the repos after each turn.
- **Sub-agent**: an agent `/pb:next` spawns to take one work item through one stage, running in that item's worktree. The pipeline diagram's **Work / Review / Merge Agent** are sub-agents at the implement, agent-review, and merge stages.
- **Worktree**: a git working tree per work item, so parallel items do not collide and a sub-agent cannot touch the main repo by accident.
- **Check**: any pass/fail verification of the work, either deterministic (a command: compile, lint, unit, smoke, e2e) or judgement (an agent analysing against a rule). See the Checks section.
- **Stop the line**: halt and fix immediately when a check fails, before moving on.
- **Evidence**: captured proof (test output, screenshots, transcripts) in a work item's `evidence/` subdir; goals require it before an item advances.
- **Spec**: the source of truth for app behaviour, in `docs/spec/`. Tests, the testing manual, and derived docs all follow from it.
- **Setup**: forking (optional) and cloning the playbook and launching Claude Code from the playbook repo root, so the process applies. One clone per project. Distinct from bootstrap, which scaffolds the per-project repos.
- **Bootstrap**: the one-time, per-project setup (`pb:bootstrap:*`) that scaffolds the repos. Distinct from setup, which clones the playbook and launches it.
- **Host**: the developer's own computer, where the repos live and interactive work (planning, review, exploring the UI) runs.
- **VM**: a lightweight virtual machine that contains the blast radius of autonomous work (`/pb:next`). Permissions are off wherever the playbook runs, including the host, so the VM (not a permission prompt) is the safety boundary; the host's repos are shared into it.
