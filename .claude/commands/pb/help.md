---
name: pb:help
description: "Invoke when the developer wants to understand this process: what it is, how to bootstrap a project, how to drive work forward, which skills do what, and which queues a ticket travels through. The orientation entry point for someone new to the playbook or coming back to it. Keywords: help, how does this work, how do I use this, getting started, what skills, what queues, explain the process, orientation, where do I start, what does pb:next do, pipeline, onboarding."
---

# pb:help

Orient the developer in this process. Answer their actual question directly, then point them at the next step. Do not just dump the whole reference: lead with what they asked, keep it scannable, and link the deeper docs ([process.md](../../../docs/process.md), [handbook.md](../../../handbook.md), [index.md](../../../index.md)) for detail.

If their question is narrow (e.g. "what does `pb:next` do?", "where do rejected tickets go?"), answer that and stop. If it is open ("how does this work?", "where do I start?"), give the short tour below.

## Output style

Follow the project's [output format](../../../docs/output-format.md) (load it once per session if it is not already in your context). Specific to help:

- Answer the question asked, then stop.
- Keep it scannable; link the deeper docs rather than pasting them.

## The short tour

**What this is.** A semi-autonomous development process. A work queue is the source of truth, Claude skills drive each stage, and each ticket has completion criteria checked against evidence on disk, so no agent advances a ticket without them. Three repos: the **playbook** (this repo, cloned once per project: process, skills, templates, scripts), and per project a **project repo** (the code at `project/`) and a **state repo** (the ticket queues).

**How to start a project (bootstrap, run once).** Launch Claude Code from the playbook repo root, then:
- New codebase -> `pb:bootstrap:new`: interviews you, creates both repos from `templates/`, then writes a good first version of each template doc (setup, development, architecture, the rules) from the interview.
- Existing codebase -> `pb:bootstrap:existing`: creates the state repo and confirms a green test baseline, assuming the project's documentation is already complete (it queues no doc work).

**How to drive it forward (the loop).** Run `/pb:status` (or `/pb:board`) to see where things stand, run a skill, repeat:
1. `pb:status` (usual session start): summarises the queues, recommends the next skill.
2. `pb:plan:break` / `pb:todo:break` / `pb:docs` / `pb:add`: get work into `todo/`.
3. `pb:next`: drains the queues without you, implementing up to 10 unblocked tickets in parallel through to human review. Run it once; it keeps going until forward progress is exhausted.
4. `pb:review`: walk through `human-review/`, approve or reject each ticket.
5. `pb:debug`: when something is broken and the cause is unknown (proves a root cause, then spawns a Fix ticket).

**The queues (pipeline order).** A ticket is a directory that travels as a unit:

```
todo/ -> in-progress/ -> human-review/ -> merge-queue/ -> done/
```

- `todo/`: pending, ready for `pb:next` (ordered by `**Priority:**` then ID among actionable tickets).
- `backlog/`: side pen for captured work not yet a contender; `pb:next` never reads it. Pull to `todo/` with `pb:promote`.
- `in-progress/`: built in a worktree by four sub-agents in turn: dev, test, rules check (against `project/docs/rules/`) and commit.
- `human-review/`: waiting on you (`pb:review`).
- `merge-queue/`: approved, waiting for the merge agent to land it on main.
- `done/`: merged, with its evidence archived alongside.

Only `human-review/` needs you. `pb:next` moves tickets through the rest. A ticket never fails: each stage fixes what it finds, and a human rejection in `pb:review` is the only way a ticket goes back to `todo/`.

## Skills

| Skill | Purpose |
|---|---|
| `pb:help` | This. Explain the process, bootstrap, the loop, skills, and queues |
| `pb:status` | Summarise queue state, recommend the next skill |
| `pb:plan:break` | Break a written plan into dependency-linked tickets |
| `pb:todo:break` | Break the project's todo list into dependency-linked tickets |
| `pb:docs` | Write/update docs; queue tickets |
| `pb:add` | Create a single ticket in `todo/` or `backlog/` |
| `pb:promote` | Pull tickets from `backlog/` to `todo/` |
| `pb:rank` | Set or change `**Priority:**` on tickets in `todo/` or `backlog/` |
| `pb:platforms` | Set or clear `**Platforms:**` on tickets in `todo/` or `backlog/` |
| `pb:next` | Pick up to 10 unblocked tickets, implement in parallel through to human review |
| `pb:next:preview` | Say what `pb:next` would do, without doing it |
| `pb:review` | Walk you through `human-review/` |
| `pb:debug` | File a Debug ticket to prove a root cause, then spawn a Fix ticket |
| `pb:customize` | Tune the project's enforced rules in `project/docs/rules/` |
| `pb:bootstrap:new` | Set up a greenfield project (run once) |
| `pb:bootstrap:existing` | Set up an existing project (run once) |

## Where to read more

- [process.md](../../../docs/process.md): the concise machine-readable process (what Claude reads at session start).
- [handbook.md](../../../handbook.md): the full human reference, section by section.
- [index.md](../../../index.md): the orientation map of what lives where.

## Example

```
Developer: how do I get started?

This process runs on a work queue plus a set of skills. To start a project:
- New code:      pb:bootstrap:new
- Existing code: pb:bootstrap:existing

Then the daily loop is: pb:status (see where things stand) -> pb:plan:break/todo:break/add
(fill todo/) -> pb:next (it builds everything it can) -> pb:review (you
approve). Tickets flow todo -> in-progress -> human-review -> merge-queue ->
done; only human-review needs you.

Want the full tour, or help with a specific step?
```
