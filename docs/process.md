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
2. Launch Claude Code from the playbook repo root. (`git` (>= 2.48, for native relative-path worktrees), `bun`, and Claude Code are assumed already installed on the host.)

**Host + VM**:
1. On the host, clone the playbook.
2. Spin up the VM (Multipass or similar) and share the host's playbook repo into it.
3. In the VM: `scripts/install-prereqs.sh` (prerequisites; installs the latest git, needed for relative-path worktrees).
4. In the VM, install whatever the project needs to build, test, and run.
5. In the VM, launch Claude Code from the playbook repo root.

## Bootstrap

Once per project, on host or VM. Already bootstrapped? Don't run it again; start the loop with `pb:status` or `pb:next`.

- `pb:bootstrap:new`: for a greenfield project. Interviews the developer, scaffolds both repos into `project/` and `state/` (following the starter instructions for this kind of project first, when the developer passes them), then writes each template doc in turn (`CLAUDE.md`, setup, development, architecture, and the rules) from the interview answers, so every one has a good first version. The spec and testing manual stay as template stubs. Leaves empty queues ready to run.
- `pb:bootstrap:existing`: for an existing project. Clones the project into `project/`, creates the state repo at `state/`, and confirms a green test baseline. It **assumes the project's documentation is already complete**: it does not analyse for or report missing docs and queues no doc work (the only ticket it may create is one to get a failing suite green).

## Repos

Three repos, each a separate concern:
- **Playbook** (the playbook repo root) describes the AI development process including skills, templates, and scripts that drive every project. The repo this file lives in. Playbook is cloned once for each project; launch Claude Code from its root.
- **Project repo** is the product: the code being built and its docs. Lives at `project/` under the playbook repo root. No particular docs are required. A project may keep a `CLAUDE.md`, a spec (`docs/spec/`), a testing manual (`docs/testing-manual/`), rules (`docs/rules/`), a roadmap, and other guides; whatever docs and rules it keeps are respected and kept current with the code. Where a spec is kept, each feature lives under `docs/spec/<id>/` as an `index.md` and a `detail.md`.
- **State repo** manages the state of the process: it records what is happening, will happen, and has happened, so the developer and Claude stay in sync. Holds the ticket queues. Lives at `state/` under the playbook repo root (a sibling of `project/`, not inside it) so it stays external to and consistent across worktrees.

## Queues

`state/tickets/` has five pipeline queue directories, in order, plus `conflicts/` and two side pens:

`todo/` → `in-progress/` → `human-review/` → `merge-queue/` → `done/`

`conflicts/` is a re-entry pen hanging off `merge-queue/`, for an approved ticket whose branch will not merge cleanly onto the current main because main moved under it. It is not a side pen: **`pb:next` drains it itself, first, ahead of every other queue**, and no human is involved. Main is merged into the ticket's branch in its existing worktree, the ticket is re-verified and rejoins `merge-queue/` directly. It never goes to `todo/` (nothing is wrong with the work, so there is nothing to re-implement) and it never returns to `human-review/` (the developer already approved it; merging main needs re-verification, not a re-decision). A ticket whose checks fail on a merge train also goes to `conflicts/`, where its checks are fixed.

`backlog/` is a side pen for work captured but not yet a contender for implementation. It is **not** a pipeline stage: `pb:next` never reads it. Pull tickets to `todo/` explicitly via `pb:promote` or `move.ts` when ready to build.

`aborted/` is the other side pen, and is also **not** a pipeline stage. It is where the developer kills a ticket during `pb:review` (the `ab`/`abort` action): the work is abandoned and will not be done. Moving the ticket to `aborted/` sets its state to aborted (the queue it sits in is its status). The developer may add an optional reason note to the ticket's History first. An aborted ticket is a deliberate, terminal decision: the `aborted/` directory is its only record, and `pb:next` never touches it. Like `done/`, treat it as immutable history.

The arrow above is a ticket's **lifecycle** (the queues it travels through), not the order `pb:next` works them. Each turn `pb:next` processes the queues it drives in this **priority order**: `conflicts/` → `merge-queue/` → `todo/` → `in-progress/` (`human-review/` is left for the developer). The principle is *finish work nearest to done before starting anything new*: merge main into the approved tickets that missed the last train, land approved tickets on main, and only then admit and implement new `todo/` work. `conflicts/` is first because its tickets are nearest of all to done, and because every turn main drifts further from them makes merging main into them worse. Full procedure in the [pb:next](../.claude/commands/pb/next.md) skill.

