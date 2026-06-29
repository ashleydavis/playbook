# Relative worktree paths for NFS-shared repos

## Overview
Ticket worktrees are created with `git worktree add`, which records two absolute-path link files: the main repo's admin link `project/.git/worktrees/<id>/gitdir` (pointing at the worktree's `.git`) and the worktree's own `.git` file (pointing back at the admin dir). When the repo lives on an NFS share mounted at different paths on different machines (for example `/home/ubuntu/...` inside the VM versus a different path on the host), those absolute paths resolve to non-existent directories on the other machine, so the worktree is broken there. The aim is to make worktrees survive being shared across machines at different mount points.

The Notes section lists every option found during research with its trade-offs; no option is decided yet, that is the developer's call. The Steps, Tests, and Verify sections below are written for Option 1 (relativize the link files ourselves) as a worked-out default, because it is the only option that needs no git upgrade and works on the installed git 2.43.0 (which lacks native relative-path worktree support: `--relative-paths` and `worktree.useRelativePaths` arrived in git 2.48). If a different option is chosen, the Steps need rewriting to match; the option comparison is the part to read first.

## Issues
<Leave empty — populated later by plan:check>

## Steps

1. **Create the pure path helper.** Add `scripts/lib/relative-worktree.ts` exporting a pure function `computeRelativeLinks(worktreePath: string, adminDir: string): { dotGit: string; adminLink: string }`. `worktreePath` is the absolute worktree directory (e.g. `project/worktrees/<id>`); `adminDir` is the absolute admin directory (`project/.git/worktrees/<id>`). It returns:
   - `dotGit`: the contents for the worktree's `.git` file, `"gitdir: " + relative(worktreePath, adminDir) + "\n"`.
   - `adminLink`: the contents for `adminDir/gitdir`, `relative(adminDir, join(worktreePath, ".git")) + "\n"`.
   Use `relative`, `join` from `node:path`. No IO. This function must compile and have a unit test (Step 6) before it is complete.

2. **Add the IO wrapper in the same module.** In `scripts/lib/relative-worktree.ts` add `export async function relativizeWorktree(worktreePath: string): Promise<void>`. It must be best-effort and idempotent:
   - Read `<worktreePath>/.git`. If it is missing, or is a directory, or its first line is not in `gitdir: <path>` form, return without error (so callers that run under mocked git runners, or a main worktree, are unaffected).
   - Parse the absolute `adminDir` from the `gitdir:` line and resolve it against `worktreePath`.
   - If `<adminDir>/gitdir` does not exist, return (nothing to relativize).
   - Call `computeRelativeLinks(worktreePath, adminDir)` and write `dotGit` to `<worktreePath>/.git` and `adminLink` to `<adminDir>/gitdir`.
   - Running it again on an already-relative worktree must recompute the same relative strings and rewrite them harmlessly. Use `node:fs/promises` (`readFile`, `writeFile`, `stat`). This wrapper is covered by smoke tests (Step 9), not a unit test, because it is thin IO.

3. **Call relativize from setup-ticket.** In `scripts/setup-ticket.ts`, import `relativizeWorktree` from `./lib/relative-worktree`. In the default `realGit` runner (`const realGit: GitRunner = ...`), after the `git worktree add` succeeds (`code === 0`), `await relativizeWorktree(worktreePath)`. Putting it inside `realGit` keeps the injected test runner in `setup-ticket.test.ts` untouched, since that test passes its own runner. The change must compile and the existing unit tests must still pass.

4. **Call relativize from merge-ticket.** In `scripts/merge-ticket.ts`, import `relativizeWorktree` from `./lib/relative-worktree`. After the train worktree add succeeds (the `add.code !== 0` guard around line 190), `await relativizeWorktree(trainPath)`. Because `relativizeWorktree` is best-effort (Step 2), this is harmless under the mocked `runGit` used by `merge-ticket.test.ts` (the train `.git` file will not exist, so it no-ops). The change must compile and existing unit tests must still pass.

