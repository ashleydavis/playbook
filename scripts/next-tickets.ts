#!/usr/bin/env bun
// Report the work the pb:next loop should act on, for every queue it drives.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/next-tickets.ts
//
// Prints a JSON object keyed by the four queues pb:next drives, each value the
// list of ticket IDs to act on in that queue. The keys are in the order pb:next
// processes them each turn (merge-queue, then agent-review, then todo, then
// in-progress: finish work nearest to done before starting new work):
//
//   merge-queue, agent-review, in-progress: every ticket in the queue.
//   todo: only the actionable tickets (dependencies resolved), sorted by
//         **Priority:** ascending then ID, capped so that todo + in-progress
//         together never exceed LIMIT tickets in flight.
//
// A todo ticket is actionable only when every one of its dependencies is in done/
// (merged): tickets cannot start until their dependencies are merged. A dependency
// sitting anywhere else (todo, in-progress, agent-review, human-review,
// merge-queue) or missing entirely leaves the ticket blocked. done/ is read only
// to resolve dependencies; it is not reported. human-review/ and backlog/ are
// neither driven nor read.
//
// The todo cap shares one budget with in-progress: the implementation stage runs
// at most LIMIT tickets at once, so todo is trimmed to LIMIT minus however many are
// already in-progress (zero todo once in-progress is full).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
    compareTickets,
    parseDependsOn,
    parsePriority,
} from "./lib/ticket-meta";

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

export type NextTicketsReport = Record<ReportedQueue, string[]>;

// Most tickets in flight in the implementation stage at once (todo admitted this
// pass plus tickets already in-progress, combined).
export const LIMIT = 10;

// List the ticket directory names in a queue, sorted. Returns [] if the queue
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

// Core logic: given the tickets/ directory, return the per-queue report.
// `ticketsDir` is the path to the state repo's `tickets/` directory.
export async function nextTickets(
    ticketsDir: string,
    limit: number = LIMIT,
): Promise<NextTicketsReport> {
    const inProgress = await listQueue(join(ticketsDir, "in-progress"));
    const todoBudget = Math.max(0, limit - inProgress.length);

    const todoIds = await listQueue(join(ticketsDir, "todo"));
    const done = new Set(await listQueue(join(ticketsDir, "done")));

    const actionable: Array<{ id: string; priority: number }> = [];
    for (const id of todoIds) {
        let indexMd: string;
        try {
            indexMd = await readFile(
                join(ticketsDir, "todo", id, "index.md"),
                "utf8",
            );
        } catch {
            indexMd = "";
        }
        const deps = parseDependsOn(indexMd);
        if (deps.every((dep) => done.has(dep))) {
            actionable.push({ id, priority: parsePriority(indexMd) });
        }
    }

    actionable.sort(compareTickets);
    const todoReady = actionable.slice(0, todoBudget).map((t) => t.id);

    return {
        "merge-queue": await listQueue(join(ticketsDir, "merge-queue")),
        "agent-review": await listQueue(join(ticketsDir, "agent-review")),
        todo: todoReady,
        "in-progress": inProgress,
    };
}

// Thin CLI wrapper. Not exercised by the unit tests.
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
    const report = await nextTickets(ticketsDir);
    console.log(JSON.stringify(report));
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
