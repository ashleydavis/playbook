---
name: pb:help
description: Invoke when the developer wants to understand this process: what it is, how to bootstrap a project, how to drive work forward, which skills do what, and which queues a work item travels through. The orientation entry point for someone new to the playbook or coming back to it. Keywords: help, how does this work, how do I use this, getting started, what skills, what queues, explain the process, orientation, where do I start, what does pb:next do, pipeline, onboarding.
---

# pb:help

Orient the developer in this process. Answer their actual question directly, then point them at the next step. Do not just dump the whole reference: lead with what they asked, keep it scannable, and link the deeper docs ([process.md](../../process.md), [handbook.md](../../handbook.md), [index.md](../../index.md)) for detail.

If their question is narrow (e.g. "what does `pb:next` do?", "where do rejected items go?"), answer that and stop. If it is open ("how does this work?", "where do I start?"), give the short tour below.

## The short tour

**What this is.** A semi-autonomous development process. A work queue is the source of truth, Claude skills drive each stage, and `/goal` pass-conditions stop any agent from claiming "done" without evidence. Three repos: the **playbook** (this repo, shared across all projects: process, skills, templates, scripts), and per project a **project repo** (the code) and a **state repo** (the queues and `current-state.md`).

**How to start a project (bootstrap, run once).** The playbook must already be installed on the machine (`scripts/install.sh`, one-time). Then:
- New codebase -> `pb:bootstrap:new`: interviews you, creates both repos from `templates/`, writes the initial spec, testing manual, and `docs/rules/`.
- Existing codebase -> `pb:bootstrap:existing`: creates the state repo, analyses the project repo for gaps, and queues work items to fill them.

**How to drive it forward (the loop).** Check `current-state.md`, run a skill, repeat:
1. `pb:status` (usual session start): summarises the queues, recommends the next skill.
2. `pb:plan` / `pb:docs` / `pb:add`: get work into `todo/`.
3. `pb:next`: drains the queues without you, implementing up to 10 unblocked items in parallel through to human review. Run it once; it keeps going until forward progress is exhausted.
4. `pb:review`: walk through `human-review/`, approve or reject each item.
5. `pb:debug`: when something is broken and the cause is unknown (proves a root cause, then spawns a Fix item).

**The queues (pipeline order).** A work item is a directory that travels as a unit:

```
todo/ -> in-progress/ -> agent-review/ -> human-review/ -> merge-queue/ -> done/
```

- `todo/`: pending, waiting to be picked up.
- `in-progress/`: an implement sub-agent is building it in a worktree.
- `agent-review/`: automated review against `docs/rules/`.
- `human-review/`: waiting on you (`pb:review`).
- `merge-queue/`: approved, waiting for the merge agent to land it on main.
- `done/`: merged, with its evidence archived alongside.

Only `human-review/` needs you. `pb:next` moves items through the rest. Rejections (agent or human) send the item back to `todo/` with notes.

## Skills

| Skill | Purpose |
|---|---|
| `pb:help` | This. Explain the process, bootstrap, the loop, skills, and queues |
| `pb:status` | Summarise queue state, recommend the next skill |
| `pb:plan` | Update spec, docs, testing manual; queue items |
| `pb:docs` | Write/update docs; queue items |
| `pb:add` | Create a single work item in `todo/` |
| `pb:next` | Pick up to 10 unblocked items, implement in parallel through to human review |
| `pb:review` | Walk you through `human-review/` |
| `pb:debug` | File a Debug item to prove a root cause, then spawn a Fix item |
| `pb:customize` | Tune the project's enforced rules in `docs/rules/` |
| `pb:bootstrap:new` | Set up a greenfield project (run once) |
| `pb:bootstrap:existing` | Set up an existing project (run once) |

## Where to read more

- [process.md](../../process.md): the concise machine-readable process (what Claude reads at session start).
- [handbook.md](../../handbook.md): the full human reference, section by section.
- [index.md](../../index.md): the orientation map of what lives where.

## Example

```
Developer: how do I get started?

This process runs on a work queue plus a set of skills. To start a project:
- New code:      pb:bootstrap:new
- Existing code: pb:bootstrap:existing

Then the daily loop is: pb:status (see where things stand) -> pb:plan/add
(fill todo/) -> pb:next (it builds everything it can) -> pb:review (you
approve). Items flow todo -> in-progress -> agent-review -> human-review ->
merge-queue -> done; only human-review needs you.

Want the full tour, or help with a specific step?
```
