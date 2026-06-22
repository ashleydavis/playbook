#!/usr/bin/env bun
// Shared logic for the pb:review **review snapshot**.
//
// The review snapshot is the source of truth for the review checklist AND a
// render cache: a snapshot of the human-review/ queue whose order fixes the
// numbering, whose rows persist (checked, with an outcome) after a ticket leaves
// the queue, and where each row carries a precomputed `card` with everything
// pb:review needs to print that ticket's summary and inspect menu. So the review
// loop runs from JSON, with little file reading per turn.
//
// Every write stamps `updatedAt`. When the snapshot is read back older than the
// staleness threshold, callers rebuild it from the live queue rather than trust
// a snapshot that may no longer match what is waiting for review.

import { readFile, readdir, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import { readTicket } from "./board-tickets";
import { compareTickets } from "./ticket-meta";
import { gatherCard, type TicketCard } from "./ticket-card";

// A snapshot is stale once this much wall-clock time has passed since its last
// write. Past it, callers rebuild from the live queue instead of using it.
export const DEFAULT_MAX_AGE_SECONDS = 6 * 60 * 60; // 6 hours

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
