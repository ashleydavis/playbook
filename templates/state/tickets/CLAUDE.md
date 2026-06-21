# Ticket rules

- Never move ticket directories between queues by hand. Call `bun ../scripts/move.ts <id> <target-queue>` (run from `state/`) so the move and any related bookkeeping (e.g. updating `current-state.md`) stay consistent.
- Each ticket is a directory named by its ID, containing `index.md` plus an optional `evidence/` subdir. New tickets land in `todo/` or `backlog/` per the developer's choice at creation time; `pb:next` never reads `backlog/`. The directory name must equal the `**ID:**` field declared in `index.md`.
- Tickets in `human-review/` are read-only except for writing the approve/reject outcome into `index.md`.
- Tickets in `done/` are immutable history, evidence included. Tickets in `aborted/` (killed by the developer during `pb:review`) are likewise terminal, immutable history.
- Acceptance criteria are always required. A Test Plan is required, but may be `N/A: <reason>` paired with a Manual Verification section for tickets with no testable behaviour (scaffolding, doc-only, dep bumps). Refuse to implement a ticket with no acceptance criteria, or with neither a Test Plan nor a Manual Verification.
