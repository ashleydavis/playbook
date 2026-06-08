#!/usr/bin/env bun
// Merge a work item's worktree back into the project repo, then clean it up.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/finalize-work-item.ts <id>
//
// Does the mechanical parts of merge + cleanup as one tested operation. It does
// NOT resolve conflicts: conflict resolution is a judgement task, so when a
// rebase cannot complete cleanly the script stops and hands back to the agent
// with a clear, machine-readable status.
//
// Flow (all against the PROJECT repo at ../project; the worktree is at
// ../project/worktrees/<id>):
//   1. Rebase the worktree's commits onto the project's current branch.
//      - clean: continue.
//      - conflict: abort the rebase (worktree left intact) and report
//        status "conflict" so the agent can resolve, commit, then re-run.
//   2. Fast-forward the project branch to the rebased worktree HEAD (the merge).
//   3. Remove the worktree (`git worktree remove`) and delete its per-item
//      branch (worktrees/<id>), which setup-work-item.ts created.
//
// Exit status maps to the reported `status` field:
//   merged   -> exit 0, worktree removed, changes on the branch.
//   conflict -> exit 2, nothing changed, agent must resolve and re-run.
//   noop     -> exit 0, worktree had no commits to merge; removed.
//
// This script does NOT commit the state repo: it operates on the project repo
// (rebase/merge/worktree removal) and does not move the state directory. The
// state-repo commit for this transition happens via the agent's follow-up
// `move.ts <id> done`, which auto-commits. Do not add a state commit here.

import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

// Raised for any expected, user-facing failure (missing id, missing worktree,
// git failure that is not a merge conflict). The CLI maps it to a non-zero exit
// with a clean message; tests assert on it.
export class TeardownError extends Error {}

export type TeardownStatus = "merged" | "conflict" | "noop";

export interface TeardownResult {
    id: string;
    status: TeardownStatus;
    worktreePath: string;
    branch: string;
    // The commits that were merged (empty for noop / conflict).
    mergedCommits: string[];
    // Conflicted paths, only present when status is "conflict".
    conflicts: string[];
}

export interface GitOutput {
    code: number;
    stdout: string;
    stderr: string;
}

// Injectable git runner: takes the cwd to run in and the argv after `git`, and
// returns the captured result. The unit test passes a scripted fake; the smoke
// test uses the real one against a throwaway repo.
export type GitRunner = (cwd: string, args: string[]) => Promise<GitOutput>;

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

const realGit: GitRunner = async (cwd, args) => {
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

// Core logic. `stateDir` is the state repo root (the cwd when run via the CLI).
// `runGit` is injectable for testing and defaults to the real git invocation.
export async function teardownItem(
    id: string,
    stateDir: string,
    runGit: GitRunner = realGit,
): Promise<TeardownResult> {
    if (!id) {
        throw new TeardownError("missing id: usage: finalize-work-item.ts <id>");
    }

    const projectDir = resolve(stateDir, "..", "project");
    const worktreePath = join(resolve(stateDir, "..", "project", "worktrees"), id);
    const itemBranch = `worktrees/${id}`;

    if (!(await exists(projectDir))) {
        throw new TeardownError(`no project repo at ${projectDir}`);
    }
    if (!(await exists(worktreePath))) {
        throw new TeardownError(`no worktree at ${worktreePath}`);
    }

    // The branch we are merging back into: the project repo's current branch.
    const branchOut = await runGit(projectDir, [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
    ]);
    if (branchOut.code !== 0) {
        throw new TeardownError(`could not read project branch: ${branchOut.stderr}`);
    }
    const branch = branchOut.stdout;

    // The commits the worktree adds on top of the branch.
    const aheadOut = await runGit(worktreePath, [
        "rev-list",
        `${branch}..HEAD`,
    ]);
    if (aheadOut.code !== 0) {
        throw new TeardownError(
            `could not list worktree commits: ${aheadOut.stderr}`,
        );
    }
    const mergedCommits = aheadOut.stdout.split("\n").filter((l) => l.length > 0);

    // Nothing to merge: just remove the worktree.
    if (mergedCommits.length === 0) {
        await removeWorktree(projectDir, worktreePath, itemBranch, runGit);
        return {
            id,
            status: "noop",
            worktreePath,
            branch,
            mergedCommits: [],
            conflicts: [],
        };
    }

    // Rebase the worktree's commits onto the current branch tip.
    const rebase = await runGit(worktreePath, ["rebase", branch]);
    if (rebase.code !== 0) {
        // Capture the conflicted paths, then abort so the worktree is left in a
        // clean, pre-rebase state for the agent to resolve manually.
        const conflicts = await conflictedPaths(worktreePath, runGit);
        await runGit(worktreePath, ["rebase", "--abort"]);
        return {
            id,
            status: "conflict",
            worktreePath,
            branch,
            mergedCommits: [],
            conflicts,
        };
    }

    // Fast-forward the branch to the rebased worktree HEAD. Because we just
    // rebased onto the branch tip, this is always a clean fast-forward.
    const headOut = await runGit(worktreePath, ["rev-parse", "HEAD"]);
    if (headOut.code !== 0) {
        throw new TeardownError(
            `could not read worktree HEAD: ${headOut.stderr}`,
        );
    }
    const ff = await runGit(projectDir, [
        "merge",
        "--ff-only",
        headOut.stdout,
    ]);
    if (ff.code !== 0) {
        throw new TeardownError(`fast-forward merge failed: ${ff.stderr}`);
    }

    await removeWorktree(projectDir, worktreePath, itemBranch, runGit);

    return {
        id,
        status: "merged",
        worktreePath,
        branch,
        mergedCommits,
        conflicts: [],
    };
}

// Paths git reports as unmerged during a conflicted rebase.
async function conflictedPaths(
    worktreePath: string,
    runGit: GitRunner,
): Promise<string[]> {
    const out = await runGit(worktreePath, [
        "diff",
        "--name-only",
        "--diff-filter=U",
    ]);
    if (out.code !== 0) {
        return [];
    }
    return out.stdout.split("\n").filter((l) => l.length > 0);
}

async function removeWorktree(
    projectDir: string,
    worktreePath: string,
    branch: string,
    runGit: GitRunner,
): Promise<void> {
    const out = await runGit(projectDir, [
        "worktree",
        "remove",
        worktreePath,
    ]);
    if (out.code !== 0) {
        throw new TeardownError(`git worktree remove failed: ${out.stderr}`);
    }
    // Delete the per-item branch setup-work-item.ts created; after the merge it
    // is fully contained in the project branch, so this is a clean delete.
    const del = await runGit(projectDir, ["branch", "-D", branch]);
    if (del.code !== 0) {
        throw new TeardownError(`git branch -D ${branch} failed: ${del.stderr}`);
    }
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [id] = argv;
    if (!id) {
        console.error("usage: finalize-work-item.ts <id>");
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
        const result = await teardownItem(id, stateDir);
        if (result.status === "conflict") {
            console.error(
                `conflict merging ${id} into ${result.branch}: resolve in ${result.worktreePath} ` +
                    `(conflicted: ${result.conflicts.join(", ") || "unknown"}), commit, then re-run`,
            );
            process.exit(2);
        }
        if (result.status === "noop") {
            console.log(`${id}: no commits to merge; worktree removed`);
        } else {
            console.log(
                `merged ${id} into ${result.branch} (${result.mergedCommits.length} commit(s)); worktree removed`,
            );
        }
    } catch (err) {
        if (err instanceof TeardownError) {
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
