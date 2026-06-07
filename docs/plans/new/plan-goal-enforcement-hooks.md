# Make Goals Actually Enforce (Config-Driven Stop Hooks + Optional Orchestrator)

## Overview
The process relies on `/goal` to stop any agent claiming "done" without evidence, but as written it does not work. `/goal` is a user-typed slash command and a skill emitting `/goal` text in its output never invokes it; only one goal can be active per session, so the per-item sub-agent goals in `pb:next` cannot coexist with the parent loop goal; and the goal evaluator never reads the filesystem, so conditions phrased around on-disk state (`evidence/`, queue dirs) cannot be checked. The result: neither the parent loop nor the sub-agents are actually gated, and `next.md`'s four `/goal` blocks are inert prose.

This plan replaces the inert `/goal` text with the real mechanism `/goal` wraps: configured `Stop` hooks. It has a **shared foundation** (deterministic verification scripts plus real `.claude/agents/` sub-agent definitions that carry `maxTurns` and a frontmatter `Stop` hook), and then a **loop driver** for which the developer picks one of two options: **Option A** an in-session, sentinel-gated `Stop` hook in `settings.json`, or **Option B** an external shell orchestrator (`scripts/pb-loop.sh`) that drives the loop and invokes `claude` headless with the goal as needed, so no one ever types `/goal`. The sub-agent enforcement (foundation) is identical and required either way; the two options differ only in how the top-level "keep going until the queues drain" loop is continued.

## Issues
<Leave empty — populated later by plan:check>

## Steps

### Foundation (required for both options)

1. **Add `scripts/verify-stage.ts`** — the single deterministic completion check used by every sub-agent `Stop` hook.
   - CLI: `verify-stage.ts <stage> <id>`, run from `state/`, where `stage ∈ {implement, review, merge, debug}`.
   - It reads only the filesystem (queues + `evidence/`) and emits the hook decision JSON on stdout: `{"ok": true}` when the stage's success condition holds, otherwise `{"ok": false, "reason": "<what is still missing>"}`. It never throws on a normal "not done yet" state; it exits non-zero only on a usage/IO error.
   - Export the pure core `function verifyStage(stage, id, fs): VerifyResult` (where `fs` is an injectable reader: `queueOf(id)`, `latestEvidenceDir(id, prefix)`, `readEvidence(path)`) so it is unit-testable without a real repo. The CLI wraps it with a real `fs` reader rooted at `process.cwd()`.
   - Success conditions per stage (each requires the *observable* artifact, not an agent assertion):
     - `implement`: `id` is in `agent-review/`; an `evidence/implementation-N/` dir exists; its captured check outputs (`unit.txt`, plus `smoke.txt`/`e2e.txt` where the item declares them) exist, are non-empty, and end in a success marker (exit 0 / `PASS`).
     - `review`: `id` is in `human-review/` **or** back in `todo/` (a recorded rejection is a valid terminal outcome); an `evidence/review-N/` dir exists with the re-run check outputs captured.
     - `merge`: `id` is in `done/`; `evidence/merge/` exists with the post-merge check outputs captured and passing.
     - `debug`: `id` is in `agent-review/`; `detail.md` contains a root-cause write-up section; `evidence/` holds the proving artifact.
   - Reuse the queue-location helper already used by `next-items.ts`/`move.ts` (import it rather than re-deriving paths).

2. **Add `.claude/agents/` sub-agent definitions** — one per stage, replacing the inline prompt prose in `next.md`. Files: `pb-implement.md`, `pb-review.md`, `pb-merge.md`, `pb-debug.md`. Each uses YAML frontmatter + a Markdown body (the body becomes the system prompt, lifted verbatim from the matching prose block in `next.md`). Frontmatter per file:
   - `name`: `pb-implement` / `pb-review` / `pb-merge` / `pb-debug`.
   - `description`: one line naming when the parent should delegate to it.
   - `tools` / `disallowedTools`: `pb-review` and `pb-debug`-review path are read-only over `project/` (no `Edit`/`Write`/`NotebookEdit` against project files; `pb-review` makes no code changes per process rule). `pb-implement` and `pb-merge` keep write/Bash access.
   - `maxTurns`: the former "stop after N turns" abort, now enforced — `pb-implement: 20`, `pb-merge: 15`, `pb-review: 10`, `pb-debug: 20`.
   - `model`: optional cost routing (note in `## Notes`, default omitted so they inherit the session model).
   - `hooks.Stop`: a single `type: command` hook running `bun ../scripts/verify-stage.ts <stage> $ID` (the stage is fixed per file). A frontmatter `Stop` hook is auto-converted to `SubagentStop` and re-prompts the sub-agent with the `reason` when the check fails, so the sub-agent cannot return until `verify-stage.ts` says the item actually reached its terminal queue with evidence. Pass the item id into the hook via the documented hook input (`$ID` resolved from the sub-agent's environment / prompt; if env injection is unavailable, have the hook command read the single in-flight id from the sub-agent's working-dir marker written at admission).

