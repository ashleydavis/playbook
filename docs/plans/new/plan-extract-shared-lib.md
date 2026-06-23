# Extract shared code to scripts/lib/, prune dead code, complete test coverage

## Overview
The `scripts/` modules mix reusable functions with their CLI entry points, and
some exports, flags, and branches are no longer reachable from any skill or doc.
This plan moves **only genuinely shared code** into a new `scripts/lib/`,
leaves the CLI scripts otherwise untouched, removes everything that nothing
triggers, and brings unit and smoke coverage to 100%. The hard rule is that
"shared" means imported by **at least two** distinct non-test files; code used
by one place (or only internally/tests) is not shared and must not move.

## Issues
<!-- Leave empty — populated later by plan:check -->

## Steps

1. **Build the per-symbol sharing map.** For every exported symbol in each
   non-test `scripts/*.ts`, count the distinct **non-test** files that import it
   (exclude the defining file itself). Classify a symbol as **shared** only when
   that count is **>= 2**. Do this at the symbol level, not the module level: a
   module imported by two files may still export some symbols used by only one.

2. **Create `scripts/lib/` and move shared symbols there.** For each shared
   symbol, place it in `scripts/lib/<module>.ts` (one lib module per current
   concern). Move only the shared symbols plus any private helpers they
   exclusively depend on. Do not move non-shared exports, CLI `main`/arg-parsing,
   or anything imported by zero or one non-test files.

3. **Leave the CLI scripts as thin wrappers.** Each `scripts/<module>.ts` keeps
   its `main`/CLI glue and now imports the moved functions from `./lib/<module>`.
   Repoint every importer (in `scripts/` and in tests) from `./<module>` to
   `./lib/<module>` for the symbols that moved. Make no other change to the CLI
   scripts.

4. **Remove unused code and arguments.** Treat code as unnecessary when nothing
   in the skills (`.claude/commands/`) or `docs/` triggers it. Remove: CLI flags
   and their parse branches that no skill/doc passes; exported or private
   functions with no remaining caller; dead conditionals and now-unused imports
   created by the moves. Verify each removal candidate against the skills and
   docs before deleting it.

5. **Reconcile docs and skills with the pruned surface.** Update any skill or
   doc that names a flag, argument, or function that step 4 removed, so the
   documented interface matches the code.

## Unit Tests
- Every function in `scripts/lib/**` has a unit test (`scripts/lib/<module>.test.ts`).
- Add tests for any moved or surviving function that currently lacks one.
- Update existing tests whose import paths changed (`./<module>` -> `./lib/<module>`).
- Remove tests that only covered code deleted in step 4.

## Smoke Tests
- Every CLI script in `scripts/*.ts` has a `scripts/smoke-<name>.sh`, registered
  in the `smoke` script in `scripts/package.json`.
- Add a smoke test for any CLI that lacks one.
- Update smokes that exercised removed flags/arguments to use the surviving
  interface.

## Verify
- Run `bun run test` from `scripts/` — all unit suites pass.
- Run `bun run smoke` from `scripts/` — all smoke scripts pass.
- Run `bunx tsc --noEmit` from `scripts/` — no type errors.
- Confirm `scripts/lib/` contains only symbols with >= 2 non-test importers, and
  no non-shared code was moved.
- Grep the skills and docs to confirm no removed flag/function is still
  referenced, and grep the code to confirm no removed symbol is still called.

## Notes
- "Shared" is strictly >= 2 distinct non-test importer files, per symbol. This is
  the rule that was previously violated by classifying at the module level.
- CLI scripts are otherwise untouched: only shared symbols are extracted; their
  `main` and private CLI helpers stay put.
- "Unnecessary" is defined operationally: not reachable from any skill or doc.
- Standalone CLIs whose functions are imported by no other file keep their logic
  in `scripts/`; they are not moved to `lib/`.
