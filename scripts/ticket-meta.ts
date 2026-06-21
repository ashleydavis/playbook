// Shared helpers for reading ticket surface fields from index.md.
//
// Used by next-tickets.ts, board-tickets.ts, format-ticket-selection.ts, and
// set-priority.ts. Keeps parsing and sort order in one place.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PRIORITY_FIELD = /^\*\*Priority:\*\*[ \t]*(-?\d+)[ \t]*$/m;

// Default priority when the field is absent or invalid. Legacy tickets without
// **Priority:** behave as today (tie-broken by ID).
export const DEFAULT_PRIORITY = 100;

// Pull the dependency IDs out of an index.md's `**Depends on:**` line.
export function parseDependsOn(indexMd: string): string[] {
    const match = indexMd.match(/^\*\*Depends on:\*\*(.*)$/m);
    if (!match) {
        return [];
    }
    return match[1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .filter((id) => id.toLowerCase() !== "none");
}

// Pull the one-line description out of an index.md: the first non-empty body
// line that is not a heading, a metadata field, or an HTML comment.
export function parseDescription(indexMd: string): string {
    for (const raw of indexMd.split("\n")) {
        const line = raw.trim();
        if (line.length === 0) {
            continue;
        }
        if (line.startsWith("#") || line.startsWith("**") || line.startsWith("<!--")) {
            continue;
        }
        return line;
    }
    return "";
}

// Read `**Priority:** <n>` from index.md. Returns DEFAULT_PRIORITY when the
// line is absent, non-numeric, or empty. Negative values clamp to 0.
export function parsePriority(indexMd: string): number {
    const match = indexMd.match(PRIORITY_FIELD);
    if (!match) {
        return DEFAULT_PRIORITY;
    }
    const n = Number(match[1]);
    if (!Number.isFinite(n)) {
        return DEFAULT_PRIORITY;
    }
    return Math.max(0, n);
}

// Sort ascending by priority, then ascending by ID (lexicographic).
export function compareTickets(
    a: { id: string; priority: number },
    b: { id: string; priority: number },
): number {
    if (a.priority !== b.priority) {
        return a.priority - b.priority;
    }
    return a.id.localeCompare(b.id);
}

// Read display fields from a ticket's index.md.
export async function readTicketMeta(
    ticketsDir: string,
    queue: string,
    id: string,
): Promise<{
    id: string;
    priority: number;
    dependsOn: string[];
    description: string;
}> {
    let indexMd: string;
    try {
        indexMd = await readFile(join(ticketsDir, queue, id, "index.md"), "utf8");
    } catch {
        indexMd = "";
    }
    return {
        id,
        priority: parsePriority(indexMd),
        dependsOn: parseDependsOn(indexMd),
        description: parseDescription(indexMd),
    };
}
