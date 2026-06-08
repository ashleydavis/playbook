#!/usr/bin/env bun
// Increment a work item's failure count, stored in its index.md.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/fail-work-item.ts <id>
//
// Each time a work item fails for any reason (a sub-agent timeout, a not-proven
// Debug, a failed Fix review, a failed check, an unresolvable conflict, failing
// post-merge checks) the caller records it here. A human rejection in pb:review
// is NOT a failure: it does not call this; it resets the count (see
// reset-failures.ts). The count lives in the item's index.md as a
// `**Failures:** N` field, so the todo-vs-blocked decision is driven by a
// deterministic number rather than an agent re-counting History. The script
// finds the item in whatever queue it currently sits in, bumps the field
// (creating it at 1 when absent), writes index.md back, and prints the new count
// on its own line so the caller can read it directly.

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { commitState } from "./commit-state";
import { QUEUES } from "./move";

// Raised for any expected, user-facing failure (missing id, unknown id, no
// index.md). The CLI maps this to a non-zero exit with a clean message; tests
// assert on it.
export class FailError extends Error {}

// The `**Failures:** N` field, matched on its own clean line so a mention of the
// words in prose is never picked up as the counter.
const FIELD = /^\*\*Failures:\*\*[ \t]*(\d+)[ \t]*$/m;

// Current failure count from an index.md body (0 when the field is absent).
export function parseFailures(indexMd: string): number {
    const match = indexMd.match(FIELD);
    return match ? Number(match[1]) : 0;
}

// Write the `**Failures:** N` field into an index.md body at the given count:
// replace it in place when present, else insert it after the **Depends on:**
// line, else **Type:**, else **ID:**, else at the top.
export function setFailures(indexMd: string, count: number): string {
    const line = `**Failures:** ${count}`;
    if (FIELD.test(indexMd)) {
        return indexMd.replace(FIELD, line);
    }
    const anchor =
        /^\*\*Depends on:\*\*.*$/m.exec(indexMd) ??
        /^\*\*Type:\*\*.*$/m.exec(indexMd) ??
        /^\*\*ID:\*\*.*$/m.exec(indexMd);
    if (anchor) {
        const end = anchor.index + anchor[0].length;
        return `${indexMd.slice(0, end)}\n${line}${indexMd.slice(end)}`;
    }
    return `${line}\n${indexMd}`;
}

// Increment the count in an index.md body. Returns the new text and count.
export function bumpFailures(indexMd: string): { text: string; count: number } {
    const count = parseFailures(indexMd) + 1;
    return { text: setFailures(indexMd, count), count };
}

// True if `path` exists and is a directory.
async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

// Locate the single queue holding the item and read its index.md. Shared by
// fail-work-item and reset-failures. Throws FailError when the id is missing,
// not found, found in more than one queue, or has no index.md.
export async function locateItem(
    id: string,
    workItemsDir: string,
): Promise<{ queue: string; indexPath: string; indexMd: string }> {
    if (!id) {
        throw new FailError("missing id");
    }

    const present = await Promise.all(
        QUEUES.map((queue) => isDir(join(workItemsDir, queue, id))),
    );
    const matches = QUEUES.filter((_, i) => present[i]);

    if (matches.length === 0) {
        throw new FailError(`unknown id '${id}': not found in any queue`);
    }
    if (matches.length > 1) {
        throw new FailError(
            `ambiguous id '${id}': found in multiple queues (${matches.join(", ")})`,
        );
    }

    const queue = matches[0];
    const indexPath = join(workItemsDir, queue, id, "index.md");
    let indexMd: string;
    try {
        indexMd = await readFile(indexPath, "utf8");
    } catch {
        throw new FailError(`no index.md for '${id}' in ${queue}/`);
    }
    return { queue, indexPath, indexMd };
}

// Core logic: find the item, increment its failure count, return the new count.
// `workItemsDir` is the state repo's `work-items/` dir.
export async function recordFailure(
    id: string,
    workItemsDir: string,
): Promise<{ id: string; queue: string; count: number }> {
    const { queue, indexPath, indexMd } = await locateItem(id, workItemsDir);
    const { text, count } = bumpFailures(indexMd);
    await writeFile(indexPath, text);
    return { id, queue, count };
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(argv: string[]): Promise<void> {
    const [id] = argv;

    if (!id) {
        console.error("usage: fail-work-item.ts <id>");
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
        const result = await recordFailure(id, workItemsDir);
        // Print the new count on its own line so the caller can read it directly.
        console.log(result.count);
        // Commit the state change here in main(), not in the exported
        // recordFailure() core, so unit tests stay commit-free; the commit path
        // is covered by smoke-fail-work-item.sh. Item-scoped so it captures the
        // index.md bump and any History note already written for this failure.
        await commitState(
            process.cwd(),
            `record failure for ${id} (count ${result.count})`,
            ["work-items/" + result.queue + "/" + id],
        );
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