`human-review/` is worked by `pb:review` as a **review loop**: it lists the reviewable tickets numbered from 1 and asks which to review, the developer selects one by number or name, is walked through it and resolves it (approve, reject, skip, abort), then the numbered list and question return for the next selection. On selecting a ticket, Claude prints a list of any **prior human rejections** (each with a very brief note on how it was subsequently rectified), then the ticket's **summary card** (its name, description, changed-file and screenshot counts, evidence pass, test results, and inspect menu), so the developer sees what the ticket is and how it has already been sent back before inspecting the work. The card is a short summary; the full detail (every changed file, every screenshot) is behind the inspect menu, opened on demand, so the developer is not buried in it up front. The loop repeats until the developer stops or the queue is empty, so they choose the order and can stop any time. Walking through the currently selected ticket is itself an inner loop, the **inspect loop**: a numbered menu of ways to examine the work (show the screenshots, run it by hand, start the app for them, run the automated tests, show or read the doc changes, show or view the code diff), which Claude either shows the developer how to do or does for them (describing what it will do first), repeating until they resolve the ticket. So the review loop (select a ticket) contains the inspect loop (examine that ticket). Full procedure in the [pb:review](../.claude/commands/pb/review.md) skill.

- Each queue holds one directory per ticket, named by its ID (`todo/<id>/`).
- The ticket directory (`index.md`, `detail.md`, and an `evidence/` subdir) moves between queues as a unit, so the ticket and its evidence stay together end to end and land in `done/<id>/`.
- List a queue with `ls state/tickets/<queue>/` (e.g. `ls state/tickets/todo/`); the directory names are the IDs, so this shows queue contents without opening files.
- Move tickets with `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`). The agent decides when; the script only moves the directory, and the queue is the record.
- The queues are the source of truth for process state. There is no separate maintained summary file: `pb:status` summarises the live queues on demand (progress and what's in flight) and `pb:board` lists them.
- The state repo is a git repo and every significant change is committed, so its history is an audit log of how each ticket moved through the pipeline. The mutation scripts (`move`, `setup-ticket`) commit automatically (ticket-scoped, lock-safe). For a hand edit (e.g. a newly created ticket) the agent commits it immediately with `bun ../scripts/commit-state.ts "<message>" <pathspec>`. Because script commits are ticket-scoped, evidence and History notes written before a `move.ts` are captured by that move's commit, so they need no separate commit. (A state repo created before this existed is not yet a git repo; `commit-state.ts` skips with a warning until the developer runs `git init` in `state/`.)
- **When the state repo has a remote, push after committing.** Check with `git -C state remote`; if it names a remote, follow every state commit with `git -C state push`. The state repo is gitignored by the playbook and is not carried by any other clone, so until it is pushed the queues, the evidence and the audit trail exist on one machine only, and nothing else in the process backs them up. Push after the commit that ends a piece of work (a ticket moved, a ticket created, a review recorded), not after each script-level commit inside a run. A push that is refused (no network, no upstream, a non-fast-forward) is reported to the developer and left alone; never force it, and never reset or rewrite state history to make it go through. When `git -C state remote` names nothing there is nowhere to push, so committing is the whole duty; suggest the developer create a remote if they want the state to survive the machine.

## Docs

In the project repo (`project/`):

- No particular documents are required. Keep whatever documentation the project has (README, spec, testing manual, how-it-works, guides) in sync with the code.
- Edits can start from any surface (a doc or the code). Whichever changes first, the AI fans the change out to the rest.
- Where the project keeps a spec, `docs/spec/` is the source of truth for app behaviour, the testing manual (`docs/testing-manual/`) mirrors its layout and IDs, derived docs follow from it, and any conflict resolves in the spec's favour.
- Each feature `index.md` carries two status fields: `**Spec:**` (Draft/Settled) and `**Implementation:**` (None/Partial/Complete); a retired feature adds `**Deprecated:**`.
- Ticket acceptance criteria are derived from the feature's `detail.md` where a spec exists, otherwise from the ticket's description and the developer's intent; not invented.

## Tickets

- `index.md` (brief) holds: `**ID:**`, `**Type:**`, `**Depends on:**`, optional `**Priority:**` (lower = sooner; default `100` when absent; tie-break by ID among actionable `todo/` tickets), optional `**Platforms:**` (`linux`, `darwin`, `win32`; a locked ticket enters `in-progress/` only on one of those platforms; absent means any), and a one-line description (the queue it sits in is its status). `detail.md` (full) holds: Description, Acceptance Criteria, Test Plan, Implementation Notes, Testing Notes, Notes, History. Shape: [templates/ticket-template/](../templates/ticket-template/).
- ID form: `{feature-id}-{n}`, where `n` increments per feature. Tickets not tied to a feature use a `misc`/`infra` prefix. The `**ID:**` field is the source of truth; the directory name mirrors it.
- Where possible, number `n` in order of execution: a dependent ticket gets a higher number than the tickets it depends on. The number is a reading-order hint only; `**Depends on:**` gates execution and `**Priority:**` orders actionable `todo/` tickets for `pb:next`.
- Before writing any new ticket directory, the creating skill **always** asks where it should land (no default):
  ```
  Where should this ticket go?
  1. todo, ready for pb:next to pick up
  2. backlog, captured for later; pull to todo when ready
  ```
  Accept `1`/`2`, or the words `todo`/`backlog`. `pb:plan:break` and `pb:docs` ask once per batch. `pb:debug` is the exception (Debug tickets always land in `todo/`).
- Refuse to implement a ticket with no acceptance criteria.
- A Test Plan is required. For tickets with no testable behaviour, use `N/A: <reason>` with a Manual Verification section. Nothing reaches `merge-queue/` without a check.
- Dependent tickets cannot start until their dependencies are merged.
- A human rejection: notes are appended to History and the ticket returns to `todo/` for rework.
- A ticket's `**Type:**` picks its in-progress stages (see **In-progress stages**).

## When something goes wrong

A ticket never fails. It never counts setbacks, never moves backwards on its own and is never parked.

- A stage keeps working until its instructions are met. A failing check is work for it to fix.
- A sub-agent that returns without finishing (it timed out, died or gave up) is spawned again for the same stage, starting from the worktree as it is.
- A ticket whose checks fail on a merge train goes to `conflicts/`, where main is merged into it and its checks are fixed.
- **Environment problem.** When a worktree setup or dependency install fails, or two or more tickets hit the same error from a cause outside the tickets (shared test fixtures, a contended resource, a broken tool), the run stops and hands back. **Attempt no workaround of any kind:** no alternative install path, no substitute toolchain, no borrowing another worktree's state, no patching the environment. Every ticket stays where it sits. The chat report `Run halted: environment problem` names the check and error, the tickets, the suspected cause and the evidence path. The developer fixes the environment and re-runs `pb:next`.
- **Broken main.** If a merge lands and a check on main then fails, the landed tickets stay done and the run stops, because every later ticket builds on main. Fixing main is a new ticket.
- Never work around a problem by switching parallel to serial or re-driving a ticket outside these rules.

## Interruption and resume

An **interruption** is the run being cut off from outside: a session or rate limit, the developer stopping the run, or the agent or machine dying. The work was fine; it just stopped. An interruption is never an environment problem.

Handle it like this:

1. **Don't treat it as an environment problem.** Never write a `Run halted: environment problem` entry for it.
2. **Stop cleanly and leave the queues as they are.** The instant a session or rate limit is hit (the parent's own or a sub-agent's), stop launching new work and hand back. A ticket left mid-stage stays exactly where it is. It states in chat that the run was interrupted and to resume with `pb:next`; the queues themselves are the durable record and `pb:status` shows the in-flight state.
3. **Resume by re-running `pb:next`** when the developer says to. The queues are the durable state and every script is idempotent, so resuming is simply invoking `pb:next` again: it reads `next-tickets.ts` and continues from the live queue state. A ticket the interruption left mid-stage (in `in-progress/`) is **re-driven from where it sits**: it starts again at the first stage for its type, which picks up the work already in the worktree, into a fresh `evidence/implementation-N/`.

The "don't run `pb:next` again until the developer unblocks something" rule is about a **clean** finish, where forward progress is genuinely exhausted. After an interruption the opposite holds: re-running `pb:next` is exactly how the developer resumes.

## Templates

All scaffolding is under [templates/](../templates/) ([README.md](../templates/README.md), [index.md](../templates/index.md)):

- [templates/project/](../templates/project/): project repo scaffold. Copied by `pb:bootstrap:new`.
- [templates/state/](../templates/state/): state repo scaffold. Copied by `pb:bootstrap:*`.
- [templates/feature-template/](../templates/feature-template/): feature `index.md` + `detail.md`. Copied when a feature spec is authored.
- [templates/ticket-template/](../templates/ticket-template/): ticket `index.md` + `detail.md`. Copied by `pb:add`.
- [templates/commit-template/](../templates/commit-template/): commit format. Copied and filled out when making a commit (see [Commits](#commits)).

## Development loop

Rhythm: run `/pb:status`, run a skill, repeat. The developer drives that rhythm: a skill runs only when the developer explicitly invokes it or tells you in plain words to run that specific skill. Never invoke a skill on your own initiative, and never let one skill auto-invoke another (a skill's "Next" section *recommends* the next skill; it does not run it). Describing a problem or asking you to "figure it out" is not an instruction to invoke a skill. Skills (in `.claude/commands/pb/`):

| Skill | Purpose |
|---|---|
| `pb:help` | Explain the process, bootstrap, the loop, skills, and queues |
| `pb:status` | Summarise queue state, recommend next skill |
| `pb:board` | Bare listing of every queue and its tickets (no narrative) |
| `pb:plan:break` | Break a written plan into dependency-linked tickets |
| `pb:todo:break` | Break the project's todo list into dependency-linked tickets |
| `pb:docs` | Write/update docs; queue tickets |
| `pb:add` | Create a ticket in `todo/` or `backlog/` |
| `pb:next` | Pick up to 10 unblocked tickets, implement in parallel |
| `pb:next:preview` | Say what `pb:next` would do, without doing it |
| `pb:review` | Walk the developer through `human-review/` |
| `pb:promote` | Pull tickets from `backlog/` to `todo/` |
| `pb:rank` | Set or change `**Priority:**` on tickets in `todo/` or `backlog/` |
| `pb:platforms` | Set or clear `**Platforms:**` on tickets in `todo/` or `backlog/` |
| `pb:debug` | File a Debug ticket to prove a root cause, then spawn a Fix ticket |
| `pb:customize` | Tune the project's enforced rules in `project/docs/rules/` |
| `pb:reset` | Unwind a crashed/abandoned run: requeue in-progress, tear down worktrees |

**`pb:next` never stops while there is work.** Invoked, it prints a `/goal` for the developer to paste and stops. Under that goal it runs until forward progress is exhausted and never stops to ask a question or for a decision. A sub-agent that asks, or says it is blocked, is sent back to decide or unblock itself, and records the decision in the ticket's History and its commit message.

## Ticket completion criteria

Each stage carries **ticket completion criteria**: the observable state that marks it done (files in the right queues, checks green, evidence on disk, commits made). The criteria are plain text in the agent's prompt, not a separate enforcement mechanism; a stage that returns without meeting them is run again, and the evidence the criteria demand must be on disk.

`pb:next` uses ticket completion criteria in three places: its top-level loop condition (stops when forward progress is exhausted) and a per-ticket sub-agent's criteria for each of merge / implement, each run in the ticket's worktree. Exact text lives in the [pb:next](../.claude/commands/pb/next.md) skill. To interrupt, stop the run; `pb:status` shows the live state from the queues.

When a sub-agent does not meet its completion criteria, its stage runs again; an environment problem stops the whole loop (see [When something goes wrong](#when-something-goes-wrong)).

## Checks

A **check** is any pass/fail verification of the work. Every check has a boolean result; they differ only in how the verdict is reached:

- **Deterministic**: a command produces the verdict (compile, lint, format, unit, smoke, e2e). No discretion.
- **Judgement**: an agent analyses the work against a named rule and decides (anything in `project/docs/rules/`, plus `CLAUDE.md` files in the project repo): docs current after a code change, rule conformance, a fix being the minimal change. Discretion required.

The two are interchangeable in the pipeline. What differs is the evidence: a deterministic check captures command output; a judgement check captures the agent's written assessment pointing at the rule and the code.

**Who evaluates, and when.** Checks run inside the `pb:next` sub-agents, in the ticket's worktree:

- Implement and merge stages run the deterministic checks (compile, lint, tests). The rules check stage runs the judgement checks.
- A ticket's completion criteria require the evidence on disk before the ticket moves on; the developer sees the same evidence in `pb:review`.

**Every check result records the same fields**, whatever its kind:

- **Check**: what was verified (e.g. `unit tests`, `docs/rules/documentation.md`).
- **Method**: how it was performed (the command run, or the rule analysed).
- **Result**: pass or fail.
- **Basis**: why, the output read or the reasoning that decided it.
- **Fix notes**: on fail, what to change.

## In-progress stages

A ticket in `in-progress/` goes through the stages listed for its type in [ticket-types/](ticket-types/), in order, each run by its own sub-agent in the ticket's worktree. The file is the one named after the ticket's `**Type:**`, or [work.md](ticket-types/work.md) when the type has none: Work is the default type, and Fix uses it too. The Work stages are:

`dev` → `test` → `rules check` → `commit`

- **Dev** writes the code, tests (unit tests for 100% coverage, plus smoke tests, e2e tests or both) and docs, following the rules, until every test passes.
- **Test** runs every check and fixes any failure properly, until every check passes.
- **Rules check** checks every rule that applies, fixes every breach, and runs the tests until they pass.
- **Commit** runs every check one final time, fixes any failure, commits and moves the ticket to `human-review/`.

A Debug ticket instead runs `investigate` → `prove root cause` ([debug.md](ticket-types/debug.md)) and ends in `done/` with a new Fix ticket. No stage sends the ticket back, so a ticket never goes round a loop between stages.

**UI changes always need screenshots.** Any change with an observable effect on the UI is never committed unless the evidence includes screenshots of every affected state, in light **and** dark when the app has a light/dark mode setting. An app with no such setting is screenshotted once, in the mode it shows by default, and that is not a missing screenshot. This explicitly includes a **removal**: deleting or hiding a view, page, component, or nav entry is a UI change, and its affected state is the *resulting* UI (e.g. the navigation without the deleted entry, the surviving pages still working). "There is nothing to capture because it was deleted" is not an acceptable reason, capture the after-state. The screenshots must live in the **latest** `implementation-N/` and be **captured fresh from that pass's code**: a re-implementation re-captures every required screenshot against its own commit, and copying or carrying them forward from an earlier pass is never allowed, even when the pass "alters no pixel" (see "Each pass is self-proving"). Evidence from a previous version of the code does not prove the current code.

## Verification and evidence

Never claim a check passes on confidence. Before claiming, every agent at every stage:

1. **Identify** the exact command that proves the claim.
2. **Run** it fresh (never reuse a prior or cached run).
3. **Read** the full output, including exit code and failure count.
4. **Confirm** the output supports the claim.
5. **Capture** the output to the current pass's evidence subdir (`evidence/implementation-N/` while implementing), then claim and point at it.

For a judgement check there is no command: the agent reads the rule and the code in place of steps 1-3, and captures its written assessment (rule named, verdict, reasoning) as the evidence.

Confidence is not evidence: no claim of pass without a fresh run captured to `evidence/`. Passing earlier ≠ passing now; a sub-agent's report ≠ a verified result. Evidence (`unit.txt`, `smoke.txt`, `e2e.txt`, `screenshots/`, transcripts) travels in the ticket directory and is required by a ticket's completion criteria before a ticket moves on.

**One evidence subdir per pass.** Each implement pass captures into its own numbered subdir, so the history of every pass is preserved rather than overwritten:

```
<ticket>/
  evidence/
    implementation-1/   # first implement pass
    implementation-2/   # re-implemented after a human rejection
    ...
    merge/              # post-merge checks on main
```

An agent allocates its subdir by taking one more than the highest existing number for its kind: the first implement pass writes `implementation-1/`, the next `implementation-2/`. The merge stage captures its post-merge checks to `evidence/merge/`. Within a subdir the files are as before (`unit.txt`, `smoke.txt`, `e2e.txt`, `screenshots/`, judgement write-ups, transcripts).

**Each pass is self-proving, and its evidence is captured fresh.** Older passes are kept as history, but they are never consulted to fill a gap in a newer one. The **latest** `implementation-N/` must hold **all** the evidence needed to prove the **entire** change on its own, not just the part that pass altered: human review and the ticket card read only the latest pass, so anything missing from it counts as missing from the ticket (there is deliberately no fallback to an earlier pass). And every artifact must be **captured fresh from the code as it stands in that pass's commit**: screenshots and other evidence may never be copied, carried forward, or reused from an earlier `implementation-N/`, because evidence taken from a previous version of the code does not prove the current code. A re-implementation re-captures the whole required set into its own subdir even when its diff is a single line or touches no UI.

**Evidence never enters `project/`.** Evidence is a process artefact: it lives only in the ticket's `evidence/` subdir in the state repo, never in the project repo. Collect it however works (ad-hoc scripts, throwaway specs, manual runs) so long as it needs **no committed change to `project/`**. Never produce a screenshot by committing a test, a helper, or env plumbing (e.g. a `*_EVIDENCE_DIR` switch) to the project tree, and never commit capture code. Any capture script you write lives outside the project tree (in the ticket's `evidence/` dir or a temp dir) and is discarded. A `project/` commit contains only the changes that implement the ticket; the rules check stage removes any other change before the commit.

**Run checks in the foreground.** A sub-agent runs each check in the foreground and blocks until it returns an exit code. Never launch a check (especially a long one like e2e) in the background and end the turn waiting to be woken: that stalls silently and makes no progress. A stall must become a visible problem, not an idle wait.

## Commits

Every commit follows one template: [templates/commit-template/commit-template.txt](../templates/commit-template/commit-template.txt). Read it when committing; its comments carry the full field-by-field guidance (subject form, body, `Type:`, `Ticket:` trailer).
