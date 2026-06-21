# Process

Read this at session start. This is all the AI needs. [handbook.md](../handbook.md) is the full reference for humans; you don't need to read it. Orientation map is [index.md](../index.md).

## Files: index and detail

Each "thing" (feature, ticket) is a directory holding two markdown files with standard names:

- `index.md`: lightweight. ID, status, a short description, links to related things. Load this for a quick read without pulling full content into context.
- `detail.md`: the full content (full spec or ticket body). Load it only when the index isn't enough.

Default to `index.md`; open `detail.md` on demand.

## Output style

How a skill presents output to the developer is defined once in [output-format.md](output-format.md). Each skill links to it and adds its own local tailoring. Load it on demand (skip if it is already in your context).

## Ticket selection

Any skill that asks the developer to choose ticket(s) must follow [ticket-selection.md](ticket-selection.md) and use `format-ticket-selection.ts`. Two modes: **`pick-many`** (one-shot, multiple IDs or `all`) and **`pick-one-loop`** (repeat until stop; checklist variant for `pb:review`). The **inspect loop** in `pb:review` (per-ticket action menu) is separate and stays skill-local.

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

- `pb:bootstrap:new`: for a greenfield project. Interviews the developer, scaffolds both repos into `project/` and `state/`, seeds docs (spec, testing manual, `project/docs/rules/`), leaves empty queues ready to run.
- `pb:bootstrap:existing`: for an existing project. Clones the project into `project/`, creates the state repo at `state/`, finds gaps (`CLAUDE.md`, `project/docs/spec/`, `project/docs/testing-manual/`, `project/docs/rules/`, `project/docs/roadmap.md`, smoke/e2e setup), queues a ticket per gap (these become dependencies for future work).

## Repos

Three repos, each a separate concern:
- **Playbook** (the playbook repo root) describes the AI development process including skills, templates, and scripts that drive every project. The repo this file lives in. Playbook is cloned once for each project; launch Claude Code from its root.
- **Project repo** is the product: the code being built and its docs. Lives at `project/` under the playbook repo root. Must contain (paths relative to the project repo root): `CLAUDE.md`, `docs/spec/`, `docs/testing-manual/`, `docs/rules/`, `docs/roadmap.md`. Each feature lives under `docs/spec/<id>/` as an `index.md` and a `detail.md`.
- **State repo** manages the state of the process: it records what is happening, will happen, and has happened, so the developer and Claude stay in sync. Holds the queues and `current-state.md`. Lives at `state/` under the playbook repo root (a sibling of `project/`, not inside it) so it stays external to and consistent across worktrees.

## Queues

`state/tickets/` has six pipeline queue directories, in order, plus two side pens:

`todo/` → `in-progress/` → `agent-review/` → `human-review/` → `merge-queue/` → `done/`

`blocked/` is a side pen. It is **not** a pipeline stage: it is where a ticket lands after its third failure (see **Failures**). A blocked ticket is parked, not retried: `pb:next` never picks it up. Only a human re-admits it by moving it back to `todo/` (`bun ../scripts/move.ts <id> todo` from `state/`), so nothing re-enters the autonomous loop without that explicit action.

`aborted/` is the other side pen, and is also **not** a pipeline stage. It is where the developer kills a ticket during `pb:review` (the `ab`/`abort` action): the work is abandoned and will not be done. Moving the ticket to `aborted/` sets its state to aborted (the queue it sits in is its status). The developer may add an optional reason note to the ticket's History first. Unlike a blocked ticket, an aborted ticket is a deliberate, terminal decision: it is **removed from `current-state.md`** entirely (the `aborted/` directory is its only record), its `**Failures:**` count is left untouched, and `pb:next` never touches it. Like `done/`, treat it as immutable history.

The arrow above is a ticket's **lifecycle** (the queues it travels through), not the order `pb:next` works them. Each turn `pb:next` processes the queues it drives in this **priority order**: `merge-queue/` → `agent-review/` → `todo/` → `in-progress/` (`human-review/` is left for the developer). The principle is *finish work nearest to done before starting anything new*: land approved tickets on main, then clear every review already in flight, and only then admit and implement new `todo/` work, so tickets keep flowing through to `human-review/` instead of piling up behind a backlog of unreviewed work. Full procedure in the [pb:next](../.claude/commands/pb/next.md) skill.