3. **Rewrite `next.md` to spawn typed sub-agents instead of inline `/goal` text.**
   - Delete the four `/goal …` fenced blocks (lines ~50-52, ~58-60, ~70-72, ~84-86).
   - In each stage step, replace "spawn a sub-agent with: `/goal …`" with "spawn the `pb-<stage>` sub-agent (via the Agent tool, `subagent_type: pb-<stage>`) for `<id>`", keeping all the surrounding behavioural prose (merge script usage, review-only rule, evidence capture, Debug/Fix branching) intact — that prose now lives in the agent definitions' bodies, so trim `next.md` to a pointer plus the orchestration-only details the parent needs.
   - Keep the parent's reconciliation step (re-run `next-items.ts`, `fail-work-item.ts` stranded items) unchanged — it remains the trust boundary regardless of hooks.
   - Remove the `Use /goal clear …` line; replace with a pointer to whichever loop driver (Option A or B) is adopted.

4. **Update `process.md` "Goals" section (lines ~124-130).** Replace the description of `/goal` as a per-turn pass condition set in three places with the corrected model: sub-agent completion is enforced by each agent definition's `maxTurns` + frontmatter `Stop` hook (`verify-stage.ts`), which checks observable on-disk state; the top-level loop is driven by the chosen option (A or B). State explicitly that the evaluator/hook decision is deterministic and disk-based (via the script), not the model's say-so.

5. **Update `handbook.md` (human reference) goals section** to match `process.md`: explain why the old `/goal`-typed-in model did not work and how config-driven Stop hooks replace it. Keep it in the handbook's fuller prose style.

### Option A — in-session Stop hook (keeps interactive `pb:next`)

6. **Add `scripts/pb-stop-hook.ts`** — the parent loop continuation check, run as a `type: command` `Stop` hook from the repo root.
   - First check for the sentinel `state/.pb-next-active`. If it is absent, print `{"ok": true}` and exit immediately, so the hook is inert in every non-`pb:next` session (status/plan/review/etc.). This is what makes an always-installed `settings.json` hook safe.
   - If present, run the `next-items.ts` core: if `merge-queue`, `agent-review`, and `in-progress` are empty and `todo` has no actionable items, the loop is done — remove the sentinel and print `{"ok": true}`. Otherwise print `{"ok": false, "reason": "<remaining queues/items>"}` so the session keeps working.
   - Detect systemic-failure handback by reading the `Run halted: systemic failure` marker the skill writes to `current-state.md`; if present, remove the sentinel and return `{"ok": true}` (stop), so the loop hands back rather than spinning.

7. **Register the `Stop` hook in `.claude/settings.json`.** Add a `hooks.Stop` entry with one `type: command` hook calling `bun scripts/pb-stop-hook.ts` (sibling to the existing `permissions` key, not replacing it).

8. **Make `next.md` manage the sentinel.** As the skill's first action, create `state/.pb-next-active`; as its last action on clean exit and on systemic-failure handback, remove it. (The hook also removes it on completion, so removal is idempotent — use `rm -f`.)

9. **Update `reset.md`** to `rm -f state/.pb-next-active` as part of unwinding an interrupted run, so a crashed `pb:next` cannot leave the loop hook armed.

### Option B — external orchestrator shell script (no one types `/goal`)

10. **Add `scripts/pb-loop.sh`** — a thin orchestrator that owns only the top-level loop, delegating each turn's work to `claude` headless. It does **not** re-implement queue/failure logic (that stays in `pb:next`).
    - Loop: each iteration runs one `pb:next` turn headless, e.g. `claude -p "/pb:next"` (or a one-turn variant) launched from the playbook root, then re-runs `bun ../scripts/next-items.ts` (from `state/`) to read the queue state.
    - Continue while any driven queue (`merge-queue`, `agent-review`, `in-progress`, actionable `todo`) is non-empty, the turn count is under a cap (default 50, overridable by `$1`), and no `Run halted: systemic failure` marker is present in `current-state.md`.
    - Set the loop goal *for the headless invocation* with `claude -p "/goal <loop condition> \n /pb:next"` so each turn carries the same top-level pass condition without anyone typing it; the per-sub-agent enforcement comes from the Step 2 agent definitions, unchanged.
    - On exit, print a one-line summary (turns run, why it stopped: drained / cap / systemic) and exit non-zero on systemic-failure handback so a caller/CI can react.
    - Document required env: `claude` on PATH; run from the playbook root; relies on `state/` and `project/` siblings.
    - With Option B adopted, Steps 6-9 (the `settings.json` parent hook and sentinel) are **not** needed — the shell `while` loop replaces the in-session continuation hook. The foundation (Steps 1-5) is still required.

11. **Document the chosen driver in `process.md` and `handbook.md`.** Add a short "Driving the loop" note stating which option this project uses (A or B), and for B that the human runs `bash scripts/pb-loop.sh` instead of typing `/goal` then `/pb:next`.

