// The injectable git runner and the primitive that removes a worktree + deletes
// its branch. Kept here because it is shared by the two places that retire a
// ticket's worktree: merge-ticket.ts (via concludeTicket, plus the train worktree)
// and lib/conclude-ticket.ts. merge-ticket re-exports the types so its existing
// test imports keep resolving.

import { stat } from "node:fs/promises";

export interface GitOutput {
    code: number;
    stdout: string;
    stderr: string;
}

// Injectable git runner: takes the cwd to run in and the argv after `git`, and
// returns the captured result. The unit tests pass a scripted fake; the smoke
// tests use the real one against a throwaway repo.
export type GitRunner = (cwd: string, args: string[]) => Promise<GitOutput>;

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

// Raised when a git worktree/branch removal fails.
export class WorktreeTeardownError extends Error {}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

// Remove a worktree and delete its branch, guarding both so a re-run converges:
// skip the worktree when its directory is already gone, skip the branch when its
// ref is already gone. Appends what it removed to `removed`/`deleted` so a caller
// tearing down several can report the totals; both default to throwaway arrays for
// a caller that removes just one and does not report.
export async function removeWorktreeAndBranch(
    projectDir: string,
    worktreePath: string,
    branch: string,
    runGit: GitRunner = realGit,
    removed: string[] = [],
    deleted: string[] = [],
): Promise<void> {
    if (await exists(worktreePath)) {
        const out = await runGit(projectDir, [
            "worktree",
            "remove",
            "--force",
            worktreePath,
        ]);
        if (out.code !== 0) {
            throw new WorktreeTeardownError(
                `git worktree remove ${worktreePath} failed: ${out.stderr}`,
            );
        }
        removed.push(worktreePath);
    }
    const present = await runGit(projectDir, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
    ]);
    if (present.code === 0) {
        const del = await runGit(projectDir, ["branch", "-D", branch]);
        if (del.code !== 0) {
            throw new WorktreeTeardownError(
                `git branch -D ${branch} failed: ${del.stderr}`,
            );
        }
        deleted.push(branch);
    }
}