`human-review/` is worked by `pb:review` as a **review loop**: it lists the reviewable tickets numbered from 1 and asks which to review, the developer selects one by number or name, is walked through it and resolves it (approve, reject, skip, abort), then the numbered list and question return for the next selection. The loop repeats until the developer stops or the queue is empty, so they choose the order and can stop any time. Walking through the currently selected ticket is itself an inner loop, the **inspect loop**: a numbered menu of ways to examine the work (show the screenshots, run it by hand, start the app for them, run the automated tests, show or read the doc changes, show or view the code diff), which Claude either shows the developer how to do or does for them (describing what it will do first), repeating until they resolve the ticket. So the review loop (select a ticket) contains the inspect loop (examine that ticket). Full procedure in the [pb:review](../.claude/commands/pb/review.md) skill.

- Each queue holds one directory per ticket, named by its ID (`todo/<id>/`).
- The ticket directory (`index.md`, `detail.md`, and an `evidence/` subdir) moves between queues as a unit, so the ticket and its evidence stay together end to end and land in `done/<id>/`.
- List a queue with `ls state/tickets/<queue>/` (e.g. `ls state/tickets/todo/`); the directory names are the IDs, so this shows queue contents without opening files.
- Move tickets with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`). The agent decides when; the script only moves the directory and the agent updates `current-state.md`.
- `current-state.md` is an overview of the current state of the process and is derived from the state of the queues. The AI or developer can check this file to see progress, state, what's blocked. It's lightweight, easy to read and scan.
- The state repo is a git repo and every significant change is committed, so its history is an audit log of how each ticket moved through the pipeline. The mutation scripts (`move`, `setup-ticket`, `fail-ticket`, `reset-failures`) commit automatically (ticket-scoped, lock-safe). For a hand edit (a `current-state.md` update, a newly created ticket) the agent commits it immediately with `bun ../scripts/commit-state.ts "<message>" <pathspec>`. Because script commits are ticket-scoped, evidence and History notes written before a `move.ts` are captured by that move's commit, so they need no separate commit. (A state repo created before this existed is not yet a git repo; `commit-state.ts` skips with a warning until the developer runs `git init` in `state/`.)

## Spec and docs

In the project repo (`project/`):

- `docs/spec/` is the source of truth for app behaviour. The testing manual (`docs/testing-manual/`) mirrors its layout and IDs exactly; derived docs (how-it-works, user guide) follow from it.
- Edits can start from any surface (spec, derived doc, testing manual, code). Whichever changes first, the AI fans the change out to the rest. Conflicts resolve in the spec's favour.
- Each feature `index.md` carries two status fields: `**Spec:**` (Draft/Settled) and `**Implementation:**` (None/Partial/Complete); a retired feature adds `**Deprecated:**`.
- Ticket acceptance criteria are derived from the feature's `detail.md`, not invented in the ticket.

## Tickets

- `index.md` (brief) holds: `**ID:**`, `**Type:**`, `**Depends on:**`, `**Failures:**` (the failure count; see **Failures**), and a one-line description (the queue it sits in is its status). `detail.md` (full) holds: Description, Acceptance Criteria, Test Plan, Implementation Notes, Testing Notes, Notes, History. Shape: [templates/ticket-template/](../templates/ticket-template/).
- ID form: `{feature-id}-{n}`, where `n` increments per feature. Tickets not tied to a feature use a `misc`/`infra` prefix. The `**ID:**` field is the source of truth; the directory name mirrors it.
- Where possible, number `n` in order of execution: a dependent ticket gets a higher number than the tickets it depends on. The number is a hint at reading order, not the enforcement mechanism. `**Depends on:**` is what actually gates execution.
- Refuse to implement a ticket with no acceptance criteria.
- A Test Plan is required. For tickets with no testable behaviour, use `N/A: <reason>` with a Manual Verification section. Nothing reaches `merge-queue/` without a check.
- Dependent tickets cannot start until their dependencies are merged.
- A human rejection is not a failure: notes are appended to History and the ticket returns to `todo/` for rework with its `**Failures:**` count reset to 0 (`reset-failures.ts`).
- `Debug` and `Fix` are special types that change agent-review behaviour (see `pb:debug`).

## Failures

A failure is any setback, whatever its source: a sub-agent times out or exhausts its turn budget, a check fails, a merge conflict can't be resolved, a Debug root cause is not proven, a Fix doesn't solve its problem, or post-merge checks fail on main. An **interruption** is not a failure and is never handled as one: a session or rate limit, the developer stopping the run, or the machine dying cuts the run off from outside and tells you nothing about the ticket, so it is recorded nowhere, counts toward no cap, and blocks no ticket (see [Interruption and resume](#interruption-and-resume)). Every failure is handled the same way:

1. **Record it.** Run `bun ../scripts/fail-ticket.ts <id>` (from `state/`) to increment the ticket's `**Failures:**` count, and add a History entry to its `detail.md` saying what failed and where the evidence is. Both, every time, so the ticket carries a complete deterministic record of everything that went wrong.
2. **Route by count.** Below three, the ticket returns to `todo/` and the loop retries it on a later pass. At three it moves to `blocked/`.
3. **Surface it.** Every block, environmental failure, and broken main is recorded in the top `⚠ Needs your action` section of `current-state.md`, which the developer reads directly or via `pb:status`. That section leads the file so anything needing the developer is the first thing seen; routine progress sits below it.
4. **Reconcile before the turn ends (invariant).** When a `pb:next` turn ends, `in-progress/` is empty: every ticket the parent admitted sits in a terminal queue (`agent-review/` on success, `todo/` or `blocked/` on failure). A sub-agent records and routes its own failure when it is alive to do so, but one that times out, dies, or returns a bare failure verdict cannot, so recording can never depend on it. The parent therefore re-runs `next-tickets.ts` as the final act of every turn: any ticket the report still shows in `in-progress/` (no sub-agent is working it now) is by definition an un-recorded failure, so the parent runs `fail-ticket.ts`, writes the History note, and routes it by count. The same applies to anything stranded in `agent-review/` by a dead review agent. A ticket is never left mid-stage.

A single failure never aborts the loop; the run continues with the other tickets. Two or more tickets failing the same stage or check in one run is an **environmental failure** and stops the run (see [Environmental failure](#environmental-failure)). Never work around a failure by switching parallel→serial or re-driving a ticket by hand.

**Exception (broken main):** if a merge lands but its post-merge checks then fail, the ticket goes to `todo/` (not `blocked/`) so the fix stays actionable, and the run stops because every later ticket builds on main.

## Environmental failure

An **environmental failure** is two or more tickets failing the same stage or check in one run. The shared cause is the environment, not the tickets (shared test fixtures, a contended resource, a broken tool), so retrying the tickets will not help: the run must stop and hand back. A session or rate limit is **not** an environmental failure even though it can stop several sub-agents at once: nothing about the environment-under-test broke, the run simply ran out of capacity, and the tickets are unharmed (see [Interruption and resume](#interruption-and-resume)).

Handle it in this order:

1. **Reconcile every failed ticket first** (record and route each by count, per **Failures** point 4). Handing back never means leaving a ticket mid-stage.
2. **Stop launching new work and hand back** to the developer. Never work around it by switching parallel→serial or re-driving tickets by hand.
3. **Record the cause** in the top `⚠ Needs your action` section of `current-state.md` as a `Run halted: environmental failure` entry naming the shared stage or check, the tickets involved, the suspected cause, and the evidence path. The tickets it hit usually return to `todo/` and leave no per-ticket trace, so this entry is the only record of why the run stopped.

## Interruption and resume

An **interruption** is the run being cut off from outside, not a ticket failing: a session or rate limit, the developer stopping the run, or the agent or machine dying. The work was fine; it just stopped. An interruption is never an environmental, systemic, or systematic failure.

Handle it like this:

1. **Don't record it.** Never run `fail-ticket.ts` for an interrupted ticket, never increment its `**Failures:**`, never route it to `blocked/`, and never write a `Run halted: environmental failure` entry. An interruption leaves no failure trace, because treating one as a failure would wrongly march an untouched ticket toward the block cap.
2. **Stop cleanly and leave the queues as they are.** The instant a session or rate limit is hit (the parent's own or a sub-agent's), stop launching new work and hand back. A ticket left mid-stage stays exactly where it is; do not reconcile it as a failure. If the parent still has capacity, it adds a one-line `Run interrupted (session limit); resume with pb:next` note to the top of `current-state.md`; if it doesn't, the queues themselves are the record and `pb:status` shows the in-flight state.
3. **Resume by re-running `pb:next`** when the developer says to. The queues are the durable state and every script is idempotent, so resuming is simply invoking `pb:next` again: it reads `next-tickets.ts` and continues from the live queue state. A ticket the interruption left mid-stage (in `in-progress/` or `agent-review/`) is **re-driven from where it sits, not failed**: the implement or review sub-agent just redoes that stage into a fresh `evidence/implementation-N/` or `review-N/`. This is the one case where a stranded ticket is re-driven rather than recorded as a failure (contrast the within-turn reconciliation in **Failures** point 4, which only fails strandings left by a sub-agent that returned alive this turn).

The "don't run `pb:next` again until the developer unblocks something" rule is about a **clean** finish, where forward progress is genuinely exhausted. After an interruption the opposite holds: re-running `pb:next` is exactly how the developer resumes.

## Templates

All scaffolding is under [templates/](../templates/) ([README.md](../templates/README.md), [index.md](../templates/index.md)):

- [templates/project/](../templates/project/): project repo scaffold. Copied by `pb:bootstrap:new`.
- [templates/state/](../templates/state/): state repo scaffold. Copied by `pb:bootstrap:*`.
- [templates/feature-template/](../templates/feature-template/): feature `index.md` + `detail.md`. Copied by `pb:plan`.
- [templates/ticket-template/](../templates/ticket-template/): ticket `index.md` + `detail.md`. Copied by `pb:add`.
- [templates/commit-template/](../templates/commit-template/): commit format. Copied and filled out when making a commit (see [Commits](#commits)).

## Development loop

Rhythm: check `current-state.md`, run a skill, repeat. Skills (in `.claude/commands/pb/`):

| Skill | Purpose |
|---|---|
| `pb:help` | Explain the process, bootstrap, the loop, skills, and queues |
| `pb:status` | Summarise queue state, recommend next skill |
| `pb:board` | Bare listing of every queue and its tickets (no narrative) |
| `pb:plan` | Update spec, docs, testing manual; queue tickets |
| `pb:docs` | Write/update docs; queue tickets |
| `pb:add` | Create a ticket in `todo/` |
| `pb:next` | Pick up to 10 unblocked tickets, implement in parallel |
| `pb:review` | Walk the developer through `human-review/` |
| `pb:unblock` | Re-admit blocked tickets: reset their failures and move them back to `todo/` |
| `pb:debug` | File a Debug ticket to prove a root cause, then spawn a Fix ticket |
| `pb:customize` | Tune the project's enforced rules in `project/docs/rules/` |
| `pb:reset` | Unwind a crashed/abandoned run: requeue in-progress, tear down worktrees |

## Ticket completion criteria

Each stage carries **ticket completion criteria**: the observable state that marks it done (files in the right queues, checks green, evidence on disk, commits made). The criteria also include an **abort condition** (a turn count or a repeated-failure signal). The criteria are plain text in the agent's prompt, not a separate enforcement mechanism; what actually gates a stage is the end-of-turn reconciliation in `pb:next` (re-run `next-tickets.ts`, and `in-progress/` must be empty), backed by the evidence the criteria demand being on disk.

`pb:next` uses ticket completion criteria in three places: its top-level loop condition (stops when forward progress is exhausted) and a per-ticket sub-agent's criteria for each of merge / implement / agent-review, each run in the ticket's worktree. Exact text lives in the [pb:next](../.claude/commands/pb/next.md) skill. To interrupt, stop the run; `pb:status` shows the live state from the queues.

When a sub-agent cannot meet its completion criteria, the ticket is recorded and routed per **Failures** above, the loop never works around a failure, and an environmental failure stops the whole loop (see [Environmental failure](#environmental-failure)).

## Checks

A **check** is any pass/fail verification of the work. Every check has a boolean result; they differ only in how the verdict is reached:

- **Deterministic**: a command produces the verdict (compile, lint, format, unit, smoke, e2e). No discretion.
- **Judgement**: an agent analyses the work against a named rule and decides (anything in `project/docs/rules/`, plus `CLAUDE.md` files in the project repo): docs current after a code change, rule conformance, a fix being the minimal change. Discretion required.

The two are interchangeable in the pipeline. What differs is the evidence: a deterministic check captures command output; a judgement check captures the agent's written assessment pointing at the rule and the code.

**Who evaluates, and when.** Checks run inside the `pb:next` sub-agents, in the ticket's worktree:

- Implement and merge stages run the deterministic checks (compile, lint, tests).
- Agent-review is **review-only** and re-verifies independently; the **Agent review** section covers exactly what it does.
- A ticket's completion criteria require the evidence on disk before the ticket moves on; the developer sees the same evidence in `pb:review`.

**Every check result records the same fields**, whatever its kind:

- **Check**: what was verified (e.g. `unit tests`, `docs/rules/documentation.md`).
- **Method**: how it was performed (the command run, or the rule analysed).
- **Result**: pass or fail.
- **Basis**: why, the output read or the reasoning that decided it.
- **Fix notes**: on fail, what to change.

## Agent review

Agent-review is the automated gate before human review. It is **review-only**: the sub-agent makes no code edits, commits nothing, and its sole writes are to the ticket's own state (move the ticket directory, capture check output to its `evidence/`, and on rejection a History note plus a Failures increment). It never writes `current-state.md`; the parent reflects the outcome there after the turn.

For each review pass N it:

1. **Re-runs the deterministic checks** fresh in the worktree (lint, format, unit tests, smoke tests, and any other project checks), each in the foreground, capturing full output to `evidence/review-N/`. It trusts no earlier run: a sub-agent's report is not a verified result.
2. **Runs the judgement checks:** reads every rule in `project/docs/rules/`, the root and any scoped `CLAUDE.md` for directories touched, and the docs required by `documentation.md`, and writes a pass/fail assessment (rule named, verdict, reasoning) to `evidence/review-N/`.
3. **Reviews the committed diff hunk by hunk** against the acceptance criteria, confirming every change is required to implement the ticket, and captures that assessment to `evidence/review-N/`. Any change that is not required, whatever its nature (committed evidence-collection code being the leading example), fails the review.
4. **Resolves**, writing only to the ticket's state: on **pass** (every check passes and every change is justified) it moves the ticket from `agent-review/` to `human-review/`; on **fail** (any check fails or any change is unjustified) it records a History note in `detail.md`, runs `bun ../scripts/fail-ticket.ts <id>` (from `state/`), and routes per **Failures** (back to `todo/` for the implement stage to redo, or `blocked/` at the third failure). It never fixes the work it judges.

Debug and Fix tickets vary step 4 (see `pb:debug`).

## Verification and evidence

Never claim a check passes on confidence. Before claiming, every agent at every stage:

1. **Identify** the exact command that proves the claim.
2. **Run** it fresh (never reuse a prior or cached run).
3. **Read** the full output, including exit code and failure count.
4. **Confirm** the output supports the claim.
5. **Capture** the output to the current pass's evidence subdir (`evidence/implementation-N/` while implementing, `evidence/review-N/` while reviewing), then claim and point at it.

For a judgement check there is no command: the agent reads the rule and the code in place of steps 1-3, and captures its written assessment (rule named, verdict, reasoning) as the evidence.

Confidence is not evidence: no claim of pass without a fresh run captured to `evidence/`. Passing earlier ≠ passing now; a sub-agent's report ≠ a verified result. Evidence (`unit.txt`, `smoke.txt`, `e2e.txt`, `screenshots/`, transcripts) travels in the ticket directory and is required by a ticket's completion criteria before a ticket moves on.

**One evidence subdir per pass.** Each trip through implement and review captures into its own numbered subdir, so the full round-trip history is preserved rather than overwritten:

```
<ticket>/
  evidence/
    implementation-1/   # first implement pass
    review-1/           # first review pass
    implementation-2/   # re-implemented after review-1 rejected it
    review-2/           # second review pass
    ...
    merge/              # post-merge checks on main
