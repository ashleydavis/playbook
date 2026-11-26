#!/usr/bin/env bun
// Merge approved tickets into the project's main branch as a chain of ticket
// branches, then move each merged ticket to done/. There is no extra worktree or
// branch: the chain is main => ticket 1 branch => ticket 2 branch => ... => ticket
// N branch => main.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/merge-ticket.ts stack  <id> [<id> ...]  -> rebase the tickets into a chain
//   bun ../scripts/merge-ticket.ts resume <id> [<id> ...]  -> continue after a conflict
//   bun ../scripts/merge-ticket.ts land   <id> [<id> ...]  -> ff main, -> done/
// Every command takes the full, ordered list of ticket ids.
//
// Why a chain: ticket 1 is rebased onto main's tip in its own worktree, ticket 2
// onto ticket 1's rebased branch in its own worktree, and so on. Ticket N's branch
// then holds the whole stack, so the post-merge checks run ONCE, in ticket N's
// worktree. Nothing runs a check before that. A ticket that conflicts is resolved
// right there in its own worktree by the merge agent (keeping both sides'
// behaviour), then `resume` carries on with the next ticket. If the checks fail the
// agent fixes the failure with a commit on ticket N's branch and runs them again.
// When they pass, `land` fast-forwards main to ticket N's branch. This script does
// the deterministic git + queue mechanics; running the checks (project-specific,
// captured to evidence) stays with the agent.
//
// Flow (all against the PROJECT repo at ../project, plus the STATE repo at the cwd):
//   stack:
//     For each ticket in order, rebase its own commits onto the previous ticket's
//     branch (ticket 1 onto main's tip) with `git rebase` in the ticket's own
//     worktree (../project/worktrees/<id>), so main's history stays flat with no
//     merge commits. Rebasing rewrites only the ticket's own branch.
//     - clean:    record it as included.
//     - no commits of its own: record it as a noop (landed for free); the next
//                 ticket is rebased onto the branch before it.
//     - conflict: do NOT abort. The rebase stays in progress in that ticket's
//                 worktree. Report status "conflict" (exit 2) with the ticket, its
//                 worktree path, its conflicted paths and the ids still to stack
//                 after it. The agent resolves the files, `git add`s them, and runs
//                 `resume`.
//   resume:
//     Finds the ticket whose worktree has a rebase in progress, runs `rebase
//     --continue` there (non-interactive editor), and carries on stacking the tickets
//     after it with the same loop. Another conflict is reported the same way; files
//     still unresolved are reported again with the rebase still in progress.
//   land:
//     1. Fast-forward the project branch to the last ticket's branch (an error if
//        main has moved since the chain was stacked).
//        ONCE THIS SUCCEEDS THE TICKETS ARE MERGED, so the next step is unconditional:
//     2. Move each landed ticket from merge-queue/ to done/ in the state repo,
//        close its worktree and delete its branch, and commit the state change. A
//        merged ticket is done even if main's checks then fail (that is a separate
//        broken-main problem for the agent to surface; the merge cannot be undone).
//        A cleanup failure does not un-merge anything; the leak is reaped by
//        pb:next / reset-loop.

import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { commitState } from "./lib/commit-state";
import { concludeTicket } from "./lib/conclude-ticket";
import { assertGitVersion, GitVersionError } from "./lib/git-version";
import {
    WorktreeTeardownError,
    realGit,
    type GitOutput,
    type GitRunner,
} from "./lib/worktree-teardown";

// Re-exported so this module's tests keep resolving; the git runner and its types
// live with the shared teardown they belong to.
export type { GitOutput, GitRunner };

// Raised for any expected, user-facing failure (missing args, missing repo or
// worktree, a git failure that is not a merge conflict). The CLI maps it to a
// non-zero exit with a clean message; tests assert on it.
export class MergeError extends Error {}

export interface StackResult {
    projectBranch: string;
    status: "stacked" | "conflict";
    // Tickets whose commits were rebased onto the chain cleanly, in order.
    included: string[];
    // Tickets that had no commits of their own (landed for free).
    noops: string[];
    // The ticket whose worktree holds the whole stack so far (the one to run the
    // checks in), or null when no ticket has commits.
    tip: string | null;
    // Present only when status is "conflict": the ticket that would not apply, its
    // worktree, its conflicted paths and the ids still to stack after it.
    conflict?: {
        ticket: string;
        worktree: string;
        conflicts: string[];
        remaining: string[];
    };
}

