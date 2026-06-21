// Unit tests for the core setupTicket() logic in setup-ticket.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway repo layout under the OS temp dir (a state/
// sibling with a tickets/ queue tree, plus an empty project/ dir) and
// removes it in afterEach. The git worktree call is faked via the injectable
// GitRunner; the real git invocation is left to the smoke test.

import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { QUEUES } from "./move";
import { SetupError, setupTicket, type GitRunner } from "./setup-ticket";

let root: string;
let stateDir: string;
let ticketsDir: string;

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function makeTicket(queue: string, id: string): Promise<void> {
    await mkdir(join(ticketsDir, queue, id, "evidence"), { recursive: true });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "setup-test-"));
    stateDir = join(root, "state");
    ticketsDir = join(stateDir, "tickets");
    for (const queue of QUEUES) {
        await mkdir(join(ticketsDir, queue), { recursive: true });
    }
    // A bare project/ dir is enough; the git call is faked.
    await mkdir(join(root, "project"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("setupTicket()", () => {
    test("moves the ticket to in-progress and invokes git against project/", async () => {
        await makeTicket("todo", "feat-1");
        const calls: Array<{
            projectDir: string;
            worktreePath: string;
            branch: string;
        }> = [];
        const fakeGit: GitRunner = async (projectDir, worktreePath, branch) => {
            calls.push({ projectDir, worktreePath, branch });
        };

        const result = await setupTicket("feat-1", stateDir, fakeGit);

        expect(result.move.to).toBe("in-progress");
        expect(result.worktreeCreated).toBe(true);
        expect(await isDir(join(ticketsDir, "in-progress", "feat-1"))).toBe(true);
        expect(await isDir(join(ticketsDir, "todo", "feat-1"))).toBe(false);
        // git ran against project/, not state/, targeted project/worktrees/<id>,
        // and created the per-ticket branch worktrees/<id>.
        expect(calls).toHaveLength(1);
        expect(calls[0].projectDir).toBe(join(root, "project"));
        expect(calls[0].worktreePath).toBe(join(root, "project", "worktrees", "feat-1"));
        expect(calls[0].branch).toBe("worktrees/feat-1");
    });

    test("throws when no project repo is present", async () => {
        await makeTicket("todo", "feat-2");
        await rm(join(root, "project"), { recursive: true, force: true });

        await expect(
            setupTicket("feat-2", stateDir, async () => {}),
        ).rejects.toThrow(SetupError);
    });

    test("throws on a missing id", async () => {
        await expect(setupTicket("", stateDir, async () => {})).rejects.toThrow(
            SetupError,
        );
    });

    test("skips git when the worktree already exists (idempotent retry)", async () => {
        await makeTicket("todo", "feat-3");
        await mkdir(join(root, "project", "worktrees", "feat-3"), { recursive: true });
        let called = false;
        const fakeGit: GitRunner = async () => {
            called = true;
        };

        const result = await setupTicket("feat-3", stateDir, fakeGit);

        expect(called).toBe(false);
        expect(result.worktreeCreated).toBe(false);
        expect(await isDir(join(ticketsDir, "in-progress", "feat-3"))).toBe(true);
    });

    test("fails when the ticket is only in backlog/", async () => {
        await makeTicket("backlog", "later-1");

        await expect(
            setupTicket("later-1", stateDir, async () => {}),
        ).rejects.toThrow(/not in todo/);
    });
});