```

An agent allocates its subdir by taking one more than the highest existing number for its kind: the first implement pass writes `implementation-1/`, the next `implementation-2/`, and likewise for `review-N/`. The merge stage captures its post-merge checks to `evidence/merge/`. Within a subdir the files are as before (`unit.txt`, `smoke.txt`, `e2e.txt`, `screenshots/`, judgement write-ups, transcripts).

**Evidence never enters `project/`.** Evidence is a process artefact: it lives only in the ticket's `evidence/` subdir in the state repo, never in the project repo. Collect it however works (ad-hoc scripts, throwaway specs, manual runs) so long as it needs **no committed change to `project/`**. Never produce a screenshot by committing a test, a helper, or env plumbing (e.g. a `*_EVIDENCE_DIR` switch) to the project tree, and never commit capture code. Any capture script you write lives outside the project tree (in the ticket's `evidence/` dir or a temp dir) and is discarded. A `project/` commit contains only the changes that implement the ticket; agent-review enforces this by diffing the commits (see **Checks**).

**Run checks in the foreground.** A sub-agent runs each check in the foreground and blocks until it returns an exit code, within its turn budget. Never launch a check (especially a long one like e2e) in the background and end the turn waiting to be woken: that stalls silently and makes no progress. Either the check completes this turn, or the agent hits its turn limit and the ticket is blocked. A stall must become a visible failure, not an idle wait.

## Commits

Every commit follows one template: [templates/commit-template/commit-template.txt](../templates/commit-template/commit-template.txt). Read it when committing; its comments carry the full field-by-field guidance (subject form, body, `Type:`, `Ticket:` trailer).