export interface LandResult {
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

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function projectPaths(stateDir: string) {
    const projectDir = resolve(stateDir, "..", "project");
    return { projectDir, worktreesDir: join(projectDir, "worktrees") };
}

async function projectBranchOf(
    projectDir: string,
    runGit: GitRunner,
): Promise<string> {
    if (!(await exists(projectDir))) {
        throw new MergeError(`no project repo at ${projectDir}`);
    }
    const out = await runGit(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (out.code !== 0) {
        throw new MergeError(`could not read project branch: ${out.stderr}`);
    }
    return out.stdout;
}

// Paths git reports as unmerged during a conflicted rebase.
async function conflictedPaths(
    cwd: string,
    runGit: GitRunner,
): Promise<string[]> {
    const out = await runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
    if (out.code !== 0) {
        return [];
    }
    return out.stdout.split("\n").filter((l) => l.length > 0);
}

async function rebaseInProgress(
    worktree: string,
    runGit: GitRunner,
): Promise<boolean> {
    for (const dir of ["rebase-merge", "rebase-apply"]) {
        const out = await runGit(worktree, ["rev-parse", "--git-path", dir]);
        if (out.code === 0) {
            const path = out.stdout.startsWith("/")
                ? out.stdout
                : join(worktree, out.stdout);
            if (await exists(path)) {
                return true;
            }
        }
    }
    return false;
}

async function requireWorktrees(
    worktreesDir: string,
    ids: string[],
): Promise<void> {
    if (ids.length === 0) {
        throw new MergeError("no tickets to merge");
    }
    for (const id of ids) {
        if (!(await exists(join(worktreesDir, id)))) {
            throw new MergeError(`no worktree for ${id} at ${join(worktreesDir, id)}`);
        }
    }
}

// Rebase tickets ids[from..] onto the chain, starting from `base`, the branch the
// ticket at `from` is rebased onto. Leaves a conflicted rebase in progress.
async function stackFrom(
    stateDir: string,
    ids: string[],
    from: number,
    base: string,
    tip: string | null,
    included: string[],
    noops: string[],
    projectBranch: string,
    runGit: GitRunner,
): Promise<StackResult> {
    const { projectDir, worktreesDir } = projectPaths(stateDir);
    let chainBase = base;
    let chainTip = tip;

    for (let i = from; i < ids.length; i++) {
        const id = ids[i];
        const worktree = join(worktreesDir, id);
        const branch = `worktrees/${id}`;

        // The commits that are the ticket's own: the ones after where it left the
        // chain. None means it has nothing to land.
        const baseOut = await runGit(projectDir, ["merge-base", chainBase, branch]);
        if (baseOut.code !== 0) {
            throw new MergeError(
                `could not find merge-base for ${id}: ${baseOut.stderr}`,
            );
        }
        const countOut = await runGit(projectDir, [
            "rev-list",
            "--count",
            `${baseOut.stdout}..${branch}`,
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

        // Rebase the ticket's own branch onto the chain, in its own worktree.
        // Merge commits on the branch are dropped, so history stays linear.
        const rebase = await runGit(worktree, [
            "rebase",
            "--no-rebase-merges",
            "--no-autosquash",
            chainBase,
        ]);
        if (rebase.code !== 0) {
            const conflicts = await conflictedPaths(worktree, runGit);
            return {
                projectBranch,
                status: "conflict",
                included,
                noops,
                tip: chainTip,
                conflict: {
                    ticket: id,
                    worktree,
                    conflicts,
                    remaining: ids.slice(i + 1),
                },
            };
        }
        included.push(id);
        chainBase = branch;
        chainTip = id;
    }

    return {
        projectBranch,
        status: "stacked",
        included,
        noops,
        tip: chainTip,
    };
}

// Rebase each ticket onto the one before it, ticket 1 onto main's tip.
export async function stackTickets(
    stateDir: string,
    ids: string[],
    runGit: GitRunner = realGit,
): Promise<StackResult> {
    const { projectDir, worktreesDir } = projectPaths(stateDir);
    const projectBranch = await projectBranchOf(projectDir, runGit);
    await requireWorktrees(worktreesDir, ids);
    return stackFrom(stateDir, ids, 0, projectBranch, null, [], [], projectBranch, runGit);
}

// Finish the conflicted rebase the stack stopped on, then stack the rest.
export async function resumeStack(
    stateDir: string,
    ids: string[],
    runGit: GitRunner = realGit,
): Promise<StackResult> {
    const { projectDir, worktreesDir } = projectPaths(stateDir);
    const projectBranch = await projectBranchOf(projectDir, runGit);
    await requireWorktrees(worktreesDir, ids);

    let index = -1;
    for (let i = 0; i < ids.length; i++) {
        if (await rebaseInProgress(join(worktreesDir, ids[i]), runGit)) {
            index = i;
            break;
        }
    }
    if (index === -1) {
        throw new MergeError("no ticket has a rebase in progress to resume");
    }

    const id = ids[index];
    const worktree = join(worktreesDir, id);

    // Everything before the conflicted ticket is already stacked: work out which of
    // them have commits of their own, to find the branch this ticket sits on.
    const included: string[] = [];
    const noops: string[] = [];
    let chainBase = projectBranch;
    let chainTip: string | null = null;
    for (let i = 0; i < index; i++) {
        const branch = `worktrees/${ids[i]}`;
        const baseOut = await runGit(projectDir, ["merge-base", chainBase, branch]);
        const countOut = await runGit(projectDir, [
            "rev-list",
            "--count",
            `${baseOut.stdout}..${branch}`,
        ]);
        if (baseOut.code === 0 && countOut.stdout.trim() === "0") {
            noops.push(ids[i]);
            continue;
        }
        included.push(ids[i]);
        chainBase = branch;
        chainTip = ids[i];
    }

    const cont = await runGit(worktree, ["rebase", "--continue"]);
    if (cont.code !== 0) {
        const conflicts = await conflictedPaths(worktree, runGit);
        if (conflicts.length === 0) {
            throw new MergeError(
                `git rebase --continue failed for ${id}: ${cont.stderr}`,
            );
        }
        return {
            projectBranch,
            status: "conflict",
            included,
            noops,
            tip: chainTip,
            conflict: {
                ticket: id,
                worktree,
                conflicts,
                remaining: ids.slice(index + 1),
            },
        };
    }
    included.push(id);
    return stackFrom(
        stateDir,
        ids,
        index + 1,
        `worktrees/${id}`,
        id,
        included,
        noops,
        projectBranch,
        runGit,
    );
}

// Fast-forward the project branch to the last ticket's branch, then move every
// landed ticket from merge-queue/ to done/ in the state repo and close its worktree.
// The fast-forward is the point of no return: after it the tickets are merged, so
// the done move is unconditional. This does NOT commit the state repo; the CLI does
// (right after), so a merged ticket is recorded as done before anything else can
// fail.
export async function landStack(
    stateDir: string,
    ids: string[],
    runGit: GitRunner = realGit,
): Promise<LandResult> {
    const { projectDir, worktreesDir } = projectPaths(stateDir);
    const projectBranch = await projectBranchOf(projectDir, runGit);
    await requireWorktrees(worktreesDir, ids);

    // The branch holding the whole stack is the last ticket that has commits of
    // its own; an all-noop list lands for free.
    const tip = await lastTicketWithCommits(projectDir, projectBranch, ids, runGit);
    if (tip !== null) {
        const ff = await runGit(projectDir, [
            "merge",
            "--ff-only",
            `worktrees/${tip}`,
        ]);
        if (ff.code !== 0) {
            throw new MergeError(
                `worktrees/${tip} no longer fast-forwards ${projectBranch}: ${ff.stderr}`,
            );
        }
    }

    // Merged. Conclude each ticket: move it to done/ AND close its worktree.
    // Teardown is best-effort inside concludeTicket, so it never throws here and
    // can never strand a merged ticket short of done/.
    const landed: string[] = [];
    const worktreesRemoved: string[] = [];
    const branchesDeleted: string[] = [];
    const teardownWarnings: string[] = [];
    for (const id of ids) {
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

    return { projectBranch, landed, worktreesRemoved, branchesDeleted, teardownWarnings };
}

// The last ticket in the chain whose branch has commits beyond the one before it.
async function lastTicketWithCommits(
    projectDir: string,
    projectBranch: string,
    ids: string[],
    runGit: GitRunner,
): Promise<string | null> {
    let chainBase = projectBranch;
    let tip: string | null = null;
    for (const id of ids) {
        const branch = `worktrees/${id}`;
        const baseOut = await runGit(projectDir, ["merge-base", chainBase, branch]);
        if (baseOut.code !== 0) {
            throw new MergeError(
                `could not find merge-base for ${id}: ${baseOut.stderr}`,
            );
        }
        const countOut = await runGit(projectDir, [
            "rev-list",
            "--count",
            `${baseOut.stdout}..${branch}`,
        ]);
        if (countOut.stdout.trim() !== "0") {
            chainBase = branch;
            tip = id;
        }
    }
    return tip;
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [sub, ...ids] = argv;

    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "tickets")))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        await assertGitVersion();
        if (sub === "stack" || sub === "resume" || sub === "land") {
            if (ids.length === 0) {
                console.error(`usage: merge-ticket.ts ${sub} <id> [<id> ...]`);
                process.exit(1);
            }
        }
        if (sub === "stack" || sub === "resume") {
            const result =
                sub === "stack"
                    ? await stackTickets(stateDir, ids)
                    : await resumeStack(stateDir, ids);
            // Emit JSON so the agent reliably reads back what was included, the tip
            // and any conflict, without parsing prose.
            console.log(JSON.stringify(result));
            process.exit(result.status === "conflict" ? 2 : 0);
        } else if (sub === "land") {
            const result = await landStack(stateDir, ids);
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
            console.log(JSON.stringify(result));
        } else {
            console.error("usage: merge-ticket.ts <stack|resume|land> <id> [<id> ...]");
            process.exit(1);
        }
    } catch (err) {
        if (
            err instanceof MergeError ||
            err instanceof WorktreeTeardownError ||
            err instanceof GitVersionError
        ) {
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
