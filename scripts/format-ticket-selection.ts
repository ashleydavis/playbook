#!/usr/bin/env bun
// Format a numbered ticket selection menu and resolve developer input.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/format-ticket-selection.ts --mode pick-many --queue blocked \
//     --fields failures --prompt 'Which to unblock? (number, several numbers, ticket ID, or "all")'
//
//   bun ../scripts/format-ticket-selection.ts --resolve "1, 3" --mode pick-many --state state.json
//
// pick-one-loop (pb:review) is driven by the review snapshot written by
// start-review.ts. That snapshot is the source of truth for the rows, their
// order, and their numbers, so resolved tickets stay visible (checked, with an
// outcome) even after they leave human-review/. Render it, and mark a ticket
// actioned, with:
//   bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review \
//     --snapshot .pb-review-snapshot.json --prompt 'Which ticket do you want to review? (number, ticket ID, or stop)'
//   bun ../scripts/format-ticket-selection.ts --mode pick-one-loop --queue human-review \
//     --snapshot .pb-review-snapshot.json --mark search-3 --outcome approved --prompt '...'
// A snapshot older than --max-age seconds is rebuilt from the live queue first.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { readTicket, type BoardTicket } from "./board-tickets";
import { compareTickets } from "./ticket-meta";
import {
    DEFAULT_MAX_AGE_SECONDS,
    buildSnapshot,
    isStale,
    markSnapshot,
    readSnapshot,
    writeSnapshot,
    type SnapshotEntry,
} from "./review-snapshot";

export type SelectionMode = "pick-many" | "pick-one-loop";

export interface SelectionTicket {
    id: string;
    description: string;
    dependsOn?: string[];
    priority?: number;
    failures?: number;
    queue?: string;
    checked?: boolean;
    outcome?: string;
}

export interface FormatOptions {
    mode: SelectionMode;
    sections: { label: string; tickets: SelectionTicket[] }[];
    prompt: string;
    progress?: { done: number; total: number };
    fields?: Set<string>;
}

export type ResolveResult =
    | { ids: string[]; stopped?: boolean }
    | { error: string };

const STOP_WORDS = new Set(["q", "quit", "stop"]);

const QUEUE_LABELS: Record<string, string> = {
    blocked: "Blocked",
    todo: "Todo",
    backlog: "Backlog",
    "in-progress": "In progress",
    "agent-review": "Agent review",
    "human-review": "Human review",
    "merge-queue": "Merge queue",
    done: "Done",
    aborted: "Aborted",
};

export function queueLabel(queue: string): string {
    return (
        QUEUE_LABELS[queue] ??
        queue
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
    );
}

function boardToSelection(
    ticket: BoardTicket,
    queue: string,
): SelectionTicket {
    const sel: SelectionTicket = {
        id: ticket.id,
        description: ticket.description,
        queue,
        priority: ticket.priority,
    };
    if (ticket.dependsOn.length > 0) {
        sel.dependsOn = ticket.dependsOn;
    }
    if (ticket.failures !== undefined && ticket.failures > 0) {
        sel.failures = ticket.failures;
    }
    return sel;
}

function flattenSections(
    sections: { label: string; tickets: SelectionTicket[] }[],
): SelectionTicket[] {
    const flat: SelectionTicket[] = [];
    for (const section of sections) {
        for (const ticket of section.tickets) {
            flat.push(ticket);
        }
    }
    return flat;
}

function totalTickets(
    sections: { label: string; tickets: SelectionTicket[] }[],
): number {
    return sections.reduce((n, s) => n + s.tickets.length, 0);
}

function formatOptionalFields(
    ticket: SelectionTicket,
    fields: Set<string> | undefined,
): string[] {
    if (!fields) {
        return [];
    }
    const lines: string[] = [];
    if (fields.has("dependsOn") && ticket.dependsOn && ticket.dependsOn.length > 0) {
        lines.push(`   depends on: ${ticket.dependsOn.join(", ")}`);
    }
    if (fields.has("priority") && ticket.priority !== undefined) {
        lines.push(`   priority: ${ticket.priority}`);
    }
    if (fields.has("failures") && ticket.failures !== undefined) {
        lines.push(`   failures: ${ticket.failures}`);
    }
    return lines;
}

