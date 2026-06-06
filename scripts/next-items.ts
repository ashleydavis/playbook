#!/usr/bin/env bun
// Report the work the pb:next loop should act on, for every queue it drives.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/next-items.ts
//
// Prints a JSON object keyed by the four queues pb:next drives, each value the
// list of item IDs to act on in that queue (sorted by ID):
//
//   merge-queue, in-progress, agent-review: every item in the queue.
//   todo: only the actionable items (dependencies resolved), capped at LIMIT.
//
// A todo item is actionable when none of its dependencies are still sitting in
// todo/: if a dependency is not in todo/ we assume it has already been actioned.
// The dependency rule looks only at todo/; the other three queues are listed in
// full. human-review/ and done/ are not driven by pb:next, so are not reported.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// The queues pb:next drives, in pipeline order. Reported in this key order.
export const QUEUES = [
    "merge-queue",
    "todo",
    "in-progress",
    "agent-review",
] as const;

export type ReportedQueue = (typeof QUEUES)[number];

export type NextItemsReport = Record<ReportedQueue, string[]>;

// Most todo items the loop will pick up in one pass.
export const LIMIT = 10;

// Pull the dependency IDs out of an index.md's `**Depends on:**` line.
// Returns [] when the line is absent (the template drops it when there are
// none) or lists nothing.
export function parseDependsOn(indexMd: string): string[] {
    const match = indexMd.match(/^\*\*Depends on:\*\*(.*)$/m);
    if (!match) {
        return [];
    }
    return match[1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
}

// List the item directory names in a queue, sorted. Returns [] if the queue
// directory does not exist.
async function listQueue(queueDir: string): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(queueDir, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

// Core logic: given the work-items/ directory, return the per-queue report.
// `workItemsDir` is the path to the state repo's `work-items/` directory.
export async function nextItems(
    workItemsDir: string,
    limit: number = LIMIT,
): Promise<NextItemsReport> {
    const todoIds = await listQueue(join(workItemsDir, "todo"));
    const inTodo = new Set(todoIds);

    const todoReady: string[] = [];
    for (const id of todoIds) {
        let indexMd: string;
        try {
            indexMd = await readFile(
                join(workItemsDir, "todo", id, "index.md"),
                "utf8",
            );
        } catch {
            // No index.md: nothing to read dependencies from, treat as ready.
            indexMd = "";
        }
        const deps = parseDependsOn(indexMd);
        // Ready when no dependency is still waiting in todo/.
        if (deps.every((dep) => !inTodo.has(dep))) {
            todoReady.push(id);
            if (todoReady.length >= limit) {
                break;
            }
        }
    }

    return {
        "merge-queue": await listQueue(join(workItemsDir, "merge-queue")),
        todo: todoReady,
        "in-progress": await listQueue(join(workItemsDir, "in-progress")),
        "agent-review": await listQueue(join(workItemsDir, "agent-review")),
    };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(): Promise<void> {
    const workItemsDir = join(process.cwd(), "work-items");
    try {
        await readdir(workItemsDir);
    } catch {
        console.error(
            `no work-items/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }
    const report = await nextItems(workItemsDir);
    console.log(JSON.stringify(report));
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
