// Unit tests for the core resetLoop() logic in reset-loop.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// The queue moves use the real move() against a temp filesystem; git is faked
// with a scripted GitRunner so the worktree teardown branches are exercised
// without a real repo. The real git invocation is left to the smoke test.

import { mkdir, readdir, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    ResetError,
    resetLoop,
    type GitOutput,
    type GitRunner,
} from "./reset-loop";

const QUEUES = [
    "todo",
    "in-progress",
    "agent-review",
    "human-review",
    "merge-queue",
    "done",
    "blocked",
    "aborted",
];

let root: string;
let stateDir: string;

// A GitRunner that returns queued outputs in order and records the calls, so a
// test can assert which git commands ran.
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

const ok = (stdout = ""): GitOutput => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = ""): GitOutput => ({ code: 1, stdout: "", stderr });

async function makeTicket(queue: string, id: string): Promise<void> {
    await mkdir(join(stateDir, "tickets", queue, id, "evidence"), {
        recursive: true,
    });
}

async function makeWorktree(id: string): Promise<void> {
    await mkdir(join(root, "project", "worktrees", id), { recursive: true });
}

async function names(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "reset-test-"));
    stateDir = join(root, "state");
    for (const q of QUEUES) {
        await mkdir(join(stateDir, "tickets", q), { recursive: true });
    }
    await mkdir(join(root, "project"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("resetLoop()", () => {
    test("requeues in-progress tickets and tears down their worktrees", async () => {
        await makeTicket("in-progress", "feat-1");
        await makeTicket("in-progress", "feat-2");
        await makeWorktree("feat-1");
        await makeWorktree("feat-2");

        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove --force feat-1
            ok(), // show-ref feat-1 (branch exists)
            ok(), // branch -D feat-1
            ok(), // worktree remove --force feat-2
            ok(), // show-ref feat-2 (branch exists)
            ok(), // branch -D feat-2
            ok(), // worktree prune
        ]);

        const result = await resetLoop(stateDir, runGit);

        expect(result.requeued).toEqual(["feat-1", "feat-2"]);
        expect(result.worktreesRemoved).toHaveLength(2);
        expect(result.branchesDeleted).toEqual([
            "worktrees/feat-1",
            "worktrees/feat-2",
        ]);

        // Tickets are back in todo/ and in-progress/ is empty.
        expect(await names(join(stateDir, "tickets", "todo"))).toEqual([
            "feat-1",
            "feat-2",
        ]);
        expect(
            await names(join(stateDir, "tickets", "in-progress")),
        ).toEqual([]);

        // Each worktree is force-removed, and prune runs once at the end.
        expect(calls[0].args).toEqual([
            "worktree",
            "remove",
            "--force",
            join(root, "project", "worktrees", "feat-1"),
        ]);
        expect(calls.at(-1)?.args).toEqual(["worktree", "prune"]);
    });

    test("skips branch deletion when the per-ticket branch is gone", async () => {
        await makeWorktree("feat-1");

        const { runGit, calls } = scriptedGit([
            ok(), // worktree remove --force feat-1
            fail(), // show-ref feat-1 (branch absent)
            ok(), // worktree prune
        ]);

        const result = await resetLoop(stateDir, runGit);

        expect(result.worktreesRemoved).toHaveLength(1);
        expect(result.branchesDeleted).toEqual([]);
        expect(calls.some((c) => c.args[0] === "branch")).toBe(false);
    });

    test("does nothing and calls no git when nothing is in flight", async () => {
        const { runGit, calls } = scriptedGit([]);

        const result = await resetLoop(stateDir, runGit);

        expect(result).toEqual({
            requeued: [],
            worktreesRemoved: [],
            branchesDeleted: [],
        });
        expect(calls).toHaveLength(0);
    });

    test("requeues even when there is no project repo to clean up", async () => {
        await rm(join(root, "project"), { recursive: true, force: true });
        await makeTicket("in-progress", "feat-1");

        const { runGit, calls } = scriptedGit([]);

        const result = await resetLoop(stateDir, runGit);

        expect(result.requeued).toEqual(["feat-1"]);
        expect(result.worktreesRemoved).toEqual([]);
        expect(calls).toHaveLength(0);
        expect(await names(join(stateDir, "tickets", "todo"))).toEqual([
            "feat-1",
        ]);
    });

    test("throws ResetError when a worktree cannot be removed", async () => {
        await makeWorktree("feat-1");
        const { runGit } = scriptedGit([fail("locked")]);

        await expect(resetLoop(stateDir, runGit)).rejects.toThrow(ResetError);
    });

    test("throws ResetError when not run from a state repo", async () => {
        await rm(join(stateDir, "tickets"), { recursive: true, force: true });

        await expect(
            resetLoop(stateDir, scriptedGit([]).runGit),
        ).rejects.toThrow(ResetError);
    });
});
