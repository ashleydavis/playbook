#!/usr/bin/env bun
// Start a pb:review session by building the **review snapshot**.
//
// Snapshots the human-review/ queue into a temporary, uncommitted JSON file (the
// review snapshot). That snapshot (not the live queue) is the source of truth
// for the review checklist: its order fixes the numbering, each row stays in it
// after the ticket leaves the queue, and each row carries a precomputed render
// card so the review loop prints summaries and inspect menus straight from JSON.
// The menu script renders and updates it:
//   bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review \
//     --snapshot <path> --prompt '...'                       # render
//   bun ../scripts/format-ticket-selection.ts ... --snapshot <path> --mark <id> --outcome approved
//
// The review snapshot is git-ignored and timestamped on every write, so a fresh
// start-review.ts always begins with every box unchecked and a stale snapshot is
// rebuilt automatically. Prints the snapshot path (first line, "snapshot: <path>")
// then the initial checklist.
//
// Usage (run from the state repo root):
//   bun ../scripts/start-review.ts [--queue human-review] [--out <path>]

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { formatTicketSelection, queueLabel } from "./format-ticket-selection";
import { buildSnapshot, writeSnapshot } from "./review-snapshot";

const DEFAULT_SNAPSHOT_FILE = ".pb-review-snapshot.json";

const REVIEW_PROMPT =
    "Which ticket do you want to review? (number, ticket ID, or stop)";

function parseArgs(argv: string[]): { queue: string; out: string } {
    let queue = "human-review";
    let out = join(process.cwd(), DEFAULT_SNAPSHOT_FILE);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--queue" && argv[i + 1]) {
            queue = argv[++i];
        } else if (argv[i] === "--out" && argv[i + 1]) {
            out = argv[++i];
        }
    }
    return { queue, out };
}

async function main(): Promise<void> {
    const { queue, out } = parseArgs(process.argv.slice(2));

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

    console.log(`snapshot: ${out}`);
    console.log("");

    if (snapshot.tickets.length === 0) {
        console.log(`No tickets in ${queueLabel(queue)}.`);
        return;
    }

    console.log(
        formatTicketSelection({
            mode: "pick-one-loop",
            sections: [
                {
                    label: queueLabel(queue),
                    tickets: snapshot.tickets.map((e) => ({
                        id: e.id,
                        description: e.description,
                        checked: false,
                    })),
                },
            ],
            prompt: REVIEW_PROMPT,
            progress: { done: 0, total: snapshot.tickets.length },
        }),
    );
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
