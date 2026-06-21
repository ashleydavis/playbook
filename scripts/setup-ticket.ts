#!/usr/bin/env bun
// Admit a ticket into the implementation stage.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/setup-ticket.ts <id>
//
// Performs the two fiddly steps of admission as one atomic, tested operation so
// the agent never has to compute paths or run `git worktree` by hand:
//   1. Move tickets/todo/<id>/ -> tickets/in-progress/<id>/.
//      Tickets in backlog/ must be promoted to todo/ first (pb:promote or move.ts).
//   2. Create a git worktree for the ticket against the PROJECT repo
//      (../project) at ../project/worktrees/<id>, on a new branch named
//      worktrees/<id> based at the project's current HEAD.
//
// Paths are resolved relative to the state repo (the cwd): the project repo is
// ../project and worktrees live inside it at ../project/worktrees/ (gitignored
// by the project repo).
//
// Each worktree gets its own branch (worktrees/<id>). Git refuses to check the
// same branch out in two worktrees, and the project repo already has its branch
// checked out, so the worktree cannot share it; a per-ticket branch off the
// current commit avoids the collision and keeps the ticket's commits on a named
// ref. merge-ticket.ts cherry-picks that branch's commits onto the merge train
// at merge time and deletes the branch once the train lands.

import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { commitState } from "./commit-state";
import { move, type MoveResult } from "./move";

// Raised for any expected, user-facing failure (missing id, no project repo,
// git failure). The CLI maps this to a non-zero exit with a clean message;
// tests assert on it.
export class SetupError extends Error {}

// Injectable git runner so the unit test can assert the command without a real
// repo; the smoke test exercises the real one against a throwaway git repo.
export type GitRunner = (
    projectDir: string,
    worktreePath: string,
    branch: string,
) => Promise<void>;

export interface SetupResult {
    id: string;
    move: MoveResult;
    worktreePath: string;
    worktreeCreated: boolean;
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

// Default runner: `git -C <projectDir> worktree add -b <branch> <worktreePath>`,
// which creates the new branch at the project's current HEAD and checks it out
// in the worktree.
const realGit: GitRunner = async (projectDir, worktreePath, branch) => {
    const proc = Bun.spawn(
        ["git", "-C", projectDir, "worktree", "add", "-b", branch, worktreePath],
        { stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    if (code !== 0) {
        const err = (await new Response(proc.stderr).text()).trim();
        throw new SetupError(`git worktree add failed: ${err}`);
    }
};

// Core logic: create the ticket's worktree and admit it into in-progress/.
// `stateDir` is the state repo root (the cwd when run via the CLI). `runGit` is
// injectable for testing; it defaults to the real git invocation.
export async function setupTicket(
    id: string,
    stateDir: string,
    runGit: GitRunner = realGit,
): Promise<SetupResult> {
    if (!id) {
        throw new SetupError("missing id: usage: setup-ticket.ts <id>");
    }

    const ticketsDir = join(stateDir, "tickets");
    const projectDir = resolve(stateDir, "..", "project");
    const worktreesDir = resolve(stateDir, "..", "project", "worktrees");
    const worktreePath = join(worktreesDir, id);
    const branch = `worktrees/${id}`;

    if (!(await exists(projectDir))) {
        throw new SetupError(`no project repo at ${projectDir}`);
    }

    const todoPath = join(ticketsDir, "todo", id);
    const inProgressPath = join(ticketsDir, "in-progress", id);
    if (!(await exists(todoPath)) && !(await exists(inProgressPath))) {
        throw new SetupError(
            `ticket '${id}' is not in todo/: promote from backlog/ first`,
        );
    }

    // Create the worktree first, so a git failure leaves the ticket untouched in
    // todo/ for a clean retry. Skip if it already exists, so a retry after a
    // half-finished run still converges instead of erroring on an existing
    // worktree.
    await mkdir(worktreesDir, { recursive: true });
    let worktreeCreated = false;
    if (!(await exists(worktreePath))) {
        await runGit(projectDir, worktreePath, branch);
        worktreeCreated = true;
    }

    // Then admit the ticket. move() is a no-op when it is already in in-progress/,
    // so a retry converges rather than failing.
    const moved = await move(id, "in-progress", ticketsDir);

    return { id, move: moved, worktreePath, worktreeCreated };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [id] = argv;
    if (!id) {
        console.error("usage: setup-ticket.ts <id>");
        process.exit(1);
    }

    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "tickets")))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await setupTicket(id, stateDir);
        const note = result.worktreeCreated
            ? `worktree ${result.worktreePath}`
            : `worktree ${result.worktreePath} (already existed)`;
        console.log(`admitted ${id}: ${result.move.toPath}, ${note}`);
        // Commit the state change here in main(), not in the exported
        // setupTicket() core, so unit tests stay commit-free; the commit path is
        // covered by smoke-setup-ticket.sh. The worktree it creates lives in
        // the project repo and is irrelevant to the state commit. Ticket-scoped to
        // the admitted ticket's old and new dirs. Skip on an idempotent re-run
        // (the move was a no-op): there is nothing to commit, and the now-gone
        // todo/ pathspec would make `git add` error on a non-matching pathspec.
        if (!result.move.noop) {
            await commitState(stateDir, `admit ${id} to in-progress`, [
                "tickets/in-progress/" + id,
                "tickets/todo/" + id,
            ]);
        }
    } catch (err) {
        if (err instanceof SetupError) {
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
