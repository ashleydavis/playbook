# State repo rules

This is the state repo. It tracks project state and lives outside the project repo so it stays consistent across worktrees. It holds the ticket queues (`tickets/`).

This repo is a git repo whose history is an audit log of the process: every significant change is committed, automatically by the helper scripts (`move`, `setup-ticket`, `fail-ticket`, `reset-failures`) or via `commit-state.ts` for hand edits. See the playbook's `docs/process.md` (Queues) for the full rule.

The spec lives in the project repo at `project/docs/spec/` (`docs/spec/` relative to the project repo root). The process docs (`docs/process.md`, `index.md`, `handbook.md`) and the ticket / queue rules (`tickets/CLAUDE.md`) live in the playbook, not here. This repo only holds project-specific state.

## Communication style
- Be simple and direct.
- Only give directly relevant information. No waffle.
- Use bullet points where possible.
- Keep it easy to understand.
