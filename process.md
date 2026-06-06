# Process

STATUS: REVIEWED

Read this at session start. This is all the AI needs. [handbook.md](handbook.md) is the full reference for humans; you don't need to read it. Orientation map is [index.md](index.md).

## Files: index and detail

Each "thing" (feature, work item) is a directory holding two markdown files with standard names:

- `index.md`: lightweight. ID, status, a short description, links to related things. Load this for a quick read without pulling full content into context.
- `detail.md`: the full content (full spec or work-item body). Load it only when the index isn't enough.

Default to `index.md`; open `detail.md` on demand.

## Setup

Clone the playbook for each project you want to work on. 

Launch Claude Code from the root of the playbook repo.

**Host only**:
1. Clone the playbook.
2. Launch Claude Code from the playbook repo root. (`git`, `bun`, and Claude Code are assumed already installed on the host.)

**Host + VM**:
1. On the host, clone the playbook.
2. Spin up the VM (Multipass or similar) and share the host's playbook repo into it.
3. In the VM: `scripts/install-prereqs.sh` (prerequisites).
4. In the VM, install whatever the project needs to build, test, and run.
5. In the VM, launch Claude Code from the playbook repo root.

## Bootstrap

Once per project, on host or VM. Already bootstrapped? Don't run it again; start the loop with `pb:status` or `pb:next`.

- `pb:bootstrap:new`: for a greenfield project. Interviews the developer, scaffolds both repos into `project/` and `state/`, seeds docs (spec, testing manual, `docs/rules/`), leaves empty queues ready to run.
- `pb:bootstrap:existing`: for an existing project. Clones the project into `project/`, creates the state repo at `state/`, finds gaps (`CLAUDE.md`, docs, test setup), queues a work item per gap (these become dependencies for future work).

## Repos

Three repos, each a separate concern:
- **Playbook** (the playbook repo root) describes the AI development process including skills, templates, and scripts that drive every project. The repo this file lives in. Playbook is cloned once for each project; launch Claude Code from its root.
- **Project repo** is the product: the code being built and its docs. Lives at `project/` under the playbook repo root. Must contain `CLAUDE.md`, `docs/spec/`, `docs/testing-manual/`, `docs/rules/`, `docs/roadmap.md`. Each feature lives under `docs/spec/<id>/` as an `index.md` and a `detail.md`.
- **State repo** manages the state of the process: it records what is happening, will happen, and has happened, so the developer and Claude stay in sync. Holds the queues and `current-state.md`. Lives at `state/` under the playbook repo root (a sibling of `project/`, not inside it) so it stays external to and consistent across worktrees.

## Queues

`state/work-items/` has six queue directories, in pipeline order:

`todo/` → `in-progress/` → `agent-review/` → `human-review/` → `merge-queue/` → `done/`

