// concludeTicket: retire a ticket that has reached its terminal state. It moves
// the ticket directory to done/ AND closes its worktree (removes the worktree,
// deletes its branch, prunes), in one place, so every path that concludes a ticket
// does both. Two callers share it:
//   - conclude-debug.ts: a Debug ticket, which agent-review sends straight to done/
//     without ever going through the merge train.
//   - merge-ticket.ts (landTrain): each ticket a merge lands.
//
// The worktree teardown is best-effort: the move is the meaningful state change and
// is returned for the caller to commit, whereas a leaked worktree is harmless and
// reaped later (pb:next / reset-loop). So a teardown failure is captured in
// `teardownWarning` rather than thrown, and can never strand a concluded ticket
// short of done/. Committing the state repo is left to the CLI wrapper, keeping
// this unit-testable without git.

import { join, resolve } from "node:path";

import { move, type MoveResult } from "./move";
import {
    realGit,
    removeWorktreeAndBranch,
    type GitRunner,
} from "./worktree-teardown";

export interface ConcludeResult {
    move: MoveResult;
    worktreeRemoved: string | null;
    branchDeleted: string | null;
    teardownWarning: string | null;
}

export async function concludeTicket(
    stateDir: string,
    id: string,
    runGit: GitRunner = realGit,
): Promise<ConcludeResult> {
    // Move to done/ first: this is the state change that matters, and it must
    // succeed (a MoveError propagates) before we touch the worktree.
    const moved = await move(id, "done", join(stateDir, "tickets"));

    const projectDir = resolve(stateDir, "..", "project");
    const removed: string[] = [];
    const deleted: string[] = [];
    let teardownWarning: string | null = null;
    try {
        await removeWorktreeAndBranch(
            projectDir,
            join(projectDir, "worktrees", id),
            `worktrees/${id}`,
            runGit,
            removed,
            deleted,
        );
        await runGit(projectDir, ["worktree", "prune"]);
    } catch (err) {
        teardownWarning = err instanceof Error ? err.message : String(err);
    }

    return {
        move: moved,
        worktreeRemoved: removed[0] ?? null,
        branchDeleted: deleted[0] ?? null,
        teardownWarning,
    };
}
