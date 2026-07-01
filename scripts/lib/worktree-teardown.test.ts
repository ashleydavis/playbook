// Unit tests for removeWorktreeAndBranch: the shared worktree/branch teardown used
// by merge-ticket.ts (train worktree) and lib/conclude-ticket.ts (each concluded
// ticket). Git is faked with a scripted GitRunner; the worktree-existence guard
// reads the real filesystem, so tests create/omit a temp dir to drive it.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    WorktreeTeardownError,
    removeWorktreeAndBranch,
    type GitOutput,
    type GitRunner,
} from "./worktree-teardown";

function scriptedGit(outputs: GitOutput[]): {
    runGit: GitRunner;
    calls: Array<{ cwd: string; args: string[] }>;
} {
    const calls: Array<{ cwd: string; args: string[] }> = [];
    let i = 0;
    const runGit: GitRunner = async (cwd, args) => {
        calls.push({ cwd, args });
        return outputs[i++] ?? { code: 0, stdout: "", stderr: "" };
    };
    return { runGit, calls };
}

const ok = (): GitOutput => ({ code: 0, stdout: "", stderr: "" });
const fail = (stderr = ""): GitOutput => ({ code: 1, stdout: "", stderr });

let root: string;
let projectDir: string;
let worktreePath: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "worktree-teardown-test-"));
    projectDir = join(root, "project");
    worktreePath = join(projectDir, "worktrees", "feat-1");
    await mkdir(join(projectDir, "worktrees"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("removeWorktreeAndBranch()", () => {
    test("removes the worktree and deletes the branch when both are present", async () => {
        await mkdir(worktreePath);
        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove --force
            ok(), // show-ref (branch present)
            ok(), // branch -D
        ]);
        const removed: string[] = [];
        const deleted: string[] = [];

        await removeWorktreeAndBranch(
            projectDir,
            worktreePath,
            "worktrees/feat-1",
            runGit,
            removed,
            deleted,
        );

        expect(calls[0].args).toEqual([
            "worktree",
            "remove",
            "--force",
            worktreePath,
        ]);
        expect(calls[2].args).toEqual(["branch", "-D", "worktrees/feat-1"]);
        expect(removed).toEqual([worktreePath]);
        expect(deleted).toEqual(["worktrees/feat-1"]);
    });

    test("skips the worktree removal when the directory is already gone", async () => {
        // worktreePath is not created, so the guard skips straight to show-ref.
        const { runGit, calls } = scriptedGit([
            ok(), // show-ref (branch present)
            ok(), // branch -D
        ]);
        const removed: string[] = [];

        await removeWorktreeAndBranch(
            projectDir,
            worktreePath,
            "worktrees/feat-1",
            runGit,
            removed,
        );

        expect(calls[0].args[0]).toBe("show-ref");
        expect(removed).toEqual([]);
    });

    test("skips the branch delete when the ref is already gone", async () => {
        await mkdir(worktreePath);
        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove --force
            fail(), // show-ref (branch absent)
        ]);
        const deleted: string[] = [];

        await removeWorktreeAndBranch(
            projectDir,
            worktreePath,
            "worktrees/feat-1",
            runGit,
            [],
            deleted,
        );

        expect(calls.some((c) => c.args[0] === "branch")).toBe(false);
        expect(deleted).toEqual([]);
    });

    test("throws WorktreeTeardownError when the worktree removal fails", async () => {
        await mkdir(worktreePath);
        const { runGit } = scriptedGit([fail("locked")]);

        await expect(
            removeWorktreeAndBranch(
                projectDir,
                worktreePath,
                "worktrees/feat-1",
                runGit,
            ),
        ).rejects.toThrow(WorktreeTeardownError);
    });
});
