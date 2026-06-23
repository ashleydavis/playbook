#!/usr/bin/env bun
// Start a pb:review session by building the **review snapshot**.
//
// Snapshots the human-review/ queue into a temporary, uncommitted JSON file (the
// review snapshot). That snapshot (not the live queue) is the source of truth
// for the review checklist: its order fixes the numbering, each row stays in it
// after the ticket leaves the queue, and each row carries a precomputed render
// card so the review loop prints summaries and inspect menus straight from JSON.
//
// This script does not render the checklist; format-ticket-selection.ts is the
// single render path for the menu, on the first display and every reprint alike:
//   bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review \
//     --prompt '...'                                         # render
//   bun ../scripts/format-ticket-selection.ts ... --mark <id> --outcome approved
//
// The review snapshot is git-ignored and timestamped on every write, so a fresh
// start-review.ts always begins with every box unchecked and a stale snapshot is
// rebuilt automatically. It writes to a fixed default location that
// format-ticket-selection.ts reads back on its own, so this script confirms the
// snapshot was built (or reports an empty queue) without printing its path;
// render the initial menu with format-ticket-selection.ts.
//
// Usage (run from the state repo root):
//   bun ../scripts/start-review.ts [--queue human-review]

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { queueLabel } from "./format-ticket-selection";
import { buildSnapshot, writeSnapshot } from "./lib/review-snapshot";
import { DEFAULT_SNAPSHOT_FILE } from "./review-snapshot";

function parseArgs(argv: string[]): { queue: string } {
    let queue = "human-review";
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--queue" && argv[i + 1]) {
            queue = argv[++i];
        }
    }
    return { queue };
}

async function main(): Promise<void> {
    const { queue } = parseArgs(process.argv.slice(2));
    const out = join(process.cwd(), DEFAULT_SNAPSHOT_FILE);

    const ticketsDir = join(process.cwd(), "tickets");
    try {
        await readdir(ticketsDir);
    } catch {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    const snapshot = await buildSnapshot(ticketsDir, queue);
    await writeSnapshot(out, snapshot);

    if (snapshot.tickets.length === 0) {
        console.log(`No tickets in ${queueLabel(queue)}.`);
        return;
    }

    console.log(
        `Review snapshot built for ${queueLabel(queue)} ` +
            `(${snapshot.tickets.length} ticket(s)). ` +
            `Render the checklist with format-ticket-selection.ts.`,
    );
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
