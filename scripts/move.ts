#!/usr/bin/env bun
// Move a ticket directory between state queues.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/move.ts <id> <target-queue>
//
// The script moves the directory only; the queue the ticket sits in is the
// record of its state. The reusable move logic lives in ./lib/move.ts; this
// file is the thin CLI wrapper.

import { join, relative } from "node:path";

import { commitState } from "./lib/commit-state";
import { MoveError, isDir, move } from "./lib/move";

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
