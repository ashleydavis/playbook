// Unit tests for the stack / resume / land logic in merge-ticket.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// These use REAL git against a throwaway project repo with one worktree per ticket,
// so the chain (main => ticket 1 => ticket 2 => ... => main) is exercised for real.
// The state repo is plain directories; the commit of the done/ moves is left to the
// CLI (smoke test).

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spawnSync } from "node:child_process";

import type { GitRunner } from "./lib/worktree-teardown";
import {
    MergeError,
    landStack,
    resumeStack,
    stackTickets,
} from "./merge-ticket";

// Jest runs under Node, where the real runner's Bun.spawn is not available, so the
// tests run real git through this Node runner and pass it in.
const realGit: GitRunner = async (cwd, args) => {
    const proc = spawnSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        env: { ...process.env, GIT_EDITOR: "true" },
    });
    return {
        code: proc.status ?? 1,
        stdout: (proc.stdout ?? "").trim(),
        stderr: (proc.stderr ?? "").trim(),
    };
};

let root: string;
let stateDir: string;
let projectDir: string;

async function git(cwd: string, ...args: string[]): Promise<string> {
    const out = await realGit(cwd, args);
    if (out.code !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${out.stderr}`);
    }
    return out.stdout;
}

// A ticket: a worktree on branch worktrees/<id> with a ticket directory in
// merge-queue/, and optionally one commit that writes `content` to `file`.
async function addTicket(
    id: string,
    commit?: { file: string; content: string },
): Promise<void> {
    await git(projectDir, "worktree", "add", "-q", "-b", `worktrees/${id}`, join(projectDir, "worktrees", id), "main");
    await mkdir(join(stateDir, "tickets", "merge-queue", id), { recursive: true });
    await writeFile(join(stateDir, "tickets", "merge-queue", id, "index.md"), `# ${id}\n`);
    if (commit) {
        const wt = join(projectDir, "worktrees", id);
        await writeFile(join(wt, commit.file), commit.content);
        await git(wt, "add", "-A");
        await git(wt, "commit", "-q", "-m", `${id} work`);
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "merge-ticket-test-"));
    stateDir = join(root, "state");
    projectDir = join(root, "project");
    await mkdir(join(stateDir, "tickets", "merge-queue"), { recursive: true });
    await mkdir(join(stateDir, "tickets", "done"), { recursive: true });
    await mkdir(projectDir, { recursive: true });
    await git(projectDir, "init", "-q", "-b", "main");
    await git(projectDir, "config", "user.email", "test@test");
    await git(projectDir, "config", "user.name", "test");
    await writeFile(join(projectDir, ".gitignore"), "worktrees/\n");
    await writeFile(join(projectDir, "shared.txt"), "base\n");
    await git(projectDir, "add", "-A");
    await git(projectDir, "commit", "-q", "-m", "base");
    await mkdir(join(projectDir, "worktrees"), { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("stackTickets()", () => {
    test("rebases each ticket onto the one before it, with no extra worktree or branch", async () => {
        await addTicket("t1", { file: "a.txt", content: "a" });
        await addTicket("t2", { file: "b.txt", content: "b" });
        const before = await git(projectDir, "branch", "--list");
        const worktreePaths = async () =>
            (await git(projectDir, "worktree", "list", "--porcelain"))
                .split("\n")
                .filter((l) => l.startsWith("worktree "));
        const worktreesBefore = await worktreePaths();

        const result = await stackTickets(stateDir, ["t1", "t2"], realGit);

        expect(result.status).toBe("stacked");
        expect(result.included).toEqual(["t1", "t2"]);
        expect(result.tip).toBe("t2");
        expect(await exists(join(projectDir, "worktrees", "t2", "a.txt"))).toBe(true);
        expect(await exists(join(projectDir, "worktrees", "t2", "b.txt"))).toBe(true);
        expect(await exists(join(projectDir, "a.txt"))).toBe(false);
        expect(await git(projectDir, "branch", "--list")).toBe(before);
        expect(await worktreePaths()).toEqual(worktreesBefore);
        expect(await git(projectDir, "rev-list", "--count", "--merges", "refs/heads/worktrees/t2")).toBe("0");
    });

    test("records a ticket with no commits as a noop and stacks the next on the one before", async () => {
        await addTicket("t1", { file: "a.txt", content: "a" });
        await addTicket("empty");
        await addTicket("t3", { file: "c.txt", content: "c" });

        const result = await stackTickets(stateDir, ["t1", "empty", "t3"], realGit);

        expect(result.status).toBe("stacked");
        expect(result.included).toEqual(["t1", "t3"]);
        expect(result.noops).toEqual(["empty"]);
        expect(await exists(join(projectDir, "worktrees", "t3", "a.txt"))).toBe(true);
    });

    test("leaves the rebase in progress on a conflict and reports it", async () => {
        await addTicket("t1", { file: "shared.txt", content: "from t1\n" });
        await addTicket("t2", { file: "shared.txt", content: "from t2\n" });
        await addTicket("t3", { file: "c.txt", content: "c" });

        const result = await stackTickets(stateDir, ["t1", "t2", "t3"], realGit);

        expect(result.status).toBe("conflict");
        expect(result.included).toEqual(["t1"]);
        expect(result.conflict?.ticket).toBe("t2");
        expect(result.conflict?.conflicts).toEqual(["shared.txt"]);
        expect(result.conflict?.remaining).toEqual(["t3"]);
        expect(result.conflict?.worktree).toBe(join(projectDir, "worktrees", "t2"));
        const rebaseDir = await git(join(projectDir, "worktrees", "t2"), "rev-parse", "--git-path", "rebase-merge");
        const rebasePath = rebaseDir.startsWith("/")
            ? rebaseDir
            : join(projectDir, "worktrees", "t2", rebaseDir);
        expect(await exists(rebasePath)).toBe(true);
    });

    test("refuses an empty list and a missing worktree", async () => {
        await expect(stackTickets(stateDir, [], realGit)).rejects.toThrow(MergeError);
        await expect(stackTickets(stateDir, ["ghost"], realGit)).rejects.toThrow(/no worktree for ghost/);
    });
});

describe("resumeStack()", () => {
    async function conflicted(): Promise<void> {
        await addTicket("t1", { file: "shared.txt", content: "from t1\n" });
        await addTicket("t2", { file: "shared.txt", content: "from t2\n" });
        await addTicket("t3", { file: "c.txt", content: "c" });
        await stackTickets(stateDir, ["t1", "t2", "t3"], realGit);
    }

    test("reports the conflict again while it is unresolved", async () => {
        await conflicted();

        const result = await resumeStack(stateDir, ["t1", "t2", "t3"], realGit);

        expect(result.status).toBe("conflict");
        expect(result.conflict?.conflicts).toEqual(["shared.txt"]);
    });

    test("continues after the conflict is resolved and stacks the rest", async () => {
        await conflicted();
        const wt = join(projectDir, "worktrees", "t2");
        await writeFile(join(wt, "shared.txt"), "from t1 and t2\n");
        await git(wt, "add", "-A");

        const result = await resumeStack(stateDir, ["t1", "t2", "t3"], realGit);

        expect(result.status).toBe("stacked");
        expect(result.included).toEqual(["t1", "t2", "t3"]);
        expect(result.tip).toBe("t3");
        const t3 = join(projectDir, "worktrees", "t3");
        expect(await readFile(join(t3, "shared.txt"), "utf8")).toBe("from t1 and t2\n");
        expect(await exists(join(t3, "c.txt"))).toBe(true);
    });

    test("errors when no ticket has a rebase in progress", async () => {
        await addTicket("t1", { file: "a.txt", content: "a" });
        await stackTickets(stateDir, ["t1"], realGit);

        await expect(resumeStack(stateDir, ["t1"], realGit)).rejects.toThrow(/no ticket has a rebase in progress/);
    });
});

describe("landStack()", () => {
    test("fast-forwards main to the last ticket, moves every ticket to done/ and closes the worktrees", async () => {
        await addTicket("t1", { file: "a.txt", content: "a" });
        await addTicket("t2", { file: "b.txt", content: "b" });
        await addTicket("empty");
        await stackTickets(stateDir, ["t1", "t2", "empty"], realGit);

        const result = await landStack(stateDir, ["t1", "t2", "empty"], realGit);

        expect(result.landed).toEqual(["t1", "t2", "empty"]);
        expect(await exists(join(projectDir, "a.txt"))).toBe(true);
        expect(await exists(join(projectDir, "b.txt"))).toBe(true);
        for (const id of ["t1", "t2", "empty"]) {
            expect(await exists(join(stateDir, "tickets", "done", id))).toBe(true);
            expect(await exists(join(stateDir, "tickets", "merge-queue", id))).toBe(false);
            expect(await exists(join(projectDir, "worktrees", id))).toBe(false);
        }
        expect(await git(projectDir, "rev-list", "--count", "--merges", "main")).toBe("0");
    });

    test("errors, and moves nothing, when main has moved since the stack", async () => {
        await addTicket("t1", { file: "a.txt", content: "a" });
        await stackTickets(stateDir, ["t1"], realGit);
        await writeFile(join(projectDir, "other.txt"), "x");
        await git(projectDir, "add", "-A");
        await git(projectDir, "commit", "-q", "-m", "main moved");

        await expect(landStack(stateDir, ["t1"], realGit)).rejects.toThrow(/no longer fast-forwards/);
        expect(await exists(join(stateDir, "tickets", "merge-queue", "t1"))).toBe(true);
        expect(await exists(join(stateDir, "tickets", "done", "t1"))).toBe(false);
    });
});
