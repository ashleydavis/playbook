# Work item rules

- Never move work item directories between queues by hand. Call `bun ~/playbook/scripts/move.ts <id> <target-queue>` so the move and any related bookkeeping (e.g. updating `current-state.md`) stay consistent.
- Each work item is a directory named by its ID, containing `index.md` plus an optional `evidence/` subdir. New work items always start in `todo/`. The directory name must equal the `**ID:**` field declared in `index.md`.
- Items in `human-review/` are read-only except for writing the approve/reject outcome into `index.md`.
- Items in `done/` are immutable history, evidence included.
- Acceptance criteria are always required. A Test Plan is required, but may be `N/A: <reason>` paired with a Manual Verification section for items with no testable behaviour (scaffolding, doc-only, dep bumps). Refuse to implement an item with no acceptance criteria, or with neither a Test Plan nor a Manual Verification.
