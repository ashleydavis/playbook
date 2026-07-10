#!/usr/bin/env bun
// Allocate a collision-proof ticket ID, or check whether an ID is free.
//
// A ticket ID must be unique across every queue for the ticket's whole life,
// including after it lands in done/. Minting IDs by eyeballing one queue's
// numbering is how a feature whose earlier tickets already reached done/ gets its
// counter restarted at 1, colliding with a done/ ticket and later jamming move().
// The ID-minting skills (pb:add, pb:plan:break, pb:todo:break, pb:debug) call
// this instead of numbering by hand.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/next-id.ts <prefix> [--debug]
//   bun playbook/scripts/next-id.ts --check <id>
//
//   <prefix>        print the next free `${prefix}-${n}` (or `${prefix}-d${n}`
//                   with --debug), scanning every queue including done/.
//   --check <id>    print "free" and exit 0 if <id> is unused everywhere;
//                   print "taken: <queues>" and exit 1 if it already exists.
//
// The pure allocation helpers are exported (and unit-tested in next-id.test.ts);
// only listAllIds()/idLocations() touch disk. This keeps the logic here in the
// one place that uses it rather than in lib/, which is reserved for symbols
// imported by two or more non-test files.

import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Every queue directory a ticket ID can occupy. Mirrors QUEUES in lib/move.ts,
// but kept as its own list so an ID scan never depends on move()'s ordering.
export const ID_QUEUES = [
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

// List every ticket ID present in any queue. `ticketsDir` is the state repo's
// tickets/ directory. A missing queue directory contributes nothing.
export async function listAllIds(ticketsDir: string): Promise<string[]> {
    const perQueue = await Promise.all(
        ID_QUEUES.map(async (queue) => {
            try {
                const entries = await readdir(join(ticketsDir, queue), {
                    withFileTypes: true,
                });
                return entries
                    .filter((e) => e.isDirectory())
                    .map((e) => e.name);
            } catch {
                // Queue directory absent: no IDs from it.
                return [];
            }
        }),
    );
    return perQueue.flat();
}

// The queues in which `id` currently exists. Empty when the ID is unused, so a
// caller can both test existence (length > 0) and report where the clash is.
export async function idLocations(
    id: string,
    ticketsDir: string,
): Promise<string[]> {
    const present = await Promise.all(
        ID_QUEUES.map(async (queue) => {
            try {
                const entries = await readdir(join(ticketsDir, queue), {
                    withFileTypes: true,
                });
                return entries.some((e) => e.isDirectory() && e.name === id);
            } catch {
                return false;
            }
        }),
    );
    return ID_QUEUES.filter((_, i) => present[i]);
}

// Escape a feature prefix for safe embedding in a RegExp (prefixes are plain
// kebab-case today, but never trust an input string in a pattern).
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The lowest number `n` such that `${prefix}-${tag}${n}` is free among `allIds`,
// i.e. one past the highest existing number for that prefix+tag. `tag` is "" for
// ordinary tickets and "d" for Debug tickets (pb:debug IDs like `search-d1`);
// the two form independent sequences. Returns 1 when the prefix has no IDs yet.
//
// Anchored and digits-only after the tag, so `live-logs` never matches
// `live-logs-pod-picker-1` and the `d` tag never matches an ordinary `-3`.
export function nextNumber(
    prefix: string,
    allIds: Iterable<string>,
    tag = "",
): number {
    const pattern = new RegExp(
        `^${escapeRegExp(prefix)}-${escapeRegExp(tag)}(\\d+)$`,
    );
    let max = 0;
    for (const id of allIds) {
        const match = id.match(pattern);
        if (match) {
            const n = Number(match[1]);
            if (n > max) {
                max = n;
            }
        }
    }
    return max + 1;
}

// The next free ID for a feature prefix: `${prefix}-${tag}${nextNumber}`. The
// result is guaranteed not to collide with any ID in `allIds`, including tickets
// already retired to done/.
export function nextId(
    prefix: string,
    allIds: Iterable<string>,
    tag = "",
): string {
    return `${prefix}-${tag}${nextNumber(prefix, allIds, tag)}`;
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const ticketsDir = join(process.cwd(), "tickets");

    const [first, second] = argv;
    if (!first) {
        console.error(
            "usage: next-id.ts <prefix> [--debug]  |  next-id.ts --check <id>",
        );
        process.exit(1);
    }

    if (first === "--check") {
        if (!second) {
            console.error("usage: next-id.ts --check <id>");
            process.exit(1);
        }
        const locations = await idLocations(second, ticketsDir);
        if (locations.length === 0) {
            console.log("free");
            return;
        }
        console.log(`taken: ${locations.join(", ")}`);
        process.exit(1);
    }

    const debug = second === "--debug";
    if (second && !debug) {
        console.error(`unknown argument '${second}': expected --debug`);
        process.exit(1);
    }

    const allIds = await listAllIds(ticketsDir);
    console.log(nextId(first, allIds, debug ? "d" : ""));
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
