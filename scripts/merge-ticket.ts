#!/usr/bin/env bun
// Merge approved tickets into the project's main branch as a single train, then
// move each merged ticket to done/. Replaces the old one-ticket-at-a-time merge:
// stacking many tickets onto one scratch worktree lets the post-merge checks run
// ONCE on the combined result instead of once per ticket.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/merge-ticket.ts build  <id> [<id> ...]   -> create + stack
//   bun ../scripts/merge-ticket.ts land   <trainId> <id> ... -> ff main, -> done/
//   bun ../scripts/merge-ticket.ts discard <trainId>         -> tear the train down
//
// Why a train: merging N tickets one at a time runs the full check suite N times
// in series. A train cherry-picks every ticket's commits onto a single scratch
// worktree, the agent runs the suite ONCE there, and on green the project branch
// fast-forwards to the train in one step. On red the agent bisects (rebuilding
// smaller trains) to find the breaking ticket. This script does the deterministic
// git + queue mechanics; running the checks (project-specific, captured to
// evidence) stays with the agent, exactly as the post-merge checks did before.
//
// The train is itself a worktree under the project repo (../project/worktrees/<trainId>
// on branch worktrees/<trainId>), so the existing cleanup machinery handles it for
// free: the pb:next end-of-turn reaper and reset-loop.ts both sweep that directory.
// <trainId> is "merge-<random>" so two runs never collide.
//
// Flow (all against the PROJECT repo at ../project, plus the STATE repo at the cwd):
//   build:
//     1. Read the project's current branch.
//     2. Create the train worktree at that branch tip (new branch worktrees/<trainId>).
//     3. For each ticket in order, cherry-pick ITS OWN commits
//        (merge-base(branch, worktrees/<id>)..worktrees/<id>) onto the train.
//        - clean:    record it as included.
//        - no commits: record it as a noop (nothing to pick; landed for free).
//        - conflict: abort that pick (the train keeps the earlier, clean picks)
//                    and report the offending ticket so the agent can drop it and
//                    rebuild without it.
//   land:
//     1. Fast-forward the project branch to the train (always clean: the train was
//        built on the branch tip and nothing else moves it during the merge stage).
//        ONCE THIS SUCCEEDS THE TICKETS ARE MERGED, so the next step is unconditional:
//     2. Move each landed ticket from merge-queue/ to done/ in the state repo and
//        commit that transition. A merged ticket is done even if main's checks then
//        fail (that is a separate broken-main problem for the agent to surface; the
//        merge itself cannot be undone, so the ticket does not go back).
//     3. Best-effort cleanup: remove the train worktree + branch and every landed
//        ticket's worktree + branch. A cleanup failure does not un-merge anything;
//        the leak is reaped by pb:next / reset-loop, so it never blocks the done move.
//   discard:
//     Remove just the train worktree + branch; ticket worktrees are left untouched
//     (used to tear down a failed train before rebuilding a smaller one).

import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { commitState } from "./lib/commit-state";
import { concludeTicket } from "./lib/conclude-ticket";
import { relativizeWorktree } from "./lib/relative-worktree";
import {
    WorktreeTeardownError,
    realGit,
    removeWorktreeAndBranch,
    type GitOutput,
    type GitRunner,
} from "./lib/worktree-teardown";

// Re-exported so this module's existing test imports keep resolving; the git
// runner and its types now live with the shared teardown they belong to.
export type { GitOutput, GitRunner };

// Raised for any expected, user-facing failure (missing args, missing repo, a git
// failure that is not a cherry-pick conflict). The CLI maps it to a non-zero exit
// with a clean message; tests assert on it.
export class MergeError extends Error {}

export interface BuildResult {
    trainId: string;
    trainBranch: string;
    trainPath: string;
    projectBranch: string;
    status: "built" | "conflict";
    // Tickets whose commits were cherry-picked cleanly, in order.
    included: string[];
    // Tickets that had no commits to pick (landed for free).
    noops: string[];
    // Present only when status is "conflict": the ticket that would not apply.
    conflict?: { ticket: string; conflicts: string[] };
}

export interface LandResult {
    trainId: string;
    projectBranch: string;
    // Tickets moved merge-queue/ -> done/.
    landed: string[];
    // The ticket worktrees / branches closed as those tickets were concluded.
    worktreesRemoved: string[];
    branchesDeleted: string[];
    // Non-fatal teardown warnings, one per ticket whose worktree would not close
    // (the ticket is still landed and done; the leak is reaped later).
    teardownWarnings: string[];
}