- Each queue holds one directory per work item, named by its ID (`todo/<id>/`).
- The item directory (`index.md`, `detail.md`, and an `evidence/` subdir) moves between queues as a unit, so the item and its evidence stay together end to end and land in `done/<id>/`.
- List a queue with `ls state/work-items/<queue>/` (e.g. `ls state/work-items/todo/`); the directory names are the IDs, so this shows queue contents without opening files.
- Move items with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`). The agent decides when; the script only moves the directory and the agent updates `current-state.md`.
- `current-state.md` is an overview of the current state of the process and is derived from the state of the queues. The AI or developer can check this file to see progress, state, what's blocked. It's lightweight, easy to read and scan.

## Spec and docs

- `docs/spec/` is the source of truth for app behaviour. The testing manual (`docs/testing-manual/`) mirrors its layout and IDs exactly; derived docs (how-it-works, user guide) follow from it.
- Edits can start from any surface (spec, derived doc, testing manual, code). Whichever changes first, the AI fans the change out to the rest. Conflicts resolve in the spec's favour.
- Each feature `index.md` carries two status fields: `**Spec:**` (Draft/Settled) and `**Implementation:**` (None/Partial/Complete); a retired feature adds `**Deprecated:**`.
- Work-item acceptance criteria are derived from the feature's `detail.md`, not invented in the item.

## Work items

- `index.md` (brief) holds: `**ID:**`, `**Type:**`, `**Depends on:**`, and a one-line description (the queue it sits in is its status). `detail.md` (full) holds: Description, Acceptance Criteria, Test Plan, Notes, History. Shape: [templates/work-item-template/](templates/work-item-template/).
- ID form: `{feature-id}-{n}`, where `n` increments per feature. Items not tied to a feature use a `misc`/`infra` prefix. The `**ID:**` field is the source of truth; the directory name mirrors it.
- Refuse to implement an item with no acceptance criteria.
- A Test Plan is required. For items with no testable behaviour, use `N/A: <reason>` with a Manual Verification section. Nothing reaches `merge-queue/` without a check.
- Dependent items cannot start until their dependencies are merged.
- Rejection notes are appended to History; the item moves back to `todo/`.
- `Debug` and `Fix` are special types that change agent-review behaviour (see `pb:debug`).

## Templates

All scaffolding is under [templates/](templates/) ([README.md](templates/README.md), [index.md](templates/index.md)):

- [templates/project/](templates/project/): project repo scaffold. Copied by `pb:bootstrap:new`.
- [templates/state/](templates/state/): state repo scaffold. Copied by `pb:bootstrap:*`.
- [templates/feature-template/](templates/feature-template/): feature `index.md` + `detail.md`. Copied by `pb:plan`.
- [templates/work-item-template/](templates/work-item-template/): work item `index.md` + `detail.md`. Copied by `pb:add`.
- [templates/commit-template/](templates/commit-template/): commit format. Copied and filled out when making a commit (see [Commits](#commits)).

## Development loop

Rhythm: check `current-state.md`, run a skill, repeat. Skills (in `.claude/commands/pb/`):

| Skill | Purpose |
|---|---|
| `pb:help` | Explain the process, bootstrap, the loop, skills, and queues |
| `pb:status` | Summarise queue state, recommend next skill |
| `pb:plan` | Update spec, docs, testing manual; queue items |
| `pb:docs` | Write/update docs; queue items |
| `pb:add` | Create a work item in `todo/` |
| `pb:next` | Pick up to 10 unblocked items, implement in parallel |
| `pb:review` | Walk the developer through `human-review/` |
| `pb:debug` | File a Debug item to prove a root cause, then spawn a Fix item |
| `pb:customize` | Tune the project's enforced rules in `docs/rules/` |

## Goals

`/goal` is a pass condition checked after every turn; the agent is not done until the goal is achieved. Skills instruct; goals enforce. Every goal has a **success condition** (observable state: files in queues, checks green, evidence on disk, commits made) and an **abort condition** (turn count or repeated-failure signal).

`pb:next` uses goals in three places: its top-level loop goal (stops when forward progress is exhausted) and a per-item sub-agent goal for each of merge / implement / agent-review, each run in the item's worktree. Timeouts surface via `current-state.md`, not silent failure. Exact goal text lives in the [pb:next](.claude/commands/pb/next.md) skill. Use `/goal clear` to interrupt; `/goal` with no argument shows status.

## Checks

A **check** is any pass/fail verification of the work. Every check has a boolean result; they differ only in how the verdict is reached:

- **Deterministic**: a command produces the verdict (compile, lint, format, unit, smoke, e2e). No discretion.
- **Judgement**: an agent analyses the work against a named rule and decides (anything in `docs/rules/`, plus `CLAUDE.md` files): docs current after a code change, rule conformance, a fix being the minimal change. Discretion required.

The two are interchangeable in the pipeline. What differs is the evidence: a deterministic check captures command output; a judgement check captures the agent's written assessment pointing at the rule and the code.

**Who evaluates, and when.** Checks run inside the `pb:next` sub-agents, in the item's worktree:

- Implement and merge stages run the deterministic checks (compile, lint, tests).
- Agent-review runs the judgement checks: every rule in `docs/rules/`, the touched `CLAUDE.md` files, and the docs required by `documentation.md`.
- The goal evaluator confirms the evidence exists before the item moves on; the developer sees the same evidence in `pb:review`.

**Every check result records the same fields**, whatever its kind:

- **Check**: what was verified (e.g. `unit tests`, `docs/rules/documentation.md`).
- **Method**: how it was performed (the command run, or the rule analysed).
- **Result**: pass or fail.
- **Basis**: why, the output read or the reasoning that decided it.
- **Fix notes**: on fail, what to change.

## Verification and evidence

Never claim a check passes on confidence. Before claiming, every agent at every stage:

1. **Identify** the exact command that proves the claim.
2. **Run** it fresh (never reuse a prior or cached run).
3. **Read** the full output, including exit code and failure count.
4. **Confirm** the output supports the claim.
5. **Capture** the output to the item's `evidence/` subdir, then claim and point at it.

For a judgement check there is no command: the agent reads the rule and the code in place of steps 1-3, and captures its written assessment (rule named, verdict, reasoning) as the evidence.

Confidence is not evidence: no claim of pass without a fresh run captured to `evidence/`. Passing earlier ≠ passing now; a sub-agent's report ≠ a verified result. Evidence (`unit.txt`, `smoke.txt`, `e2e.txt`, `screenshots/`, transcripts) travels in the item directory and is required by sub-agent goals before an item moves on.

## Commits

Every commit follows one template: [templates/commit-template/commit-template.txt](templates/commit-template/commit-template.txt). Read it when committing; its comments carry the full field-by-field guidance (subject form, body, `Type:`, `Work-item:` trailer).
