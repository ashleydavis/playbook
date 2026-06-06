// Unit tests for the core teardownItem() logic in finalize-work-item.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Git is faked with a scripted GitRunner that answers each (cwd, args) call from
// a queue of canned outputs, so the merge/conflict/noop branches are exercised
// without a real repo. The real git invocation is left to the smoke test.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    TeardownError,
    teardownItem,
    type GitOutput,
    type GitRunner,
} from "./finalize-work-item";

let root: string;
let stateDir: string;

// Build a GitRunner that returns queued outputs in order and records the calls,
// so a test can assert which git commands ran.
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

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "finalize-test-"));
    stateDir = join(root, "state");
    await mkdir(join(stateDir, "work-items"), { recursive: true });
    await mkdir(join(root, "project"), { recursive: true });
    await mkdir(join(root, "project", "worktrees", "feat-1"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("teardownItem()", () => {
    test("merges cleanly: rebase ok, fast-forward, worktree removed", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse --abbrev-ref HEAD
            ok("c1\nc2"), // rev-list main..HEAD  (two commits)
            ok(), // rebase main
            ok("c2"), // rev-parse HEAD
            ok(), // merge --ff-only
            ok(), // worktree remove
            ok(), // branch -D worktrees/feat-1
        ]);

        const result = await teardownItem("feat-1", stateDir, runGit);

        expect(result.status).toBe("merged");
        expect(result.branch).toBe("main");
        expect(result.mergedCommits).toEqual(["c1", "c2"]);
        // It removes the worktree, then deletes the per-item branch last.
        expect(calls.at(-2)?.args.slice(0, 2)).toEqual(["worktree", "remove"]);
        expect(calls.at(-1)?.args).toEqual(["branch", "-D", "worktrees/feat-1"]);
    });

    test("reports conflict and aborts the rebase without merging", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse --abbrev-ref HEAD
            ok("c1"), // rev-list main..HEAD
            fail("CONFLICT"), // rebase main
            ok("src/a.ts\nsrc/b.ts"), // diff --name-only --diff-filter=U
            ok(), // rebase --abort
        ]);

        const result = await teardownItem("feat-1", stateDir, runGit);

        expect(result.status).toBe("conflict");
        expect(result.conflicts).toEqual(["src/a.ts", "src/b.ts"]);
        expect(result.mergedCommits).toEqual([]);
        // It aborted the rebase and never fast-forwarded or removed anything.
        expect(calls.at(-1)?.args).toEqual(["rebase", "--abort"]);
        expect(calls.some((c) => c.args.includes("--ff-only"))).toBe(false);
        expect(calls.some((c) => c.args[0] === "worktree")).toBe(false);
    });

    test("is a noop when the worktree has no commits ahead", async () => {
        const { runGit, calls } = scriptedGit([
            ok("main"), // rev-parse --abbrev-ref HEAD
            ok(""), // rev-list main..HEAD -> none
            ok(), // worktree remove
            ok(), // branch -D worktrees/feat-1
        ]);

        const result = await teardownItem("feat-1", stateDir, runGit);

        expect(result.status).toBe("noop");
        expect(result.mergedCommits).toEqual([]);
        expect(calls.some((c) => c.args.includes("rebase"))).toBe(false);
        expect(calls.at(-2)?.args.slice(0, 2)).toEqual(["worktree", "remove"]);
        expect(calls.at(-1)?.args).toEqual(["branch", "-D", "worktrees/feat-1"]);
    });

    test("throws when the worktree is missing", async () => {
        await rm(join(root, "project", "worktrees", "feat-1"), {
            recursive: true,
            force: true,
        });

        await expect(
            teardownItem("feat-1", stateDir, scriptedGit([]).runGit),
        ).rejects.toThrow(TeardownError);
    });

    test("throws on a missing id", async () => {
        await expect(
            teardownItem("", stateDir, scriptedGit([]).runGit),
        ).rejects.toThrow(TeardownError);
    });
});
