#!/usr/bin/env bun
// Reset a work item's failure count to 0, stored in its index.md.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/reset-failures.ts <id>
//
// Used by pb:review when a human rejects an item back to todo/. A rejection is
// not a failure: the developer is asking for rework, so the item starts that
// rework with a clean slate rather than carrying its prior failure count toward
// the blocked cap. The script finds the item in whatever queue it sits in, sets
// its `**Failures:**` field to 0, and prints 0.

import { join } from "node:path";
import { readdir, writeFile } from "node:fs/promises";

import { commitState } from "./commit-state";
import { FailError, locateItem, setFailures } from "./fail-work-item";

// Core logic: find the item and set its failure count to 0.
export async function resetFailures(
    id: string,
    workItemsDir: string,
): Promise<{ id: string; queue: string; count: number }> {
    const { queue, indexPath, indexMd } = await locateItem(id, workItemsDir);
    await writeFile(indexPath, setFailures(indexMd, 0));
    return { id, queue, count: 0 };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [id] = argv;

    if (!id) {
        console.error("usage: reset-failures.ts <id>");
        process.exit(1);
    }

    const workItemsDir = join(process.cwd(), "work-items");
    try {
        await readdir(workItemsDir);
    } catch {
        console.error(
            `no work-items/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await resetFailures(id, workItemsDir);
        console.log(result.count);
        // Commit the state change here in main(), not in the exported
        // resetFailures() core, so unit tests stay commit-free; the commit path
        // is covered by smoke-reset-failures.sh. Item-scoped to the reset item.
        await commitState(process.cwd(), `reset failures for ${id}`, [
            "work-items/" + result.queue + "/" + id,
        ]);
    } catch (err) {
        if (err instanceof FailError) {
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
