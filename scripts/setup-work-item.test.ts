// Unit tests for the core setupItem() logic in setup-work-item.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway repo layout under the OS temp dir (a state/
// sibling with a work-items/ queue tree, plus an empty project/ dir) and
// removes it in afterEach. The git worktree call is faked via the injectable
// GitRunner; the real git invocation is left to the smoke test.

import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { QUEUES } from "./move";
import { SetupError, setupItem, type GitRunner } from "./setup-work-item";

let root: string;
let stateDir: string;
let workItemsDir: string;

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function makeItem(queue: string, id: string): Promise<void> {
    await mkdir(join(workItemsDir, queue, id, "evidence"), { recursive: true });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "setup-test-"));
    stateDir = join(root, "state");
    workItemsDir = join(stateDir, "work-items");
    for (const queue of QUEUES) {
        await mkdir(join(workItemsDir, queue), { recursive: true });
    }
    // A bare project/ dir is enough; the git call is faked.
    await mkdir(join(root, "project"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("setupItem()", () => {
    test("moves the item to in-progress and invokes git against project/", async () => {
        await makeItem("todo", "feat-1");
        const calls: Array<{ projectDir: string; worktreePath: string }> = [];
        const fakeGit: GitRunner = async (projectDir, worktreePath) => {
            calls.push({ projectDir, worktreePath });
        };

        const result = await setupItem("feat-1", stateDir, fakeGit);

        expect(result.move.to).toBe("in-progress");
        expect(result.worktreeCreated).toBe(true);
        expect(await isDir(join(workItemsDir, "in-progress", "feat-1"))).toBe(true);
        expect(await isDir(join(workItemsDir, "todo", "feat-1"))).toBe(false);
        // git ran against project/, not state/, and targeted worktrees/<id>.
        expect(calls).toHaveLength(1);
        expect(calls[0].projectDir).toBe(join(root, "project"));
        expect(calls[0].worktreePath).toBe(join(root, "worktrees", "feat-1"));
    });

    test("throws when no project repo is present", async () => {
        await makeItem("todo", "feat-2");
        await rm(join(root, "project"), { recursive: true, force: true });

        await expect(
            setupItem("feat-2", stateDir, async () => {}),
        ).rejects.toThrow(SetupError);
    });

    test("throws on a missing id", async () => {
        await expect(setupItem("", stateDir, async () => {})).rejects.toThrow(
            SetupError,
        );
    });

    test("skips git when the worktree already exists (idempotent retry)", async () => {
        await makeItem("todo", "feat-3");
        await mkdir(join(root, "worktrees", "feat-3"), { recursive: true });
        let called = false;
        const fakeGit: GitRunner = async () => {
            called = true;
        };

        const result = await setupItem("feat-3", stateDir, fakeGit);

        expect(called).toBe(false);
        expect(result.worktreeCreated).toBe(false);
        expect(await isDir(join(workItemsDir, "in-progress", "feat-3"))).toBe(true);
    });
});
