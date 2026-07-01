// Unit tests for concludeTicket: the shared "move to done/ + close the worktree"
// step used by conclude-debug.ts and merge-ticket.ts. Git is faked; the state-repo
// move runs for real against a temp dir. The worktree teardown is best-effort, so
// a git failure surfaces as a teardownWarning rather than a throw.

import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { concludeTicket } from "./conclude-ticket";
import type { GitOutput, GitRunner } from "./worktree-teardown";

function scriptedGit(outputs: GitOutput[]): GitRunner {
    let i = 0;
    return async () => outputs[i++] ?? { code: 0, stdout: "", stderr: "" };
}

const ok = (): GitOutput => ({ code: 0, stdout: "", stderr: "" });
const fail = (stderr = ""): GitOutput => ({ code: 1, stdout: "", stderr });

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

let root: string;
let stateDir: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "conclude-ticket-test-"));
    stateDir = join(root, "state");
    await mkdir(join(stateDir, "tickets", "agent-review", "dbg-1"), {
        recursive: true,
    });
    await mkdir(join(stateDir, "tickets", "done"), { recursive: true });
    await mkdir(join(root, "project", "worktrees"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("concludeTicket()", () => {
    test("moves the ticket to done/ and closes its worktree", async () => {
        await mkdir(join(root, "project", "worktrees", "dbg-1"));
        const runGit = scriptedGit([
            ok(), // worktree remove --force
            ok(), // show-ref (branch present)
            ok(), // branch -D
            ok(), // worktree prune
        ]);

        const result = await concludeTicket(stateDir, "dbg-1", runGit);

        expect(result.move.to).toBe("done");
        expect(await isDir(join(stateDir, "tickets", "done", "dbg-1"))).toBe(
            true,
        );
        expect(
            await isDir(join(stateDir, "tickets", "agent-review", "dbg-1")),
        ).toBe(false);
        expect(result.worktreeRemoved).toBe(
            join(root, "project", "worktrees", "dbg-1"),
        );
        expect(result.branchDeleted).toBe("worktrees/dbg-1");
        expect(result.teardownWarning).toBeNull();
    });

    test("still concludes (to done/) when the worktree teardown fails", async () => {
        await mkdir(join(root, "project", "worktrees", "dbg-1"));
        const runGit = scriptedGit([
            fail("locked"), // worktree remove --force fails
        ]);

        const result = await concludeTicket(stateDir, "dbg-1", runGit);

        // The move to done/ still happened; the teardown failure is captured.
        expect(await isDir(join(stateDir, "tickets", "done", "dbg-1"))).toBe(
            true,
        );
        expect(result.worktreeRemoved).toBeNull();
        expect(result.teardownWarning).toContain("locked");
    });
});
