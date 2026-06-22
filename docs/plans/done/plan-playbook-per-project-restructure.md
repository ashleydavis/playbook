# Playbook: one clone per project

## Rule (read first)
Make the minimal change. Only change what this plan names. Never rewrite prose that is already fine. Use the smallest possible edit: the wrong phrase out, the corrected phrase in, surrounding text untouched. Do not expand scope.

## Overview
Switch the playbook from "install once per machine (symlinks + global config)" to "one clone per project." The project and state repos nest inside the clone; the developer launches Claude Code from the clone root, so `CLAUDE.md`, the skills, and settings apply with no symlinks or global wiring. Start from the original, unmodified repo.

## Issues

## Steps
1. `mv config/PLAYBOOK-CLAUDE.md CLAUDE.md`. Fix only the wrong lines: per-machine/global wording → one clone per project launched from the root; `~/playbook/scripts/move.ts` → `bun ../scripts/move.ts` run from `state/`. Keep the rest.
2. `mv skills/pb .claude/commands/pb` (creating `.claude/commands/` first). Remove the now-empty `skills/`.
3. `mv config/settings.json .claude/settings.json`. Ensure it ships with permissions bypassed and file edits auto-accepted (`permissions.defaultMode: "bypassPermissions"`). Remove the now-empty `config/`.
4. `rm scripts/install.sh`. Keep `scripts/install-prereqs.sh` but remove all `sudo` from it, no script runs sudo. Prerequisites are the developer's own responsibility.
5. `.gitignore`: add `project/` and `state/`.
6. In `.claude/commands/pb/bootstrap/new.md` and `existing.md`: scaffold into `project/` and `state/` (paths relative to the clone root); drop any global-install assumption. `existing.md` clones the project into `project/`.
7. In `.claude/commands/pb/help.md`, `review.md`, `next.md`: fix `~/playbook/...` paths and the `skills/pb` reference; doc links to root files become `../../../<file>` (skills moved one level deeper).
8. `templates/state/tickets/CLAUDE.md`: `~/playbook/scripts/move.ts` → `bun ../scripts/move.ts` from the state repo.
9. `README.md`, `handbook.md`, `process.md`, `index.md`: change only the lines describing install/symlinks/`~/playbook`/`config/`/`skills/pb`/`install.sh`/"one clone per machine". Leave all other prose untouched. Specifically:
   - Permissions warning in **both** README and handbook (see Notes).
   - README: keep the Prerequisites and Next steps sections; show the exact clone command `git clone https://github.com/ashleydavis/playbook.git ~/playbook`.
   - Forking is optional: clone directly to try, fork to customise.
   - `commit-template` is a directory: link `templates/commit-template/commit-template.txt`.

## Unit Tests
- None needed. `scripts/move.ts` is unchanged; its existing tests still apply.

## Smoke Tests
- `scripts/smoke-move.sh` still passes (move.ts untouched).

## Verify
- Run `bun test scripts/move.test.ts` and `bash scripts/smoke-move.sh`, both pass.
- `grep -rn "~/playbook/scripts\|install.sh\|config/PLAYBOOK\|config/settings\|skills/pb\|one clone per machine" --include="*.md" .` returns nothing (outside this plan file).
- `.claude/commands/pb/` holds all 11 skills; `CLAUDE.md` and `.claude/settings.json` exist at the root.

## Notes
- Launch from the clone root (not the project dir): CLAUDE.md, `.claude/commands/pb`, and `.claude/settings.json` all live there, so no parent-traversal or env var is needed. (Verified: Claude Code does NOT inherit `settings.json` from parent directories, though it does for CLAUDE.md and skills.)
- `.claude/settings.json` ships with `bypassPermissions` committed, so permissions are OFF by default on whatever machine it launches, including the host. The warning must say this plainly and point to the VM for safety.
- `move.ts` requires the state repo as cwd; from `state/` the script is `../scripts/move.ts`.