### Cleanup

12. **Resolve the related `todo.md` lines.** Remove or mark done: the `/goal doesn't seem to be set …` block (lines ~9-11) and `How can I know if the goals are working or not?` (line ~16), pointing them at this plan.

## Unit Tests
- `verify-stage.ts` — `verifyStage()` for each stage: returns `ok:true` only when the item is in the correct terminal queue **and** the required evidence dir/files exist and end in a success marker; returns `ok:false` with a specific `reason` when the item is still in the source queue, when the evidence dir is missing, and when a captured check output ends in failure. Use an injected fake `fs` reader (no real repo).
- `verify-stage.ts` — `review` stage accepts both `human-review/` (pass) and `todo/` (recorded rejection) as terminal; rejects `agent-review/` (still mid-stage).
- `pb-stop-hook.ts` (Option A) — returns `ok:true` immediately when the sentinel is absent (inert); returns `ok:false` with remaining-work reason when sentinel present and queues non-empty; returns `ok:true` and clears the sentinel when all driven queues are empty; returns `ok:true` (stop) when the systemic-failure marker is present. Inject a fake queue-state and filesystem.

## Smoke Tests
Add `scripts/test/goal-hooks.smoke.sh` that builds a throwaway temp `state/` fixture and asserts the scripts' JSON output end to end (no `claude` invocation needed for the deterministic parts):
- Seed an item in `agent-review/` with a complete `evidence/implementation-1/` → `verify-stage.ts implement <id>` prints `{"ok": true}`.
- Same item with `unit.txt` ending in a failure marker → prints `{"ok": false, …}`.
- Item still in `in-progress/` (no evidence) → `{"ok": false, …}`.
- Option A: with `state/.pb-next-active` absent → `pb-stop-hook.ts` prints `{"ok": true}`; with it present and an item in `in-progress/` → `{"ok": false, …}`; drain the queues → `{"ok": true}` and assert the sentinel was removed.
- Assert each `.claude/agents/*.md` parses (valid YAML frontmatter, required `name`/`description`, a `hooks.Stop` command entry) via a small check in the script.

## Verify
The AI agent must run, in order, and capture output:
1. `bun test` (or the project's unit runner) over `scripts/` — all unit tests above pass.
2. `bash scripts/test/goal-hooks.smoke.sh` — exits 0, all assertions pass.
3. Type-check/compile the new/changed TypeScript: `bun run typecheck` (or `tsc --noEmit` over `scripts/`) — clean.
4. Validate JSON: `bun -e` (or `jq`) parse of `.claude/settings.json` (Option A) confirming the `Stop` hook entry is present and `permissions` is intact.
5. Validate every `.claude/agents/*.md` has parseable frontmatter with `name`, `description`, `maxTurns`, and a `hooks.Stop` entry (assert via the smoke script or a one-off node/bun check).
6. Grep `next.md` to confirm zero remaining `/goal ` blocks and that each stage step references `subagent_type: pb-<stage>`.
7. Option B only: run `bash scripts/pb-loop.sh` against the temp fixture with all queues already drained and assert it performs zero turns and exits 0 with the "drained" summary (a no-op smoke of the loop guard, without spawning real work).

## Human Verification
Omitted per the developer's standing instruction (no Human Verification steps in plans). All post-implementation checks are in **Verify** above and are AI-runnable.

## Notes
- **Why deterministic `type: command` hooks, not `type: prompt`/`type: agent`:** the completion conditions here (item in queue X, evidence files present and passing) are fully decidable from disk, so a command script is cheaper, faster, and not subject to the prompt evaluator's "cannot read files" limitation. `type: agent` hooks remain an option if a future condition needs judgement, but are not used here.
- **Why the per-sub-agent `/goal` could never have worked:** one goal per session + sub-agents share the session ⇒ the four-goal scheme is structurally impossible. The frontmatter `Stop` hook (converted to `SubagentStop`) is the only correct per-sub-agent equivalent.
- **A vs B trade-off:** A preserves the current interactive `/pb:next` UX with a single always-installed (sentinel-gated) hook; B removes all in-session goal mechanics and makes the loop a plain shell `while`, which is the most robust answer to "I can't type `/goal` every time" and gives each headless turn a single valid goal, at the cost of a shell entry point and `claude` headless runtime. The foundation steps are shared, so the project can start with A and add B later (or vice-versa) without redoing Steps 1-5.
- **Open question for `plan:check`:** confirm how the hook command receives the item id (`$ID` env injection vs. an admission-time marker file in the worktree) — Step 2 assumes one fallback; verify against the installed Claude Code version's hook input schema.
- **Out of scope:** the existing worktree/cwd mechanism for sub-agents and the `next-items.ts` reconciliation logic are unchanged; this plan only fixes goal enforcement and the sub-agent definition layer.