export interface DiscardResult {
    trainId: string;
    worktreeRemoved: string;
    branchDeleted: string | null;
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function paths(stateDir: string, trainId: string) {
    const projectDir = resolve(stateDir, "..", "project");
    const trainPath = join(projectDir, "worktrees", trainId);
    const trainBranch = `worktrees/${trainId}`;
    return { projectDir, trainPath, trainBranch };
}

// Paths git reports as unmerged during a conflicted cherry-pick.
async function conflictedPaths(
    cwd: string,
    runGit: GitRunner,
): Promise<string[]> {
    const out = await runGit(cwd, [
        "diff",
        "--name-only",
        "--diff-filter=U",
    ]);
    if (out.code !== 0) {
        return [];
    }
    return out.stdout.split("\n").filter((l) => l.length > 0);
}

// Create the train worktree and cherry-pick each ticket's commits onto it.
export async function buildTrain(
    stateDir: string,
    trainId: string,
    ids: string[],
    runGit: GitRunner = realGit,
): Promise<BuildResult> {
    if (!trainId) {
        throw new MergeError("missing trainId");
    }
    if (ids.length === 0) {
        throw new MergeError("no tickets to build a train from");
    }
    const { projectDir, trainPath, trainBranch } = paths(stateDir, trainId);

    if (!(await exists(projectDir))) {
        throw new MergeError(`no project repo at ${projectDir}`);
    }

    const branchOut = await runGit(projectDir, [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
    ]);
    if (branchOut.code !== 0) {
        throw new MergeError(
            `could not read project branch: ${branchOut.stderr}`,
        );
    }
    const projectBranch = branchOut.stdout;

    // Create the train worktree at the project branch tip, on its own branch.
    const add = await runGit(projectDir, [
        "worktree",
        "add",
        "-b",
        trainBranch,
        trainPath,
        projectBranch,
    ]);
    if (add.code !== 0) {
        throw new MergeError(`git worktree add failed: ${add.stderr}`);
    }
    // Rewrite the train worktree's link files to relative paths so it survives
    // the repo being shared across machines (NFS) at different mount points.
    // Best-effort: under the mocked runGit in tests the train `.git` file does
    // not exist, so this no-ops.
    await relativizeWorktree(trainPath);

    const included: string[] = [];
    const noops: string[] = [];

    for (const id of ids) {
        const ticketBranch = `worktrees/${id}`;

        // The commit where this ticket diverged from the branch: cherry-pick only
        // the ticket's own commits, never anything already on the branch.
        const baseOut = await runGit(projectDir, [
            "merge-base",
            projectBranch,
            ticketBranch,
        ]);
        if (baseOut.code !== 0) {
            throw new MergeError(
                `could not find merge-base for ${id}: ${baseOut.stderr}`,
            );
        }
        const range = `${baseOut.stdout}..${ticketBranch}`;

        const countOut = await runGit(trainPath, [
            "rev-list",
            "--count",
            range,
        ]);
        if (countOut.code !== 0) {
            throw new MergeError(
                `could not count commits for ${id}: ${countOut.stderr}`,
            );
        }
        if (countOut.stdout.trim() === "0") {
            noops.push(id);
            continue;
        }

        const pick = await runGit(trainPath, ["cherry-pick", range]);
        if (pick.code !== 0) {
            const conflicts = await conflictedPaths(trainPath, runGit);
            // Abort this pick so the train is left clean (it still holds the
            // earlier, cleanly picked tickets); the agent drops this ticket and
            // rebuilds without it.
            await runGit(trainPath, ["cherry-pick", "--abort"]);
            return {
                trainId,
                trainBranch,
                trainPath,
                projectBranch,
                status: "conflict",
                included,
                noops,
                conflict: { ticket: id, conflicts },
            };
        }
        included.push(id);
    }

    return {
        trainId,
        trainBranch,
        trainPath,
        projectBranch,
        status: "built",
        included,
        noops,
    };
}

// Fast-forward the project branch to the train, then move every landed ticket
// from merge-queue/ to done/ in the state repo. The fast-forward is the point of
// no return: after it the tickets are merged, so the done move is unconditional.
// This does NOT commit the state repo or clean up worktrees; the CLI does both
// (commit, then best-effort cleanup) so a cleanup failure cannot strand a merged
// ticket short of done.
export async function landTrain(
    stateDir: string,
    trainId: string,
    ticketIds: string[],
    runGit: GitRunner = realGit,
): Promise<LandResult> {
    if (!trainId) {
        throw new MergeError("missing trainId");
    }
    const { projectDir, trainBranch } = paths(stateDir, trainId);

    if (!(await exists(projectDir))) {
        throw new MergeError(`no project repo at ${projectDir}`);
    }

    const branchOut = await runGit(projectDir, [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
    ]);
    if (branchOut.code !== 0) {
        throw new MergeError(
            `could not read project branch: ${branchOut.stderr}`,
        );
    }
    const projectBranch = branchOut.stdout;

    // The train was built on the branch tip and nothing else advances the branch
    // during the merge stage, so this is always a clean fast-forward.
    const ff = await runGit(projectDir, ["merge", "--ff-only", trainBranch]);
    if (ff.code !== 0) {
        throw new MergeError(
            `train ${trainId} no longer fast-forwards ${projectBranch}: ${ff.stderr}`,
        );
    }

    // Merged. Conclude each ticket: move it to done/ AND close its worktree, the
    // shared path a Debug ticket also takes. Teardown is best-effort inside
    // concludeTicket, so it never throws here and can never strand a merged ticket
    // short of done/; the CLI commits the done/ moves after this returns.
    const landed: string[] = [];
    const worktreesRemoved: string[] = [];
    const branchesDeleted: string[] = [];
    const teardownWarnings: string[] = [];
    for (const id of ticketIds) {
        const concluded = await concludeTicket(stateDir, id, runGit);
        landed.push(id);
        if (concluded.worktreeRemoved) {
            worktreesRemoved.push(concluded.worktreeRemoved);
        }
        if (concluded.branchDeleted) {
            branchesDeleted.push(concluded.branchDeleted);
        }
        if (concluded.teardownWarning) {
            teardownWarnings.push(`${id}: ${concluded.teardownWarning}`);
        }
    }

    return {
        trainId,
        projectBranch,
        landed,
        worktreesRemoved,
        branchesDeleted,
        teardownWarnings,
    };
}

// Tear down a failed train, leaving the ticket worktrees in place to rebuild. Also
// used after a successful land to remove the (now-merged) train worktree itself,
// once concludeTicket has already closed each landed ticket's own worktree.
export async function discardTrain(
    stateDir: string,
    trainId: string,
    runGit: GitRunner = realGit,
): Promise<DiscardResult> {
    if (!trainId) {
        throw new MergeError("missing trainId");
    }
    const { projectDir, trainPath, trainBranch } = paths(stateDir, trainId);

    if (!(await exists(projectDir))) {
        throw new MergeError(`no project repo at ${projectDir}`);
    }

    const removed: string[] = [];
    const deleted: string[] = [];
    await removeWorktreeAndBranch(
        projectDir,
        trainPath,
        trainBranch,
        runGit,
        removed,
        deleted,
    );
    await runGit(projectDir, ["worktree", "prune"]);

    return {
        trainId,
        worktreeRemoved: removed[0] ?? trainPath,
        branchDeleted: deleted[0] ?? null,
    };
}

// A fresh, collision-proof train id. The random suffix lets two runs (or a retry)
// build trains side by side without clashing on the worktree path or branch name.
function newTrainId(): string {
    return `merge-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [sub, ...rest] = argv;

    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "tickets")))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        if (sub === "build") {
            const ids = rest;
            if (ids.length === 0) {
                console.error("usage: merge-ticket.ts build <id> [<id> ...]");
                process.exit(1);
            }
            const result = await buildTrain(stateDir, newTrainId(), ids);
            // Emit JSON so the agent reliably reads back the trainId, what was
            // included, and any conflict, without parsing prose.
            console.log(JSON.stringify(result));
            process.exit(result.status === "conflict" ? 2 : 0);
        } else if (sub === "land") {
            const [trainId, ...ticketIds] = rest;
            if (!trainId) {
                console.error(
                    "usage: merge-ticket.ts land <trainId> [<id> ...]",
                );
                process.exit(1);
            }
            // landTrain concludes each ticket (moves it to done/ and closes its
            // worktree); the only cleanup left is the throwaway train worktree.
            const result = await landTrain(stateDir, trainId, ticketIds);
            // The merge has landed: commit the done/ moves immediately, so a
            // merged ticket is recorded as done before anything else can fail.
            if (result.landed.length > 0) {
                await commitState(
                    stateDir,
                    `merge: land ${result.landed.join(", ")} to done`,
                    result.landed.flatMap((id) => [
                        `tickets/merge-queue/${id}`,
                        `tickets/done/${id}`,
                    ]),
                );
            }
            // Removing the train worktree is best-effort: the tickets are already
            // merged and committed to done/, so a removal failure must not fail the
            // command (the leak is reaped by pb:next / reset-loop).
            try {
                const train = await discardTrain(stateDir, trainId);
                console.log(JSON.stringify({ ...result, train }));
            } catch (cleanupErr) {
                const msg =
                    cleanupErr instanceof Error
                        ? cleanupErr.message
                        : String(cleanupErr);
                console.error(
                    `warning: train ${trainId} landed but train-worktree removal failed (leak reaped later): ${msg}`,
                );
                console.log(JSON.stringify(result));
            }
        } else if (sub === "discard") {
            const [trainId] = rest;
            if (!trainId) {
                console.error("usage: merge-ticket.ts discard <trainId>");
                process.exit(1);
            }
            const result = await discardTrain(stateDir, trainId);
            console.log(JSON.stringify(result));
        } else {
            console.error("usage: merge-ticket.ts <build|land|discard> ...");
            process.exit(1);
        }
    } catch (err) {
        if (err instanceof MergeError || err instanceof WorktreeTeardownError) {
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
