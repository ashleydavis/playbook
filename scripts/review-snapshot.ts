// Review-snapshot helpers used by only one caller each: resolve the default
// path, read the snapshot back, test staleness, and mark a row actioned. The
// shared builders (snapshotQueue, buildSnapshot, writeSnapshot) live in
// ./lib/review-snapshot.ts.
//
// Every write stamps `updatedAt`. When the snapshot is read back older than the
// staleness threshold, callers rebuild it from the live queue rather than trust
// a snapshot that may no longer match what is waiting for review.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReviewSnapshot } from "./lib/review-snapshot";

// A snapshot is stale once this much wall-clock time has passed since its last
// write. Past it, callers rebuild from the live queue instead of using it.
export const DEFAULT_MAX_AGE_SECONDS = 6 * 60 * 60; // 6 hours

// The review snapshot's default filename, resolved against the state repo's
// working directory. start-review.ts writes here and format-ticket-selection.ts
// reads here, so the pb:review skill never has to name or thread the path.
export const DEFAULT_SNAPSHOT_FILE = ".pb-review-snapshot.json";

export function defaultSnapshotPath(cwd: string = process.cwd()): string {
    return join(cwd, DEFAULT_SNAPSHOT_FILE);
}

// Read the review snapshot. Returns null when it is missing or unreadable.
export async function readSnapshot(path: string): Promise<ReviewSnapshot | null> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as ReviewSnapshot;
    } catch {
        return null;
    }
}

// True when the snapshot was last written longer ago than maxAgeSeconds (or has
// no/invalid stamp). A stale snapshot should be rebuilt from the live queue.
export function isStale(
    snapshot: ReviewSnapshot,
    maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
    nowMs: number = Date.now(),
): boolean {
    const stampedMs = Date.parse(snapshot.updatedAt);
    if (Number.isNaN(stampedMs)) {
        return true;
    }
    return nowMs - stampedMs > maxAgeSeconds * 1000;
}

// Mark one row actioned (checked, with its outcome). Returns true when the ID
// was in the snapshot, false otherwise.
export function markSnapshot(
    snapshot: ReviewSnapshot,
    id: string,
    outcome: string,
): boolean {
    const entry = snapshot.tickets.find((e) => e.id === id);
    if (!entry) {
        return false;
    }
    entry.checked = true;
    entry.outcome = outcome;
    return true;
}
