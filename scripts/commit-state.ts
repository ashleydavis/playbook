#!/usr/bin/env bun
// Commit a change in the state repo so its git history is an audit log.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/commit-state.ts "<message>" [pathspec...]
//
// The state repo records how each work item moved through the pipeline. The
// mutation scripts (move, setup-work-item, fail-work-item, reset-failures) call
// commitState() from their CLI main() to commit their own change automatically;
// agents call this CLI directly for free-form edits (a current-state.md update,
// a newly created work item) that no script performs.
//
// Two properties make this safe for the pb:next loop, which runs up to 10
// sub-agents in parallel against the single shared state-repo git index:
//   - Item-scoped: pass the affected item's directory (or current-state.md) as a
//     pathspec so a commit never mixes two items' changes.
//   - Lock-safe: every git invocation retries on index.lock contention, so
//     concurrent committers serialise on the shared index instead of failing.
//
// An un-migrated state repo (one that predates this change and is not a git
// repo) must not break the loop: commitState skips with reason "not-a-repo"
// rather than throwing.

import { stat } from "node:fs/promises";
import { join } from "node:path";

// Injectable git runner: takes the cwd to run in and the argv after `git`, and
// returns the captured result. The unit test passes a scripted fake; the smoke
// test uses the real one against a throwaway repo. Mirrors the runner in
// finalize-work-item.ts.
export type GitRunner = (
    cwd: string,
    args: string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface CommitResult {
    committed: boolean;
    reason?: "nothing-staged" | "not-a-repo";
}

// Raised for an unexpected git failure (not a lock, not nothing-to-commit). The
// CLI maps this to a non-zero exit; tests assert on it.
export class CommitError extends Error {}

export const realGit: GitRunner = async (cwd, args) => {
    const proc = Bun.spawn(["git", "-C", cwd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    return { code, stdout: stdout.trim(), stderr: stderr.trim() };
};

// A git lock error: another committer holds the index. Worth retrying.
const LOCK = /index\.lock|Unable to create .*\.lock|Another git process/;
// Git's "no changes" message, across its phrasings. Not an error.
const NOTHING = /nothing to commit|no changes added/;

// Run a single git invocation, retrying on index.lock contention so parallel
// committers serialise on the shared index instead of failing. Sleeps a short
// linear backoff between attempts and gives up after `maxAttempts`, returning
// the last failed result for the caller to interpret.
export async function runGitWithLockRetry(
    cwd: string,
    args: string[],
    runGit: GitRunner,
    maxAttempts = 10,
): Promise<{ code: number; stdout: string; stderr: string }> {
    let last = await runGit(cwd, args);
    let attempt = 1;
    while (attempt < maxAttempts && last.code !== 0 && LOCK.test(last.stderr)) {
        await sleep(attempt * 100);
        last = await runGit(cwd, args);
        attempt++;
    }
    return last;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stage the given pathspecs (default `.`) and commit them with `message`.
//   - Not a git repo: returns { committed: false, reason: "not-a-repo" } and
//     does NOT throw, so an un-migrated state repo keeps the loop running.
//   - Nothing staged: returns { committed: false, reason: "nothing-staged" }.
//   - Success: returns { committed: true }.
//   - Any other non-zero git exit: throws CommitError with the captured stderr.
export async function commitState(
    stateDir: string,
    message: string,
    pathspecs?: string[],
    runGit: GitRunner = realGit,
): Promise<CommitResult> {
    const specs = pathspecs && pathspecs.length > 0 ? pathspecs : ["."];

    // Bail out softly if this is not a git repo (pre-migration state repo).
    const inside = await runGit(stateDir, ["rev-parse", "--is-inside-work-tree"]);
    if (inside.code !== 0) {
        return { committed: false, reason: "not-a-repo" };
    }

    const add = await runGitWithLockRetry(
        stateDir,
        ["add", "-A", "--", ...specs],
        runGit,
    );
    if (add.code !== 0) {
        throw new CommitError(`git add failed: ${add.stderr}`);
    }

    const commit = await runGitWithLockRetry(
        stateDir,
        ["commit", "-m", message],
        runGit,
    );
    if (commit.code !== 0) {
        if (NOTHING.test(commit.stdout) || NOTHING.test(commit.stderr)) {
            return { committed: false, reason: "nothing-staged" };
        }
        throw new CommitError(`git commit failed: ${commit.stderr || commit.stdout}`);
    }

    return { committed: true };
}

// True if `path` exists (file or directory).
async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [message, ...pathspecs] = argv;
    if (!message) {
        console.error("usage: commit-state.ts <message> [pathspec...]");
        process.exit(1);
    }

    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "work-items")))) {
        console.error(
            `no work-items/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await commitState(stateDir, message, pathspecs);
        if (result.committed) {
            const sha = await realGit(stateDir, ["rev-parse", "--short", "HEAD"]);
            console.log(`committed ${sha.stdout || "HEAD"}`);
        } else if (result.reason === "nothing-staged") {
            console.log("nothing to commit (skipped)");
        } else {
            console.warn(
                "warning: state repo is not a git repo; skipped commit. " +
                    "Run `git init` in the state repo to enable the audit log.",
            );
        }
    } catch (err) {
        if (err instanceof CommitError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
