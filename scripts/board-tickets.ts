#!/usr/bin/env bun
// Report the board: every ticket queue and side pen, with the tickets to display
// in each. Backs pb:board.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/board-tickets.ts
//
// Prints a JSON object keyed by queue (in board order), each value an object:
//
//   { count, truncated, tickets: [{ id, description, dependsOn, failures, priority }] }
//
//   count      total tickets in the queue (the real size, never capped).
//   truncated  true when count exceeds DISPLAY_LIMIT, so the board should show a
//              "..." marker to indicate there are more tickets than displayed.
//   tickets    up to DISPLAY_LIMIT tickets, each with its ID, one-line
//              description, dependency IDs, failure count, and priority.
//
// Every queue is capped at DISPLAY_LIMIT tickets for display so a huge backlog
// never floods the board; the count field still reports the true total. Queues
// are listed in pipeline order with backlog (upcoming work) after todo, then the
// side pen (blocked), then done. Aborted tickets are a dead end, so the board
// does not show them.
// done/ is ordered most-recent-first (by directory mtime); todo/ and backlog/
// are ordered by priority then ID; every other queue is ordered by ticket ID.

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { parseFailures } from "./fail-ticket";
import {
    compareTickets,
    parseDependsOn,
    parseDescription,
    parsePriority,
} from "./ticket-meta";

// Re-export for backward compatibility.
export { parseDescription } from "./ticket-meta";

// Every queue and side pen the board shows, in display order: the pipeline
// queues first (with backlog after todo), then the side pen, then recently
// completed work. Aborted tickets are a dead end and are deliberately left off
// the board.
export const QUEUES = [
    "todo",
    "backlog",
    "in-progress",
    "agent-review",
    "human-review",
    "merge-queue",
    "blocked",
    "done",
] as const;

export type BoardQueue = (typeof QUEUES)[number];

// Most tickets shown per queue. The count field still reports the true total.
export const DISPLAY_LIMIT = 5;

// Longest description kept, so each fits on one line of its own under the ticket
// ID. Longer descriptions are cut to this many characters and end with an
// ellipsis.
export const DESCRIPTION_LIMIT = 100;

// Collapse whitespace and cut a description to DESCRIPTION_LIMIT characters,
// ending with a single-character ellipsis when it was longer.
export function truncateDescription(
    description: string,
    limit: number = DESCRIPTION_LIMIT,
): string {
    const oneLine = description.replace(/\s+/g, " ").trim();
    if (oneLine.length <= limit) {
        return oneLine;
    }
    return oneLine.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
}

export interface BoardTicket {
    id: string;
    description: string;
    dependsOn: string[];
    failures: number;
    priority: number;
}

export interface QueueBoard {
    count: number;
    truncated: boolean;
    tickets: BoardTicket[];
}

export type Board = Record<BoardQueue, QueueBoard>;

// List the ticket directory names in a queue. Returns [] if the queue directory
// does not exist. `recentFirst` orders by directory mtime (newest first) for
// done/; otherwise the names are sorted by ID.
async function listQueue(
    queueDir: string,
    recentFirst: boolean,
): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(queueDir, { withFileTypes: true });
    } catch {
        return [];
    }
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    if (!recentFirst) {
        return names.sort();
    }

    const withTimes = await Promise.all(
        names.map(async (name) => {
            const { mtimeMs } = await stat(join(queueDir, name));
            return { name, mtimeMs };
        }),
    );
    return withTimes
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .map((e) => e.name);
}

// Read a single ticket's display fields from its index.md.
export async function readTicket(
    ticketsDir: string,
    queue: string,
    id: string,
): Promise<BoardTicket> {
    let indexMd: string;
    try {
        indexMd = await readFile(join(ticketsDir, queue, id, "index.md"), "utf8");
    } catch {
        indexMd = "";
    }
    return {
        id,
        description: truncateDescription(parseDescription(indexMd)),
        dependsOn: parseDependsOn(indexMd),
        failures: parseFailures(indexMd),
        priority: parsePriority(indexMd),
    };
}

async function orderedIds(
    ticketsDir: string,
    queue: BoardQueue,
    limit: number,
): Promise<string[]> {
    const queueDir = join(ticketsDir, queue);
    const ids = await listQueue(queueDir, queue === "done");

    if (queue === "todo" || queue === "backlog") {
        const withPriority = await Promise.all(
            ids.map(async (id) => {
                const ticket = await readTicket(ticketsDir, queue, id);
                return { id, priority: ticket.priority };
            }),
        );
        withPriority.sort(compareTickets);
        return withPriority.slice(0, limit).map((t) => t.id);
    }

    return ids.slice(0, limit);
}

// Core logic: given the tickets/ directory, return the per-queue board.
export async function board(
    ticketsDir: string,
    limit: number = DISPLAY_LIMIT,
): Promise<Board> {
    const result = {} as Board;
    for (const queue of QUEUES) {
        const queueDir = join(ticketsDir, queue);
        const allIds = await listQueue(queueDir, queue === "done");
        const shown = await orderedIds(ticketsDir, queue, limit);
        result[queue] = {
            count: allIds.length,
            truncated: allIds.length > limit,
            tickets: await Promise.all(
                shown.map((id) => readTicket(ticketsDir, queue, id)),
            ),
        };
    }
    return result;
}

async function main(): Promise<void> {
    const ticketsDir = join(process.cwd(), "tickets");
    try {
        await readdir(ticketsDir);
    } catch {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }
    console.log(JSON.stringify(await board(ticketsDir)));
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
