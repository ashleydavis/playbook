#!/usr/bin/env bun
// List the work items in todo/ that are ready to be actioned.
//
// Usage (run with the state repo as the current working directory):
//   bun playbook/scripts/next-items.ts
//
// Prints a JSON array of work-item IDs (up to LIMIT), sorted by ID. An item
// is actionable when none of its dependencies are still sitting in todo/: if a
// dependency is not in todo/ we assume it has already been actioned. The script
// only ever reads todo/; it does not look in any other queue.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Most items the loop will pick up in one pass.
export const LIMIT = 10;

// Pull the dependency IDs out of an index.md's `**Depends on:**` line.
// Returns [] when the line is absent (the template drops it when there are
// none) or lists nothing.
export function parseDependsOn(indexMd: string): string[] {
    const match = indexMd.match(/^\*\*Depends on:\*\*(.*)$/m);
    if (!match) {
        return [];
    }
    return match[1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
}

// Core logic: given the todo/ directory, return the IDs ready to action.
// `todoDir` is the path to the state repo's `work-items/todo/` directory.
export async function nextItems(
    todoDir: string,
    limit: number = LIMIT,
): Promise<string[]> {
    const entries = await readdir(todoDir, { withFileTypes: true });
    const ids = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

    const inTodo = new Set(ids);

    const ready: string[] = [];
    for (const id of ids) {
        let indexMd: string;
        try {
            indexMd = await readFile(join(todoDir, id, "index.md"), "utf8");
        } catch {
            // No index.md: nothing to read dependencies from, treat as ready.
            indexMd = "";
        }
        const deps = parseDependsOn(indexMd);
        // Ready when no dependency is still waiting in todo/.
        if (deps.every((dep) => !inTodo.has(dep))) {
            ready.push(id);
            if (ready.length >= limit) {
                break;
            }
        }
    }

    return ready;
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(): Promise<void> {
    const todoDir = join(process.cwd(), "work-items", "todo");
    try {
        const ready = await nextItems(todoDir);
        console.log(JSON.stringify(ready));
    } catch {
        console.error(
            `no work-items/todo/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
