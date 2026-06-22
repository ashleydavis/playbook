# pb:next Continuous In-Flight Pool

## Overview

`pb:next` currently drains the queues in pipeline order, one barrier per stage per turn: the parent spawns a batch of up to 10 implement sub-agents and waits for the whole batch before admitting more work. One slow ticket holds the other slots idle. This plan changes `pb:next` so it keeps the in-flight pool full: as soon as any ticket finishes a stage and frees a slot, the next eligible ticket starts, with no wait-for-the-batch barrier. The mechanism is a Claude Code **Workflow** script (the documented, deterministic orchestration primitive: [code.claude.com/docs/en/workflows.md](https://code.claude.com/docs/en/workflows.md)), driving a concurrency-limited worker pool that refills on completion. The parent runs `next-tickets.ts` between workflow phases (the workflow body itself has no filesystem access), so dependency readiness is recomputed after merges land.

## Issues
<!-- Leave empty, populated later by plan:check -->

## Steps

1. **Relax the cap in [scripts/next-tickets.ts](scripts/next-tickets.ts).** The artificial `todo + in-progress <= LIMIT` trim ([next-tickets.ts:84-94](scripts/next-tickets.ts#L84-L94)) exists only because the old loop hand-managed concurrency. The workflow pool now manages in-flight count, so `nextTickets()` must report **every** dependency-ready `todo` ticket, not a capped slice.
   - Remove the `todoBudget` calculation and the `todoReady.length >= todoBudget` break.
   - Keep the dependency-readiness filter (`deps.every((dep) => done.has(dep))`) unchanged.
   - Keep `inProgress`, `merge-queue`, and `agent-review` reported as full lists (unchanged).
   - Replace the exported `LIMIT` constant with an exported `POOL_SIZE = 10` (the workflow imports nothing from this file at runtime, but keep the canonical number in one place and reference it in the docstring and the workflow's `meta`).
   - Rewrite the top-of-file docstring: the cap is no longer applied here; `todo` is now "every actionable ticket, ordered by ID"; concurrency is bounded by the workflow pool.

2. **Create the workflow script [.claude/workflows/pb-next.js](.claude/workflows/pb-next.js).** A self-contained JS workflow (begins with the required `export const meta = {...}` literal). It receives the queue report via `args` (the parent runs `next-tickets.ts` and passes the JSON) and returns a structured outcome the parent uses to update `current-state.md`. Structure:
   - `meta`: `name: 'pb-next'`, `description`, `phases: [{title:'Merge'},{title:'Implement'},{title:'Review'}]`.
   - **`args` shape**: `{ mergeQueue: string[], poolItems: string[], agentReview: string[], poolSize: number }`. `poolItems` is `in-progress` tickets plus dependency-ready `todo` tickets (the parent concatenates them).
   - **Merge phase** (`phase('Merge')`): `parallel()` over `mergeQueue`, one `agent()` per id running the existing merge goal text from [next.md:53-55](.claude/commands/pb/next.md#L53-L55). Each agent calls `finalize-ticket.ts` and runs post-merge checks itself. This is a genuine barrier: merges can land dependencies into `done/`, and the broken-main rule means a post-merge failure must stop the run before any implement work starts. The phase returns per-ticket `{id, status: 'merged'|'conflict-failed'|'broken-main'|'timeout'}` via a `StructuredOutput` schema.
   - **Implement/Review pool** (`phase('Implement')` / `phase('Review')`): a hand-written concurrency-limited pool (plain JS) of size `args.poolSize` that pulls ids from `poolItems` and runs each through two sequential `agent()` stages, implement then agent-review, refilling the slot the instant a ticket finishes both stages or fails out. This is the core change: not `parallel()` (barrier) and not a fixed-list `pipeline()` (drains then stops), but a worker loop that keeps `poolSize` tickets active until the work-list is exhausted.
     - Implement stage: the implement goal text from [next.md:67-68](.claude/commands/pb/next.md#L67-L68), with the Debug-ticket exception ([next.md:73](.claude/commands/pb/next.md#L73)).
     - Review stage: the agent-review goal text from [next.md:77-78](.claude/commands/pb/next.md#L77-L78), with the Debug/Fix exceptions ([next.md:83-85](.claude/commands/pb/next.md#L83-L85)).
     - A stage that fails (agent records it via `fail-ticket.ts` and moves the ticket back to `todo/` or `blocked/`) drops the ticket from the pool and frees its slot; the pool continues. Each ticket returns `{id, stage, status, evidenceDir}`.
   - **`agentReview`-only tickets**: ids already in `agent-review/` at run start (from an interrupted run) enter the pool at the review stage only.
   - **Return value**: `{ merges: [...], tickets: [...] }`, every per-ticket outcome, so the parent can reflect moves and failures into `current-state.md` and detect a systemic failure (two or more tickets failing the same stage).

3. **Rewrite the Steps section of [.claude/commands/pb/next.md](.claude/commands/pb/next.md).** Replace the per-turn `/goal`-loop description ([next.md:41-89](.claude/commands/pb/next.md#L41-L89)) with the workflow-driven outer loop. The parent now:
   1. Runs `bun ../scripts/next-tickets.ts` from `state/` (Bash) to get the report. (The orientation rule at [next.md:24](.claude/commands/pb/next.md#L24), no filesystem exploration before the report, stays.)
   2. Invokes `Workflow({ name: 'pb-next', args: {...} })` with the report split into `mergeQueue`, `poolItems` (`in-progress` + ready `todo`), `agentReview`, and `poolSize` (10).
   3. On return, inspects the merge outcomes: if any is `broken-main`, records it, leaves the ticket in `todo/`, updates `current-state.md`, and **stops** (broken-main exception, [next.md:39](.claude/commands/pb/next.md#L39)).
   4. Re-runs `next-tickets.ts` and updates `current-state.md` for every ticket that moved or was created (Fix tickets spawned from proven Debug tickets included).
   5. Repeats the cycle while the fresh report still lists actionable work (retried tickets that returned to `todo/` under the failure cap reappear here) and no systemic failure was seen and the turn budget is not exhausted.
   - Add an explicit note: `pb:next` is a skill whose instructions direct the agent to call `Workflow`, which is the documented opt-in for the Workflow tool, so invoking it here is sanctioned and the parent must not ask the user first.
   - Preserve verbatim, moved into the new structure: the "When anything fails" section ([next.md:28-39](.claude/commands/pb/next.md#L28-L39)), the verification/evidence rule ([next.md:14](.claude/commands/pb/next.md#L14)), the `current-state.md`-is-parent-only rule ([next.md:26](.claude/commands/pb/next.md#L26)), and the Debug/Fix exceptions.
   - Update the "## Example" block ([next.md:91-102](.claude/commands/pb/next.md#L91-L102)) to show continuous replacement (a slow ticket not blocking new admissions).

4. **Update the reference docs to match the new mechanism.**
   - [handbook.md:133](handbook.md#L133): the diagram edge `"up to 10 in parallel"` → describe a refilling pool of 10 (e.g. `"pool of 10, refilled on completion"`).
   - [handbook.md:306](handbook.md#L306): the `/pb:next` description ("each turn processes ... picks up to 10 unblocked todo tickets ... runs a per-ticket sub-agent through each stage") → describe the workflow-driven continuous pool that keeps 10 in flight and refills as tickets finish.
   - [docs/process.md:111](docs/process.md#L111): the table row "Pick up to 10 unblocked tickets, implement in parallel" → "Keep up to 10 tickets in flight, refilling as each completes".
   - [docs/process.md:120](docs/process.md#L120): the `/goal` description still says `pb:next` uses a top-level loop goal and per-ticket sub-agent goals, update to reflect that orchestration is now a Workflow script and the per-ticket goals are the workflow's `agent()` stage goals; the deterministic loop replaces the model-driven `/goal` loop.
   - Leave the failure-handling and evidence sections in both docs unchanged (the rules are unchanged).

5. **Update [scripts/CLAUDE.md](scripts/CLAUDE.md)** `next-tickets.ts` bullet to state it now reports every actionable ticket (no concurrency cap applied), since the pool is enforced by the workflow.

## Unit Tests

Update [scripts/next-tickets.test.ts](scripts/next-tickets.test.ts):
- Replace any test asserting the `todo + in-progress <= LIMIT` trim with a test asserting **all** dependency-ready `todo` tickets are returned regardless of `in-progress` count (e.g. 15 ready todo tickets + 3 in-progress → all 15 reported in `todo`).
- Keep/confirm: dependency-readiness filtering (a ticket with an unmerged dependency is excluded; a ticket whose deps are all in `done/` is included).
- Keep/confirm: empty queues return `[]`; tickets sorted by ID.
- Confirm `POOL_SIZE` is exported and equals 10 (guards the canonical constant).

## Smoke Tests

Extend the scripts smoke suite (`bun run smoke` in [scripts/](scripts/)):
- Build a throwaway state tree with >10 ready `todo` tickets and a few `in-progress`, run `next-tickets.ts`, and assert the JSON `todo` array contains every ready id (no cap), `in-progress` is the full list, and a ticket with an unmerged dependency is absent.
- Note in the plan (not a test): the `pb-next.js` workflow's pool behaviour is orchestration over live sub-agents and is not deterministically smoke-testable from a shell; it is covered by the Human-facing run, not an automated smoke test.

## Verify

- From [scripts/](scripts/): `bun run test`, all unit tests pass, including the updated `next-tickets` tests.
- From [scripts/](scripts/): `bun run smoke`, all smoke tests pass, including the new uncapped-report check.
- `bun ../scripts/next-tickets.ts` runs clean from a `state/` fixture and emits valid JSON with the four expected keys.
- Confirm [.claude/workflows/pb-next.js](.claude/workflows/pb-next.js) parses: it begins with a pure-literal `export const meta`, uses only `agent()`/`parallel()`/`phase()`/`log()` and plain JS (no `Date.now()`/`Math.random()`, no filesystem APIs), and the `meta.phases` titles match the `phase()` calls.
- Grep `next.md`, `handbook.md`, `docs/process.md`, and `scripts/CLAUDE.md` for the old phrasings ("up to 10 in parallel", "picks up to 10", "implement in parallel", the `LIMIT` cap wording) and confirm none remain.

## Human Verification

Omitted per standing project instruction (no Human Verification steps in plans).

## Notes

- **Why a worker pool, not `pipeline()`:** `pipeline()` drains a fixed ticket list and stops; `parallel()` is a barrier. The user's requirement is "keep 10 in flight; when one finishes, start another." That is a concurrency-limited pool that pulls from a work-list and refills on completion, a few lines of plain JS in the workflow body, fully within the documented script API.
- **Effective in-flight number:** the Workflow runtime caps concurrency at `min(16, cpu_cores - 2)` ([workflows.md](https://code.claude.com/docs/en/workflows.md)). The script's pool size of 10 sits under that on a normal machine; on a low-core machine the runtime cap dominates and fewer than 10 run. This is acceptable and matches "as long as possible".
- **Open decision (for plan:check / the developer):** should the in-flight number stay 10, or move to the runtime's natural cap (up to 16) for maximum utilisation? The plan keeps 10 to preserve current behaviour; raising it is a one-constant change.
- **Merge phase stays a barrier** on purpose: merges can unblock `todo` dependencies, and a broken-main post-merge failure must halt the run before implement work begins. Only the implement/review stages become a refilling pool.
- **No async completion callback exists** for sub-agents (verified: [tools-reference.md](https://code.claude.com/docs/en/tools-reference.md), `TaskGet`/`TaskList` are poll-only). The Workflow runtime is what provides completion-driven refill without hand-rolled polling; this is the reason to use it rather than extend the prose loop.
- **Dependency dynamism within the implement pool is nil:** forward-flow tickets stop at `human-review/` and never reach `done/` during a run, so no new dependencies are satisfied mid-pool. Readiness only changes across the merge boundary, which the parent handles by re-running `next-tickets.ts` between workflow invocations.
- The earlier proposal to spawn sub-agents with `run_in_background: true` was discarded: that flag is on the **Bash** tool, not the Agent tool, and there is no async sub-agent completion event. The Workflow runtime replaces it.
