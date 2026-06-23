// Shared queue-move logic: validate, locate a ticket across queues, and move its
// directory. Extracted here because move() and QUEUES are imported by several
// callers (merge-ticket, reset-loop, setup-ticket, fail-ticket, set-priority);
// the CLI wrapper lives in ../move.ts.

import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

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
export async function isDir(path: string): Promise<boolean> {
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
