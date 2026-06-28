# Decisions

A chronological log of decisions about the Playbook process: what changed and why. Newest first. Each entry has a date, a one-line title, and a short "what / why" body. This is not a queue or a status file and it never tracks in-flight work; for that, run `/pb:status` (which summarises the live ticket queues) or `/pb:board`.

## 2026-06-25 — Removed `current-state.md`

**What the file did:** `current-state.md` was a per-project, human-readable summary that sat on top of the ticket queues at `state/current-state.md`. It had a top `⚠ Needs your action` section (blocks, broken main, environmental/setup failures, awaiting-review, run-halt and session-interrupt notes) and a `Progress` section (in-flight and recently completed tickets). It was a *derived* view: the queues were always the source of truth, and the parent agent maintained the file by hand on every queue change, committing it via `commit-state.ts`.

**Why it was removed:** the developer did not use it; the AI did not need it (the queues are the source of truth and `/pb:status` regenerates the same view live); maintaining it added a read/edit/commit to nearly every skill on every queue change, slowing the agent; and its single-committer rule (a shared-file write would race parallel sub-agents) blocked multiple AIs from using one state repo at once. Its only non-derived content (the systemic-failure-halt and session-interrupt banners) is now surfaced transiently in chat; the queues remain the durable record.