export function formatTicketSelection(opts: FormatOptions): string {
    const fields = opts.fields;
    const total = totalTickets(opts.sections);

    if (total === 0) {
        if (opts.sections.length === 1) {
            return `No tickets in ${opts.sections[0].label}.`;
        }
        return opts.sections
            .map((s) => `${s.label} (0)`)
            .join("\n");
    }

    const lines: string[] = [];
    let number = 1;

    if (opts.mode === "pick-one-loop" && opts.progress) {
        lines.push(
            `Review (${opts.progress.done} of ${opts.progress.total} done)`,
        );
    }

    for (const section of opts.sections) {
        if (opts.mode === "pick-many") {
            lines.push(`${section.label} (${section.tickets.length})`);
        }
        for (const ticket of section.tickets) {
            if (opts.mode === "pick-one-loop") {
                const box = ticket.checked ? "[x]" : "[ ]";
                const outcome =
                    ticket.checked && ticket.outcome
                        ? ` — ${ticket.outcome}`
                        : "";
                lines.push(
                    `${box} ${number}. ${ticket.id} — ${ticket.description}${outcome}`,
                );
            } else {
                lines.push(`${number}. ${ticket.id} — ${ticket.description}`);
                lines.push(...formatOptionalFields(ticket, fields));
            }
            number++;
        }
    }

    lines.push("");
    lines.push(opts.prompt);
    return lines.join("\n");
}

function parseNumberTokens(input: string): string[] {
    return input
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

export function resolveSelection(
    input: string,
    tickets: SelectionTicket[],
    mode: SelectionMode,
): ResolveResult {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
        return { error: "empty input; pick a number, ticket ID, or stop" };
    }

    const lower = trimmed.toLowerCase();
    if (STOP_WORDS.has(lower)) {
        return { ids: [], stopped: true };
    }

    if (lower === "all") {
        if (mode === "pick-one-loop") {
            return { error: 'pick-one-loop does not support "all"' };
        }
        return { ids: tickets.map((t) => t.id) };
    }

    const byId = new Map(tickets.map((t) => [t.id, t]));
    const tokens = parseNumberTokens(trimmed);
    const ids: string[] = [];

    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            const n = Number(token);
            if (n < 1 || n > tickets.length) {
                return {
                    error: `number ${n} is out of range (1–${tickets.length})`,
                };
            }
            const id = tickets[n - 1].id;
            if (!ids.includes(id)) {
                ids.push(id);
            }
            continue;
        }
        if (!byId.has(token)) {
            return { error: `unknown ticket ID: ${token}` };
        }
        if (!ids.includes(token)) {
            ids.push(token);
        }
    }

    if (mode === "pick-one-loop" && ids.length > 1) {
        return { error: "pick-one-loop accepts one ticket at a time" };
    }

    return { ids };
}

export async function loadQueueTickets(
    ticketsDir: string,
    queue: string,
    fields: Set<string>,
): Promise<SelectionTicket[]> {
    let entries;
    const queueDir = join(ticketsDir, queue);
    try {
        entries = await readdir(queueDir, { withFileTypes: true });
    } catch {
        return [];
    }
    const ids = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

    const tickets: SelectionTicket[] = [];
    for (const id of ids) {
        const board = await readTicket(ticketsDir, queue, id);
        const sel = boardToSelection(board, queue);
        if (!fields.has("dependsOn")) {
            delete sel.dependsOn;
        }
        if (!fields.has("priority")) {
            delete sel.priority;
        }
        if (!fields.has("failures")) {
            delete sel.failures;
        }
        tickets.push(sel);
    }
    tickets.sort((a, b) =>
        compareTickets(
            { id: a.id, priority: a.priority ?? 100 },
            { id: b.id, priority: b.priority ?? 100 },
        ),
    );
    return tickets;
}

