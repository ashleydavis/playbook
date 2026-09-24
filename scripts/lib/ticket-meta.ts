// Shared parsers for ticket surface fields read from index.md, plus the ticket
// sort order. Imported by board-tickets, next-tickets, review-snapshot,
// format-ticket-selection, and ticket-card, so it keeps parsing and sort order
// in one place.

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

// Pull the platform names out of an index.md's `**Platforms:**` line. Returns
// [] when the line is absent or empty, meaning the ticket is not locked to any
// platform.
export function parsePlatforms(indexMd: string): string[] {
    const match = indexMd.match(/^\*\*Platforms:\*\*(.*)$/m);
    if (!match) {
        return [];
    }
    return match[1]
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
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
