// Unit tests for the build / land / cleanup / discard logic in merge-ticket.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Git is faked with a scripted GitRunner that answers each (cwd, args) call from
// a queue of canned outputs, so the cherry-pick / conflict / noop / ff branches
// are exercised without a real repo. The state-repo moves (merge-queue/ -> done/)
// run for real against temp dirs; the commit is left to the CLI (smoke test).

import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    MergeError,
    buildTrain,
    landTrain,
    cleanupTrain,
    discardTrain,
    type GitOutput,
    type GitRunner,
} from "./merge-ticket";

let root: string;
let stateDir: string;

function scriptedGit(outputs: GitOutput[]): {
    runGit: GitRunner;
    calls: Array<{ cwd: string; args: string[] }>;
} {
    const calls: Array<{ cwd: string; args: string[] }> = [];
    let i = 0;
    const runGit: GitRunner = async (cwd, args) => {
        calls.push({ cwd, args });
        const out = outputs[i++] ?? { code: 0, stdout: "", stderr: "" };
        return out;
    };
    return { runGit, calls };
}

const ok = (stdout = ""): GitOutput => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = ""): GitOutput => ({ code: 1, stdout: "", stderr });

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "merge-ticket-test-"));
    stateDir = join(root, "state");
    await mkdir(join(stateDir, "tickets"), { recursive: true });
    await mkdir(join(root, "project", "worktrees"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("buildTrain()", () => {
    test("cherry-picks every ticket cleanly onto a fresh train", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse --abbrev-ref HEAD
            ok(), // worktree add
            ok("baseA"), // merge-base for feat-1
            ok("2"), // rev-list --count -> 2 commits
            ok(), // cherry-pick feat-1
            ok("baseB"), // merge-base for feat-2
            ok("1"), // rev-list --count -> 1 commit
            ok(), // cherry-pick feat-2
        ]);

        const result = await buildTrain(
            stateDir,
            "merge-test",
            ["feat-1", "feat-2"],
            runGit,
        );

        expect(result.status).toBe("built");
        expect(result.included).toEqual(["feat-1", "feat-2"]);
        expect(result.noops).toEqual([]);
        expect(result.trainBranch).toBe("worktrees/merge-test");
        expect(calls[1].args.slice(0, 4)).toEqual([
            "worktree",
            "add",
            "-b",
            "worktrees/merge-test",
        ]);
        expect(calls[1].args.at(-1)).toBe("main");
        expect(calls.filter((c) => c.args[0] === "cherry-pick")).toHaveLength(2);
    });

    test("records a ticket with no commits as a noop, skips the cherry-pick", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse
            ok(), // worktree add
            ok("baseA"), // merge-base
            ok("0"), // rev-list --count -> nothing to pick
        ]);

        const result = await buildTrain(
            stateDir,
            "merge-test",
            ["feat-1"],
            runGit,
        );

        expect(result.status).toBe("built");
        expect(result.included).toEqual([]);
        expect(result.noops).toEqual(["feat-1"]);
        expect(calls.some((c) => c.args[0] === "cherry-pick")).toBe(false);
    });

    test("reports a conflict, aborts the pick, and stops at the offending ticket", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse
            ok(), // worktree add
            ok("baseA"), // merge-base feat-1
            ok("1"), // count feat-1
            ok(), // cherry-pick feat-1 (clean)
            ok("baseB"), // merge-base feat-2
            ok("1"), // count feat-2
            fail("CONFLICT"), // cherry-pick feat-2 (conflict)
            ok("src/x.ts\nsrc/y.ts"), // diff --diff-filter=U
            ok(), // cherry-pick --abort
        ]);

        const result = await buildTrain(
            stateDir,
            "merge-test",
            ["feat-1", "feat-2", "feat-3"],
            runGit,
        );

        expect(result.status).toBe("conflict");
        expect(result.included).toEqual(["feat-1"]);
        expect(result.conflict).toEqual({
            ticket: "feat-2",
            conflicts: ["src/x.ts", "src/y.ts"],
        });
        expect(calls.at(-1)?.args).toEqual(["cherry-pick", "--abort"]);
        expect(calls.filter((c) => c.args[0] === "merge-base")).toHaveLength(2);
    });

    test("throws on an empty ticket list", async () => {
        await expect(
            buildTrain(stateDir, "merge-test", [], scriptedGit([]).runGit),
        ).rejects.toThrow(MergeError);
    });

    test("throws when the project repo is missing", async () => {
        await rm(join(root, "project"), { recursive: true, force: true });
        await expect(
            buildTrain(stateDir, "merge-test", ["feat-1"], scriptedGit([]).runGit),
        ).rejects.toThrow(MergeError);
    });
});

describe("landTrain()", () => {
    test("fast-forwards, then moves each ticket merge-queue/ -> done/", async () => {
        await mkdir(join(stateDir, "tickets", "merge-queue", "feat-1"), {
            recursive: true,
        });
        await mkdir(join(stateDir, "tickets", "done"), { recursive: true });

        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse
            ok(), // merge --ff-only
        ]);

        const result = await landTrain(
            stateDir,
            "merge-test",
            ["feat-1"],
            runGit,
        );

        expect(result.landed).toEqual(["feat-1"]);
        expect(calls[1].args).toEqual([
            "merge",
            "--ff-only",
            "worktrees/merge-test",
        ]);
        // The ticket really moved into done/ in the state repo.
        expect(await isDir(join(stateDir, "tickets", "done", "feat-1"))).toBe(true);
        expect(
            await isDir(join(stateDir, "tickets", "merge-queue", "feat-1")),
        ).toBe(false);
    });

    test("throws when the train no longer fast-forwards", async () => {
        const { runGit } = scriptedGit([
            ok("main"), // rev-parse
            fail("not a fast-forward"), // merge --ff-only
        ]);
        await expect(
            landTrain(stateDir, "merge-test", ["feat-1"], runGit),
        ).rejects.toThrow(MergeError);
    });
});

describe("cleanupTrain()", () => {
    test("removes the train and each ticket worktree + branch", async () => {
        await mkdir(join(root, "project", "worktrees", "merge-test"));
        await mkdir(join(root, "project", "worktrees", "feat-1"));

        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove train
            ok(), // show-ref train branch (present)
            ok(), // branch -D train
            ok(), // worktree remove feat-1
            ok(), // show-ref feat-1 branch (present)
            ok(), // branch -D feat-1
            ok(), // worktree prune
        ]);

        const result = await cleanupTrain(
            stateDir,
            "merge-test",
            ["feat-1"],
            runGit,
        );

        expect(result.branchesDeleted).toEqual([
            "worktrees/merge-test",
            "worktrees/feat-1",
        ]);
        expect(calls.at(-1)?.args).toEqual(["worktree", "prune"]);
    });
});

describe("discardTrain()", () => {
    test("removes only the train worktree and branch", async () => {
        await mkdir(join(root, "project", "worktrees", "merge-test"));

        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove train
            ok(), // show-ref train branch (present)
            ok(), // branch -D train
            ok(), // worktree prune
        ]);

        const result = await discardTrain(stateDir, "merge-test", runGit);

        expect(result.branchDeleted).toBe("worktrees/merge-test");
        expect(calls[0].args.slice(0, 3)).toEqual([
            "worktree",
            "remove",
            "--force",
        ]);
        expect(calls.at(-1)?.args).toEqual(["worktree", "prune"]);
    });
});
