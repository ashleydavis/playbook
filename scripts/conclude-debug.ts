#!/usr/bin/env bun
// Conclude a Debug ticket: move it from agent-review/ to done/ and close its
// worktree. A Debug ticket is a throwaway investigation that agent-review sends
// straight to done/ (it spawns a Fix ticket separately), so unlike a merged
// ticket it never goes through the merge train that would otherwise tear its
// worktree down. This is that missing teardown, run at the point the Debug ticket
// concludes.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/conclude-debug.ts <id>
//
// The move + worktree teardown is the shared concludeTicket(); this wrapper adds
// the state-repo commit (kept out of the core so it stays unit-testable) and the
// user-facing output.

import { relative } from "node:path";

import { commitState } from "./lib/commit-state";
import { concludeTicket } from "./lib/conclude-ticket";
import { MoveError, isDir } from "./lib/move";

async function main(argv: string[]): Promise<void> {
    const [id] = argv;
    if (!id) {
        console.error("usage: conclude-debug.ts <id>");
        process.exit(1);
    }

    const stateDir = process.cwd();
    if (!(await isDir(`${stateDir}/tickets`))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await concludeTicket(stateDir, id);
        // Commit the done/ move, ticket-scoped, exactly as move.ts does. The
        // worktree teardown touches only the project repo, so nothing to commit
        // for it here.
        await commitState(
            stateDir,
            `conclude debug ${id} ${result.move.from} -> ${result.move.to}`,
            [result.move.fromPath, result.move.toPath].map((p) =>
                relative(stateDir, p),
            ),
        );
        console.log(
            `concluded ${id}: moved to done/` +
                (result.worktreeRemoved
                    ? `, worktree removed`
                    : `, no worktree to remove`),
        );
        if (result.teardownWarning) {
            console.error(
                `warning: ${id} concluded but worktree teardown failed (leak reaped later): ${result.teardownWarning}`,
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
if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
