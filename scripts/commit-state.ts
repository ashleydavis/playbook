#!/usr/bin/env bun
// Commit a change in the state repo so its git history is an audit log.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/commit-state.ts "<message>" [pathspec...]
//
// The state repo records how each ticket moved through the pipeline. The
// mutation scripts (move, setup-ticket, fail-ticket, reset-failures) call
// commitState() from their CLI main() to commit their own change automatically;
// agents call this CLI directly for free-form edits (a current-state.md update,
// a newly created ticket) that no script performs.
//
// The reusable commit logic lives in ./lib/commit-state.ts; this file is the
// thin CLI wrapper.

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { CommitError, commitState, realGit } from "./lib/commit-state";

// True if `path` exists (file or directory).
async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [message, ...pathspecs] = argv;
    if (!message) {
        console.error("usage: commit-state.ts <message> [pathspec...]");
        process.exit(1);
    }

    const stateDir = process.cwd();
    if (!(await exists(join(stateDir, "tickets")))) {
        console.error(
            `no tickets/ directory in ${stateDir}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await commitState(stateDir, message, pathspecs);
        if (result.committed) {
            const sha = await realGit(stateDir, ["rev-parse", "--short", "HEAD"]);
            console.log(`committed ${sha.stdout || "HEAD"}`);
        } else if (result.reason === "nothing-staged") {
            console.log("nothing to commit (skipped)");
        } else {
            console.warn(
                "warning: state repo is not a git repo; skipped commit. " +
                    "Run `git init` in the state repo to enable the audit log.",
            );
        }
    } catch (err) {
        if (err instanceof CommitError) {
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