5. **Add a repair CLI for pre-existing worktrees.** Add `scripts/repair-worktrees.ts` (`#!/usr/bin/env bun`), run from the state repo root like the other scripts. It:
   - Resolves `projectDir = resolve(cwd, "..", "project")` and `worktreesDir = join(projectDir, "worktrees")`.
   - Exports a testable core `export async function repairWorktrees(worktreesDir: string): Promise<string[]>` that lists immediate subdirectories of `worktreesDir`, calls `relativizeWorktree` on each, and returns the list of worktree paths it processed.
   - The CLI `main()` prints one line per repaired worktree and a count, mirroring the style of `reset-loop.ts`'s CLI. Guard the `main()` run with the `process.argv[1] === __filename` pattern used elsewhere.
   This gives a one-shot migration for worktrees created before the fix and a recovery tool after a host switch. It does not commit anything (worktrees are gitignored). Must compile, with a unit test (Step 8) and smoke test (Step 9) passing.

6. **Unit test the pure helper.** Add `scripts/lib/relative-worktree.test.ts` covering `computeRelativeLinks`:
   - For the real layout (`worktreePath = /abs/project/worktrees/t1`, `adminDir = /abs/project/.git/worktrees/t1`) it returns `dotGit === "gitdir: ../../.git/worktrees/t1\n"` and `adminLink === "../../../worktrees/t1/.git\n"`.
   - The returned relative paths contain no absolute prefix (assert they do not start with `/`).
   - Asserts the values are stable for a different absolute root (mount-point independence): same inputs under `/home/ubuntu/...` and under `/host/mnt/...` yield identical relative strings.

7. **Skipped — covered by smoke.** `relativizeWorktree` is thin IO over the pure helper and is exercised end-to-end by the smoke tests in Step 9; no separate unit test (per the unit-test exception for thin IO wrappers is not in scope, so instead rely on smoke coverage). If `plan:check` wants a unit test here, make `relativizeWorktree` accept injected `readFile`/`writeFile`/`stat` and unit-test the no-op branches; default is smoke coverage.

8. **Unit test the repair core.** Add `scripts/repair-worktrees.test.ts` for `repairWorktrees`: create a temp directory with two fake worktree subdirectories, stub them so `relativizeWorktree` no-ops cleanly (no `.git` file), and assert the returned list contains both paths and that a missing `worktreesDir` returns an empty list rather than throwing.

