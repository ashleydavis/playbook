// Shared ticket-reading helpers used by the board, the review snapshot, and the
// review menu. `readTicket` is imported by review-snapshot.ts and
// format-ticket-selection.ts; the board() report and CLI live in
// ../board-tickets.ts.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDependsOn, parsePriority } from "./ticket-meta";
import { parseFailures } from "../fail-ticket";

// Longest description kept, so each fits on one line of its own under the ticket
// ID. Longer descriptions are cut to this many characters and end with an
// ellipsis.
export const DESCRIPTION_LIMIT = 100;

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

// Collapse whitespace and cut a description to DESCRIPTION_LIMIT characters,
// ending with a single-character ellipsis when it was longer.
export function truncateDescription(
    description: string,
    limit: number = DESCRIPTION_LIMIT,
): string {
    const oneLine = description.replace(/\s+/g, " ").trim();
    if (oneLine.length <= limit) {
        return oneLine;
    }
    return oneLine.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
}

export interface BoardTicket {
    id: string;
    description: string;
    dependsOn: string[];
    failures: number;
    priority: number;
}

// Read a single ticket's display fields from its index.md.
export async function readTicket(
    ticketsDir: string,
    queue: string,
    id: string,
): Promise<BoardTicket> {
    let indexMd: string;
    try {
        indexMd = await readFile(join(ticketsDir, queue, id, "index.md"), "utf8");
    } catch {
        indexMd = "";
    }
    return {
        id,
        description: truncateDescription(parseDescription(indexMd)),
        dependsOn: parseDependsOn(indexMd),
        failures: parseFailures(indexMd),
        priority: parsePriority(indexMd),
    };
}
