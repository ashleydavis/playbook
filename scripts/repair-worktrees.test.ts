// Unit tests for the repairWorktrees() core in repair-worktrees.ts.
//
// relativizeWorktree() is exercised against real subdirs that have no `.git`
// link file, so it no-ops cleanly; this test asserts the listing/return
// behaviour. The real link rewriting is covered by smoke-repair-worktrees.sh.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repairWorktrees } from "./repair-worktrees";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "repair-test-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("repairWorktrees()", () => {
    test("returns every worktree subdirectory it processed", async () => {
        const worktreesDir = join(root, "project", "worktrees");
        await mkdir(join(worktreesDir, "feat-1"), { recursive: true });
        await mkdir(join(worktreesDir, "feat-2"), { recursive: true });

        const processed = await repairWorktrees(worktreesDir);

        expect(processed).toEqual([
            join(worktreesDir, "feat-1"),
            join(worktreesDir, "feat-2"),
        ]);
    });

    test("returns an empty list (no throw) when worktreesDir is absent", async () => {
        const processed = await repairWorktrees(
            join(root, "project", "worktrees"),
        );
        expect(processed).toEqual([]);
    });
});
