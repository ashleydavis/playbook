#!/usr/bin/env bun
// Set a ticket's priority field in its index.md.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/set-priority.ts <id> <priority>
//
// Finds the ticket in any queue except done/ and aborted/, inserts or replaces
// the `**Priority:**` line, and commits the change.

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { commitState } from "./commit-state";
import { QUEUES } from "./move";

const PRIORITY_FIELD = /^\*\*Priority:\*\*[ \t]*-?\d+[ \t]*$/m;

// Queues where priority may be edited (terminal history is excluded).
const EDITABLE_QUEUES = QUEUES.filter(
    (q) => q !== "done" && q !== "aborted",
) as Exclude<(typeof QUEUES)[number], "done" | "aborted">[];

export class PriorityError extends Error {}

// Insert or replace `**Priority:** N` in an index.md body. When inserting,
// place the line after `**Failures:**` when present.
export function setPriority(indexMd: string, priority: number): string {
    const line = `**Priority:** ${priority}`;
    if (PRIORITY_FIELD.test(indexMd)) {
        return indexMd.replace(PRIORITY_FIELD, line);
    }
    const failuresMatch = /^\*\*Failures:\*\*.*$/m.exec(indexMd);
    if (failuresMatch) {
        const end = failuresMatch.index + failuresMatch[0].length;
        return `${indexMd.slice(0, end)}\n${line}${indexMd.slice(end)}`;
    }
    const dependsMatch = /^\*\*Depends on:\*\*.*$/m.exec(indexMd);
    if (dependsMatch) {
        const end = dependsMatch.index + dependsMatch[0].length;
        return `${indexMd.slice(0, end)}\n${line}${indexMd.slice(end)}`;
    }
    const typeMatch = /^\*\*Type:\*\*.*$/m.exec(indexMd);
    if (typeMatch) {
        const end = typeMatch.index + typeMatch[0].length;
        return `${indexMd.slice(0, end)}\n${line}${indexMd.slice(end)}`;
    }
    return `${line}\n${indexMd}`;
}

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function locateEditableTicket(
    id: string,
    ticketsDir: string,
): Promise<{ queue: string; indexPath: string; indexMd: string }> {
    if (!id) {
        throw new PriorityError("missing id: usage: set-priority.ts <id> <priority>");
    }

    const present = await Promise.all(
        EDITABLE_QUEUES.map((queue) => isDir(join(ticketsDir, queue, id))),
    );
    const matches = EDITABLE_QUEUES.filter((_, i) => present[i]);

    if (matches.length === 0) {
        const inTerminal = await Promise.all(
            (["done", "aborted"] as const).map((queue) =>
                isDir(join(ticketsDir, queue, id)),
            ),
        );
        if (inTerminal.some(Boolean)) {
            throw new PriorityError(
                `cannot change priority for '${id}': ticket is in a terminal queue`,
            );
        }
        throw new PriorityError(`unknown id '${id}': not found in any queue`);
    }
    if (matches.length > 1) {
        throw new PriorityError(
            `ambiguous id '${id}': found in multiple queues (${matches.join(", ")})`,
        );
    }

    const queue = matches[0];
    const indexPath = join(ticketsDir, queue, id, "index.md");
    let indexMd: string;
    try {
        indexMd = await readFile(indexPath, "utf8");
    } catch {
        throw new PriorityError(`no index.md for '${id}' in ${queue}/`);
    }
    return { queue, indexPath, indexMd };
}

export async function updatePriority(
    id: string,
    priority: number,
    ticketsDir: string,
): Promise<{ id: string; queue: string; priority: number }> {
    if (!Number.isFinite(priority) || priority < 0) {
        throw new PriorityError(
            `invalid priority '${priority}': must be a non-negative number`,
        );
    }
    const { queue, indexPath, indexMd } = await locateEditableTicket(id, ticketsDir);
    await writeFile(indexPath, setPriority(indexMd, priority));
    return { id, queue, priority };
}

async function main(argv: string[]): Promise<void> {
    const [id, priorityArg] = argv;
    if (!id || priorityArg === undefined) {
        console.error("usage: set-priority.ts <id> <priority>");
        process.exit(1);
    }

    const priority = Number(priorityArg);
    const ticketsDir = join(process.cwd(), "tickets");
    try {
        await readdir(ticketsDir);
    } catch {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await updatePriority(id, priority, ticketsDir);
        console.log(`set priority for ${id}: ${result.priority}`);
        await commitState(
            process.cwd(),
            `set priority ${id} -> ${result.priority}`,
            [relative(process.cwd(), join(ticketsDir, result.queue, id))],
        );
    } catch (err) {
        if (err instanceof PriorityError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }
}

if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