interface ChecklistEntry {
    id: string;
    checked?: boolean;
    outcome?: string;
}

function applyChecklist(
    tickets: SelectionTicket[],
    checklist: ChecklistEntry[],
): SelectionTicket[] {
    const byId = new Map(checklist.map((c) => [c.id, c]));
    return tickets.map((t) => {
        const entry = byId.get(t.id);
        if (!entry) {
            return t;
        }
        return {
            ...t,
            checked: entry.checked ?? false,
            outcome: entry.outcome,
        };
    });
}

// Build the checklist rows from the review snapshot's entries. The snapshot
// order and the stored description are authoritative; the live queue is used
// only to refresh the description of a ticket that is still present (so an
// in-queue edit shows), never to add or drop a row.
export function snapshotToSelectionTickets(
    entries: SnapshotEntry[],
    liveById: Map<string, SelectionTicket>,
): SelectionTicket[] {
    return entries.map((entry) => ({
        id: entry.id,
        description: liveById.get(entry.id)?.description ?? entry.description,
        checked: entry.checked ?? false,
        outcome: entry.outcome ?? undefined,
    }));
}

function parseArgs(argv: string[]): {
    mode?: SelectionMode;
    queues: string[];
    fields: Set<string>;
    prompt: string;
    checklistPath?: string;
    snapshotPath?: string;
    markId?: string;
    outcome?: string;
    maxAgeSeconds: number;
    resolveInput?: string;
    statePath?: string;
} {
    const result = {
        queues: [] as string[],
        fields: new Set<string>(),
        prompt: "",
    };
    let mode: SelectionMode | undefined;
    let checklistPath: string | undefined;
    let snapshotPath: string | undefined;
    let markId: string | undefined;
    let outcome: string | undefined;
    let maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS;
    let resolveInput: string | undefined;
    let statePath: string | undefined;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--mode" && argv[i + 1]) {
            mode = argv[++i] as SelectionMode;
        } else if (arg === "--queue" && argv[i + 1]) {
            result.queues.push(argv[++i]);
        } else if (arg === "--fields" && argv[i + 1]) {
            for (const f of argv[++i].split(",")) {
                const trimmed = f.trim();
                if (trimmed) {
                    result.fields.add(trimmed);
                }
            }
        } else if (arg === "--prompt" && argv[i + 1]) {
            result.prompt = argv[++i];
        } else if (arg === "--checklist" && argv[i + 1]) {
            checklistPath = argv[++i];
        } else if (arg === "--snapshot" && argv[i + 1]) {
            snapshotPath = argv[++i];
        } else if (arg === "--mark" && argv[i + 1]) {
            markId = argv[++i];
        } else if (arg === "--outcome" && argv[i + 1]) {
            outcome = argv[++i];
        } else if (arg === "--max-age" && argv[i + 1]) {
            const parsed = Number(argv[++i]);
            if (!Number.isNaN(parsed)) {
                maxAgeSeconds = parsed;
            }
        } else if (arg === "--resolve" && argv[i + 1]) {
            resolveInput = argv[++i];
        } else if (arg === "--state" && argv[i + 1]) {
            statePath = argv[++i];
        }
    }

    return {
        mode,
        ...result,
        checklistPath,
        snapshotPath,
        markId,
        outcome,
        maxAgeSeconds,
        resolveInput,
        statePath,
    };
}