9. **Smoke tests.** 
   - Add `scripts/smoke-repair-worktrees.sh`: init a throwaway project git repo with a worktree under `worktrees/<id>`, overwrite both link files with absolute paths to a bogus root to simulate the NFS breakage, run `repair-worktrees.ts` from a sibling state dir, and assert both link files are now relative (no leading `/`) and that `git -C worktrees/<id> rev-parse --git-dir` succeeds.
   - Extend `scripts/smoke-setup-ticket.sh`: after admitting a ticket, assert `project/worktrees/<id>/.git` and `project/.git/worktrees/<id>/gitdir` contain relative paths (grep that neither starts with `gitdir: /` or `/`), and that `git -C project/worktrees/<id> status` works.
   - Extend `scripts/smoke-merge-ticket.sh`: after a `build`, assert the train worktree's link files are relative the same way.
   - Register `smoke-repair-worktrees.sh` in the `smoke` script wiring (whatever `package.json`'s `smoke` runs / the smoke runner enumerates) so `bun run smoke` includes it.

10. **Docs.** Update `scripts/CLAUDE.md`: add a `repair-worktrees.ts` bullet to the helper list and a sentence in the `setup-ticket.ts` / `merge-ticket.ts` bullets noting worktree link files are written relative so the repo survives being shared across machines (NFS) at different mount points. Add a `lib/relative-worktree.ts` bullet under the shared-library section. Check `docs/process.md` and `handbook.md` for any description of worktree creation and add a short note about relative links if worktrees are described there. Keep prose unwrapped (one line per paragraph/bullet).

## Unit Tests
- `scripts/lib/relative-worktree.test.ts` — `computeRelativeLinks`: correct relative strings for the standard layout, no absolute prefix, mount-point independence (Step 6).
- `scripts/repair-worktrees.test.ts` — `repairWorktrees`: returns the processed worktree list, and returns empty (no throw) when `worktreesDir` is absent (Step 8).
- No new unit test for `relativizeWorktree` (thin IO; covered by smoke). No change to `setup-ticket.test.ts` or `merge-ticket.test.ts` logic, but both must still pass after the imports/calls are added.

## Smoke Tests
- `scripts/smoke-repair-worktrees.sh` — simulate broken absolute links, run repair, assert links are relative and the worktree resolves (Step 9).
- `scripts/smoke-setup-ticket.sh` (extended) — after admit, worktree link files are relative and `git status` works in the worktree.
- `scripts/smoke-merge-ticket.sh` (extended) — after `build`, train worktree link files are relative.

## Verify
- `bun run` type-check / build is clean: from `scripts/`, the TypeScript compiles (e.g. `bunx tsc --noEmit` per the project's tsconfig, or whatever the repo uses) with no errors.
- `bun run test` (from `scripts/`) passes, including the two new test files and the unchanged `setup-ticket`/`merge-ticket` tests.
- `bun run smoke` (from `scripts/`) passes, including the new and extended smoke scripts.
- Manual cross-machine check (described, not automated): on machine A create a worktree via `setup-ticket.ts`; inspect `project/worktrees/<id>/.git` and `project/.git/worktrees/<id>/gitdir` and confirm both are relative; then on machine B with the share mounted at a different path, `git -C project/worktrees/<id> status` succeeds.

## Notes
Options for the absolute-path problem. None is decided; this is the comparison for the developer to choose from. The Steps above implement Option 1 as a default because it is the only one that works as-is on git 2.43.0, but any of these is open.

- **Option 1 — Relativize the link files ourselves after `git worktree add`.** Rewrite the worktree `.git` file and the admin `gitdir` link to relative paths via a shared helper, applied in `setup-ticket.ts`, `merge-ticket.ts`, and a `repair-worktrees.ts` migration tool. Verified to work on the installed git 2.43.0 and to survive a mount-point change. No git upgrade, self-contained, no change to the `project/worktrees/<id>` layout. Trade-off: we maintain a few lines that duplicate what newer git does natively.
- **Option 2 — Native git relative paths (`worktree.useRelativePaths` / `git worktree add --relative-paths`).** The cleanest long-term fix, but requires git ≥ 2.48 on every machine that touches the share; the current machine has 2.43.0, so it does nothing until git is upgraded everywhere. Could be combined with Option 1: detect the git version and prefer the native flag, falling back to manual relativization on older git. Trade-off: silently no-ops on older git, so it needs a version check to avoid a false sense of safety.
- **Option 3 — `git worktree repair` per host / on session start.** `git worktree repair` rewrites the links, but to absolute paths for the current host, so it re-breaks the moment you switch back to the other machine; it would have to run on every host switch (e.g. from a hook). It is a per-host recovery mechanism rather than a permanent fix. Trade-off: must run on every machine switch; the `repair-worktrees.ts` in Option 1 instead writes relative links once. Worth keeping `git worktree repair` in mind as a manual last resort regardless of which option is chosen.
- **Option 4 — Move worktrees off the NFS share to machine-local storage** (e.g. under a cache dir or `/var/tmp/...`). Eliminates sharing entirely. Trade-off: breaks the design assumption that worktrees live at `project/worktrees/<id>`, complicates discovery and the existing cleanup/merge machinery, and makes an in-flight ticket worktree non-portable (you cannot resume it from the other machine). Larger, more invasive change.
- **Option 5 — Replace worktrees with a full clone per ticket.** Self-contained and portable. Trade-off: loses the shared object store that the merge-train logic in `merge-ticket.ts` relies on (cherry-picking ticket branches onto a train within one repo), and is heavier on disk and time.

Implementation detail confirmed during research: with `worktreePath = project/worktrees/<id>` and `adminDir = project/.git/worktrees/<id>`, the worktree `.git` becomes `gitdir: ../../.git/worktrees/<id>` and the admin link becomes `../../../worktrees/<id>/.git`; both resolve correctly on git 2.43.0 and are independent of the absolute mount point.

Pre-existing broken worktrees: a host that already has worktrees with bad absolute links may fail `git worktree remove` (used by `reset-loop.ts` / `merge-ticket` cleanup) because the worktree's `.git` points nowhere on that host. Run `repair-worktrees.ts` first to relativize, after which normal removal works. This ordering is worth a line in the `pb:reset` docs if `plan:check` deems it necessary.
