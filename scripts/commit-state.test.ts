// Unit tests for the core commitState() / runGitWithLockRetry() logic in
// commit-state.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Git is faked with a scripted GitRunner so the add/commit/skip/retry branches
// are exercised without a real repo. The real git invocation and the CLI are
// left to smoke-commit-state.sh.

import {
    CommitError,
    commitState,
    runGitWithLockRetry,
    type GitRunner,
} from "./commit-state";

type GitOut = { code: number; stdout: string; stderr: string };

const ok = (stdout = ""): GitOut => ({ code: 0, stdout, stderr: "" });
const lock = (): GitOut => ({
    code: 1,
    stdout: "",
    stderr: "fatal: Unable to create '.git/index.lock': File exists.",
});

// A GitRunner that dispatches on the first git arg, recording every call. Each
// command name maps to a queue of outputs consumed in order (falling back to ok
// when the queue runs dry), so a test can script lock-then-success sequences and
// assert which commands ran.
function scriptedGit(plan: Partial<Record<string, GitOut[]>>): {
    runGit: GitRunner;
    calls: string[][];
} {
    const calls: string[][] = [];
    const idx: Record<string, number> = {};
    const runGit: GitRunner = async (_cwd, args) => {
        calls.push(args);
        const cmd = args[0];
        const queue = plan[cmd] ?? [];
        const i = idx[cmd] ?? 0;
        idx[cmd] = i + 1;
        return queue[i] ?? ok();
    };
    return { runGit, calls };
}

describe("commitState()", () => {
    test("commits with the default pathspec when none supplied", async () => {
        const { runGit, calls } = scriptedGit({});

        const result = await commitState("/state", "msg", undefined, runGit);

        expect(result).toEqual({ committed: true });
        expect(calls[0]).toEqual(["rev-parse", "--is-inside-work-tree"]);
        expect(calls[1]).toEqual(["add", "-A", "--", "."]);
        expect(calls[2]).toEqual(["commit", "-m", "msg"]);
    });

    test("commits with explicit pathspecs", async () => {
        const { runGit, calls } = scriptedGit({});

        await commitState("/state", "move x", ["a/x", "b/x"], runGit);

        expect(calls[1]).toEqual(["add", "-A", "--", "a/x", "b/x"]);
    });

    test("returns not-a-repo and makes no add/commit when not a git repo", async () => {
        const { runGit, calls } = scriptedGit({
            "rev-parse": [{ code: 128, stdout: "", stderr: "not a git repo" }],
        });

        const result = await commitState("/state", "msg", undefined, runGit);

        expect(result).toEqual({ committed: false, reason: "not-a-repo" });
        expect(calls).toHaveLength(1);
        expect(calls.some((c) => c[0] === "add" || c[0] === "commit")).toBe(false);
    });

    test("returns nothing-staged when the commit reports no changes", async () => {
        const { runGit } = scriptedGit({
            commit: [
                {
                    code: 1,
                    stdout: "nothing to commit, working tree clean",
                    stderr: "",
                },
            ],
        });

        const result = await commitState("/state", "msg", undefined, runGit);

        expect(result).toEqual({ committed: false, reason: "nothing-staged" });
    });

    test("throws CommitError on an unexpected non-zero git exit", async () => {
        const { runGit } = scriptedGit({
            commit: [{ code: 1, stdout: "", stderr: "fatal: bad thing" }],
        });

        await expect(
            commitState("/state", "msg", undefined, runGit),
        ).rejects.toThrow(CommitError);
    });

    test("retries on index.lock then commits successfully", async () => {
        // add locks once then succeeds; commit succeeds first try.
        const { runGit, calls } = scriptedGit({ add: [lock(), ok()] });

        const result = await commitState("/state", "msg", undefined, runGit);

        expect(result).toEqual({ committed: true });
        // Two add attempts (lock, then ok) plus rev-parse and commit.
        expect(calls.filter((c) => c[0] === "add")).toHaveLength(2);
    });
});

describe("runGitWithLockRetry()", () => {
    test("retries on lock and returns the eventual success", async () => {
        const { runGit, calls } = scriptedGit({ add: [lock(), lock(), ok()] });

        const out = await runGitWithLockRetry("/state", ["add", "-A"], runGit);

        expect(out.code).toBe(0);
        expect(calls).toHaveLength(3); // two locks, then success
    });

    test("gives up after maxAttempts and surfaces the last failure", async () => {
        // Always locked: the runner never returns a non-lock result.
        const alwaysLock: GitRunner = async () => lock();
        const calls: string[][] = [];
        const counting: GitRunner = async (cwd, args) => {
            calls.push(args);
            return alwaysLock(cwd, args);
        };

        const out = await runGitWithLockRetry(
            "/state",
            ["commit", "-m", "x"],
            counting,
            4,
        );

        expect(out.code).not.toBe(0);
        expect(calls).toHaveLength(4); // capped at maxAttempts
    });
});