// Render (and optionally first mutate) the review snapshot. The snapshot is the
// source of truth: a stale snapshot is rebuilt from the live queue first, then
// --mark <id> --outcome <text> ticks a row, and the full checklist is reprinted.
// Every change rewrites the snapshot with a fresh `updatedAt` stamp.
async function renderSnapshot(args: ReturnType<typeof parseArgs>): Promise<void> {
    const snapshotPath = args.snapshotPath!;
    const queue = args.queues[0] ?? "human-review";
    const ticketsDir = join(process.cwd(), "tickets");

    let snapshot = await readSnapshot(snapshotPath);
    if (!snapshot) {
        console.error(
            `cannot read review snapshot ${snapshotPath}: run start-review.ts first`,
        );
        process.exit(1);
    }

    if (isStale(snapshot, args.maxAgeSeconds)) {
        console.error(
            `review snapshot ${snapshotPath} was stale (last updated ${snapshot.updatedAt}); rebuilt from ${queueLabel(queue)}.`,
        );
        snapshot = await buildSnapshot(ticketsDir, queue);
        await writeSnapshot(snapshotPath, snapshot);
    }

    if (args.markId !== undefined) {
        if (!args.outcome) {
            console.error("--mark requires --outcome <approved|rejected|skipped|aborted>");
            process.exit(1);
        }
        if (!markSnapshot(snapshot, args.markId, args.outcome)) {
            console.error(`unknown ticket ID in review snapshot: ${args.markId}`);
            process.exit(1);
        }
        await writeSnapshot(snapshotPath, snapshot);
    }

    let live: SelectionTicket[] = [];
    try {
        live = await loadQueueTickets(ticketsDir, queue, new Set());
    } catch {
        live = [];
    }
    const liveById = new Map(live.map((t) => [t.id, t]));

    const tickets = snapshotToSelectionTickets(snapshot.tickets, liveById);
    const done = tickets.filter((t) => t.checked).length;

    console.log(
        formatTicketSelection({
            mode: "pick-one-loop",
            sections: [{ label: queueLabel(queue), tickets }],
            prompt: args.prompt,
            progress: { done, total: tickets.length },
        }),
    );
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (args.resolveInput !== undefined) {
        if (!args.statePath) {
            console.error("--resolve requires --state <json>");
            process.exit(1);
        }
        const state = JSON.parse(await readFile(args.statePath, "utf8")) as {
            mode: SelectionMode;
            tickets: SelectionTicket[];
        };
        const result = resolveSelection(
            args.resolveInput,
            state.tickets,
            state.mode,
        );
        console.log(JSON.stringify(result));
        if ("error" in result) {
            process.exit(1);
        }
        return;
    }

    if (args.snapshotPath) {
        if (!args.prompt) {
            console.error("--snapshot requires --prompt <text>");
            process.exit(1);
        }
        await renderSnapshot(args);
        return;
    }

    if (!args.mode || args.queues.length === 0 || !args.prompt) {
        console.error(
            "usage: format-ticket-selection.ts --mode <pick-many|pick-one-loop> " +
                "--queue <name> [--queue ...] [--fields dependsOn,priority,failures] " +
                "--prompt <text> [--checklist <json>] " +
                "[--snapshot <json> [--mark <id> --outcome <text>] [--max-age <seconds>]]",
        );
        process.exit(1);
    }

    const ticketsDir = join(process.cwd(), "tickets");
    try {
        await readdir(ticketsDir);
    } catch {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    const sections: { label: string; tickets: SelectionTicket[] }[] = [];
    for (const queue of args.queues) {
        let tickets = await loadQueueTickets(ticketsDir, queue, args.fields);
        if (args.checklistPath) {
            const checklist = JSON.parse(
                await readFile(args.checklistPath, "utf8"),
            ) as ChecklistEntry[];
            tickets = applyChecklist(tickets, checklist);
        }
        sections.push({ label: queueLabel(queue), tickets });
    }

    let progress: { done: number; total: number } | undefined;
    if (args.mode === "pick-one-loop") {
        const flat = flattenSections(sections);
        const done = flat.filter((t) => t.checked).length;
        progress = { done, total: flat.length };
    }

    console.log(
        formatTicketSelection({
            mode: args.mode,
            sections,
            prompt: args.prompt,
            progress,
            fields: args.fields,
        }),
    );
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
