#!/usr/bin/env bun
// Reset the development loop back to a clean slate.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/reset-loop.ts
//
// Unwinds an interrupted or abandoned run as one tested operation:
//   1. Move every ticket in tickets/in-progress/ back to tickets/todo/.
//   2. Force-remove every git worktree under ../project/worktrees/ and delete
//      its per-ticket branch worktrees/<id>, then prune stale worktree records.
//
// It does NOT merge: any commits or uncommitted changes in a worktree are
// discarded. Use it to recover from a crashed/abandoned pb:next run, or to throw
// away in-flight work, never to land work. Failure counts are left untouched: an
// ticket returns to todo/ exactly as it was so the loop can pick it up again.

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { move } from "./lib/move";

// Raised for any expected, user-facing failure (no state repo, git failure).
// The CLI maps this to a non-zero exit with a clean message; tests assert on it.
export class ResetError extends Error {}

export interface GitOutput {
    code: number;
    stdout: string;
    stderr: string;
}

// Injectable git runner: takes the cwd to run in and the argv after `git`, and
// returns the captured result. The unit test passes a scripted fake; the smoke
// test uses the real one against a throwaway repo.
export type GitRunner = (cwd: string, args: string[]) => Promise<GitOutput>;

export interface ResetResult {
    // IDs moved in-progress/ -> todo/.
    requeued: string[];
    // Worktree paths force-removed.
    worktreesRemoved: string[];
    // Branch names deleted.
    branchesDeleted: string[];
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

// Immediate subdirectory names of `dir`, sorted; empty if `dir` is absent. Each
// such directory is a ticket directory (under a queue) or a worktree.
async function ticketDirs(dir: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
    } catch {
        return [];
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
export async function resetLoop(
    stateDir: string,
    runGit: GitRunner = realGit,
): Promise<ResetResult> {
    const ticketsDir = join(stateDir, "tickets");
    if (!(await exists(ticketsDir))) {
        throw new ResetError(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
    }

    const projectDir = resolve(stateDir, "..", "project");
    const worktreesDir = join(projectDir, "worktrees");

    // 1. Requeue everything still in in-progress/ back to todo/. move() is a
    //    no-op when a ticket is already in todo/, so a re-run converges.
    const requeued: string[] = [];
    for (const id of await ticketDirs(join(ticketsDir, "in-progress"))) {
        await move(id, "todo", ticketsDir);
        requeued.push(id);
    }

    // 2. Tear down every ticket worktree and its per-ticket branch. Force-remove
    //    because a worktree may hold unmerged commits or uncommitted changes; we
    //    are discarding that work, not landing it.
    const worktreesRemoved: string[] = [];
    const branchesDeleted: string[] = [];
    const wtIds = await ticketDirs(worktreesDir);
    for (const id of wtIds) {
        const wtPath = join(worktreesDir, id);
        const removed = await runGit(projectDir, [
            "worktree",
            "remove",
            "--force",
            wtPath,
        ]);
        if (removed.code !== 0) {
            throw new ResetError(
                `git worktree remove --force ${wtPath} failed: ${removed.stderr}`,
            );
        }
        worktreesRemoved.push(wtPath);

        // Delete the per-ticket branch setup-ticket.ts created, if it still
        // exists (a worktree could be detached/branchless after manual fiddling).
        const branch = `worktrees/${id}`;
        const present = await runGit(projectDir, [
            "show-ref",
            "--verify",
            "--quiet",
            `refs/heads/${branch}`,
        ]);
        if (present.code === 0) {
            const del = await runGit(projectDir, ["branch", "-D", branch]);
            if (del.code !== 0) {
                throw new ResetError(
                    `git branch -D ${branch} failed: ${del.stderr}`,
                );
            }
            branchesDeleted.push(branch);
        }
    }

    // Drop any stale worktree administrative records left behind by the removals.
    if (wtIds.length > 0) {
        await runGit(projectDir, ["worktree", "prune"]);
    }

    return { requeued, worktreesRemoved, branchesDeleted };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(): Promise<void> {
    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "tickets")))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await resetLoop(stateDir);
        const requeued = result.requeued.length
            ? ` (${result.requeued.join(", ")})`
            : "";
        console.log(
            `reset: requeued ${result.requeued.length} ticket(s) to todo/${requeued}; ` +
                `removed ${result.worktreesRemoved.length} worktree(s), ` +
                `deleted ${result.branchesDeleted.length} branch(es)`,
        );
    } catch (err) {
        if (err instanceof ResetError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
