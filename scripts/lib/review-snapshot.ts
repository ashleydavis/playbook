// Shared review-snapshot builders: snapshot a queue into checklist rows and
// stamp/write the snapshot. `buildSnapshot` and `writeSnapshot` are imported by
// both start-review.ts and format-ticket-selection.ts. The read/staleness/mark
// helpers that only one caller uses stay in ../review-snapshot.ts.
//
// The review snapshot is the source of truth for the pb:review checklist AND a
// render cache: a snapshot of the human-review/ queue whose order fixes the
// numbering, whose rows persist (checked, with an outcome) after a ticket leaves
// the queue, and where each row carries a precomputed `card` with everything
// pb:review needs to print that ticket's summary and inspect menu.

import { readdir, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import { readTicket } from "./board-tickets";
import { compareTickets } from "./ticket-meta";
import { gatherCard, type TicketCard } from "../ticket-card";

// One row of the checklist. `checked`/`outcome` are set when the developer
// actions the ticket; the row (and its card) stay in the snapshot afterwards.
export interface SnapshotEntry {
    id: string;
    description: string;
    checked?: boolean;
    outcome?: string | null;
    card?: TicketCard;
}

// The on-disk review snapshot. `updatedAt` is an ISO-8601 stamp refreshed on
// every write so staleness can be measured.
export interface ReviewSnapshot {
    queue: string;
    updatedAt: string;
    tickets: SnapshotEntry[];
}

// Snapshot a queue into unchecked rows, in the same order the menus use
// (priority then ID), each row carrying its precomputed render card.
export async function snapshotQueue(
    ticketsDir: string,
    queue: string,
): Promise<SnapshotEntry[]> {
    let entries: Dirent[] = [];
    try {
        entries = await readdir(join(ticketsDir, queue), {
            withFileTypes: true,
        });
    } catch {
        entries = [];
    }
    const ids = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

    const tickets = [];
    for (const id of ids) {
        tickets.push(await readTicket(ticketsDir, queue, id));
    }
    tickets.sort((a, b) =>
        compareTickets(
            { id: a.id, priority: a.priority ?? 100 },
            { id: b.id, priority: b.priority ?? 100 },
        ),
    );

    const rows: SnapshotEntry[] = [];
    for (const t of tickets) {
        rows.push({
            id: t.id,
            description: t.description,
            checked: false,
            outcome: null,
            card: await gatherCard(ticketsDir, queue, t.id),
        });
    }
    return rows;
}

// Build a fresh review snapshot (snapshot + current stamp) for a queue.
export async function buildSnapshot(
    ticketsDir: string,
    queue: string,
    nowMs: number = Date.now(),
): Promise<ReviewSnapshot> {
    return {
        queue,
        updatedAt: new Date(nowMs).toISOString(),
        tickets: await snapshotQueue(ticketsDir, queue),
    };
}

// Write the snapshot, stamping `updatedAt` to now. Every update goes through
// here so the stamp is always current.
export async function writeSnapshot(
    path: string,
    snapshot: ReviewSnapshot,
    nowMs: number = Date.now(),
): Promise<void> {
    snapshot.updatedAt = new Date(nowMs).toISOString();
    await writeFile(path, JSON.stringify(snapshot, null, 2) + "\n");
}
