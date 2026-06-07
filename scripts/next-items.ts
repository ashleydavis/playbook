#!/usr/bin/env bun
// Report the work the pb:next loop should act on, for every queue it drives.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/next-items.ts
//
// Prints a JSON object keyed by the four queues pb:next drives, each value the
// list of item IDs to act on in that queue (sorted by ID). The keys are in the
// order pb:next processes them each turn (merge-queue, then agent-review, then
// todo, then in-progress: finish work nearest to done before starting new work):
//
//   merge-queue, agent-review, in-progress: every item in the queue.
//   todo: only the actionable items (dependencies resolved), capped so that
//         todo + in-progress together never exceed LIMIT items in flight.
//
// A todo item is actionable only when every one of its dependencies is in done/
// (merged): items cannot start until their dependencies are merged. A dependency
// sitting anywhere else (todo, in-progress, agent-review, human-review,
// merge-queue) or missing entirely leaves the item blocked. done/ is read only
// to resolve dependencies; it is not reported. human-review/ is neither driven
// nor read.
//
// The todo cap shares one budget with in-progress: the implementation stage runs
// at most LIMIT items at once, so todo is trimmed to LIMIT minus however many are
// already in-progress (zero todo once in-progress is full).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// The queues pb:next drives, in the order it processes them each turn
// (finish work nearest to done before starting anything new). Reported in this
// key order.
export const QUEUES = [
    "merge-queue",
    "agent-review",
    "todo",
    "in-progress",
] as const;

export type ReportedQueue = (typeof QUEUES)[number];

export type NextItemsReport = Record<ReportedQueue, string[]>;

// Most items in flight in the implementation stage at once (todo admitted this
// pass plus items already in-progress, combined).
export const LIMIT = 10;

// Pull the dependency IDs out of an index.md's `**Depends on:**` line.
// Returns [] when the line is absent (the template drops it when there are
// none), lists nothing, or uses the literal "none" sentinel (some generators
// write `**Depends on:** none` instead of removing the line).
export function parseDependsOn(indexMd: string): string[] {
    const match = indexMd.match(/^\*\*Depends on:\*\*(.*)$/m);
    if (!match) {
        return [];
    }
    return match[1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .filter((id) => id.toLowerCase() !== "none");
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
    const inProgress = await listQueue(join(workItemsDir, "in-progress"));
    // The implementation stage runs at most `limit` items at once, and todo +
    // in-progress share that budget. Trim todo to what is left after the items
    // already in-progress (zero once in-progress is full).
    const todoBudget = Math.max(0, limit - inProgress.length);

    const todoIds = await listQueue(join(workItemsDir, "todo"));
    const done = new Set(await listQueue(join(workItemsDir, "done")));

    const todoReady: string[] = [];
    for (const id of todoIds) {
        if (todoReady.length >= todoBudget) {
            break;
        }
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
        // Ready only when every dependency has been merged (is in done/).
        if (deps.every((dep) => done.has(dep))) {
            todoReady.push(id);
        }
    }

    return {
        "merge-queue": await listQueue(join(workItemsDir, "merge-queue")),
        "agent-review": await listQueue(join(workItemsDir, "agent-review")),
        todo: todoReady,
        "in-progress": inProgress,
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
