#!/usr/bin/env bun
// Move a ticket directory between state queues.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/move.ts <id> <target-queue>
//
// The script moves the directory only. Updating the `current-state.md`
// narrative remains the responsibility of the invoking agent.

import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { commitState } from "./commit-state";

// The valid queues. The first six are the pipeline, in order. `backlog`,
// `blocked`, and `aborted` are side pens, not pipeline stages. `backlog` holds
// tickets captured for later; only a human promotes them to `todo/`. `blocked`
// is where a stage parks a problem ticket that needs human attention; only a
// human re-admits it (blocked -> todo). `aborted` is where the developer kills
// a ticket during pb:review: the work is abandoned and the directory is its
// terminal record.
export const QUEUES = [
    "todo",
    "in-progress",
    "agent-review",
    "human-review",
    "merge-queue",
    "done",
    "backlog",
    "blocked",
    "aborted",
] as const;

export type Queue = (typeof QUEUES)[number];

export interface MoveResult {
    id: string;
    from: Queue;
    to: Queue;
    fromPath: string;
    toPath: string;
    noop: boolean;
}

// Raised for any expected, user-facing failure (bad queue, unknown id, etc.).
// The CLI maps this to a non-zero exit with a clean message; tests assert on it.
export class MoveError extends Error {}

function isQueue(value: string): value is Queue {
    return (QUEUES as readonly string[]).includes(value);
}

// True if `path` exists and is a directory.
async function isDir(path: string): Promise<boolean> {
    try {
        const info = await stat(path);
        return info.isDirectory();
    } catch {
        return false;
    }
}

// Core logic: validate, locate the ticket across queues, and move it.
// `ticketsDir` is the path to the state repo's `tickets/` directory.
export async function move(
    id: string,
    targetQueue: string,
    ticketsDir: string,
): Promise<MoveResult> {
    if (!id) {
        throw new MoveError("missing id: usage: move.ts <id> <target-queue>");
    }

    if (!isQueue(targetQueue)) {
        throw new MoveError(
            `invalid queue '${targetQueue}': must be one of ${QUEUES.join(", ")}`,
        );
    }

    // Find every queue that contains a directory named `id`.
    const present = await Promise.all(
        QUEUES.map((queue) => isDir(join(ticketsDir, queue, id))),
    );
    const matches = QUEUES.filter((_, i) => present[i]);

    if (matches.length === 0) {
        throw new MoveError(`unknown id '${id}': not found in any queue`);
    }
    if (matches.length > 1) {
        throw new MoveError(
            `ambiguous id '${id}': found in multiple queues (${matches.join(", ")})`,
        );
    }

    const from = matches[0];
    const fromPath = join(ticketsDir, from, id);
    const toPath = join(ticketsDir, targetQueue, id);

    if (from === targetQueue) {
        return { id, from, to: targetQueue, fromPath, toPath, noop: true };
    }

    if (await isDir(toPath)) {
        // Should not happen given the uniqueness check above, but guard anyway.
        throw new MoveError(`destination already exists: ${toPath}`);
    }

    // Ensure the destination queue directory exists, then move.
    await mkdir(dirname(toPath), { recursive: true });

    try {
        await rename(fromPath, toPath);
    } catch {
        // Fall back to copy-then-delete (e.g. rename across filesystems).
        await cp(fromPath, toPath, { recursive: true });
        await rm(fromPath, { recursive: true, force: true });
    }

    return { id, from, to: targetQueue, fromPath, toPath, noop: false };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [id, targetQueue] = argv;

    if (!id || !targetQueue) {
        console.error("usage: move.ts <id> <target-queue>");
        process.exit(1);
    }

    const ticketsDir = join(process.cwd(), "tickets");
    if (!(await isDir(ticketsDir))) {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await move(id, targetQueue, ticketsDir);
        if (result.noop) {
            console.log(`${id} is already in ${result.to} (no-op)`);
        } else {
            console.log(`moved ${id}: ${result.fromPath} -> ${result.toPath}`);
            // Commit the state change. The commit lives here in main(), not in
            // the exported move() core, so unit tests stay commit-free; the
            // commit path is covered by smoke-move.sh. Ticket-scoped pathspecs (the
            // old and new dirs) let the -A add pick up both the deletion at the
            // old path and the new directory with any evidence/History the agent
            // wrote before the move.
            await commitState(
                process.cwd(),
                `move ${id} ${result.from} -> ${result.to}`,
                [result.fromPath, result.toPath].map((p) =>
                    relative(process.cwd(), p),
                ),
            );
        }
    } catch (err) {
        if (err instanceof MoveError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }
}

// Only run the CLI when invoked directly, not when imported by tests.
// Comparing argv[1] to __filename avoids `import.meta`, which ts-jest's
// CommonJS compile rejects; Bun exposes __filename in ES modules too.
if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
