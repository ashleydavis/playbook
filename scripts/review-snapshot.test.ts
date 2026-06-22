// Unit tests for review-snapshot.ts and ticket-card.ts (the pb:review review
// snapshot: snapshot, staleness, mark, and the precomputed render cards).

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    buildSnapshot,
    isStale,
    markSnapshot,
    snapshotQueue,
    type ReviewSnapshot,
} from "./review-snapshot";
import { gatherCard } from "./ticket-card";
import { snapshotToSelectionTickets } from "./format-ticket-selection";

let dir: string;
let ticketsDir: string;

async function makeTicket(
    id: string,
    body: string,
    opts: { priority?: number; screenshots?: string[]; results?: Record<string, string> } = {},
): Promise<void> {
    const tdir = join(ticketsDir, "human-review", id);
    await mkdir(tdir, { recursive: true });
    const priority =
        opts.priority !== undefined ? `**Priority:** ${opts.priority}\n` : "";
    await writeFile(
        join(tdir, "index.md"),
        `# ${id}: a title\n\n**ID:** ${id}\n${priority}**Failures:** 0\n\n${body}\n`,
    );
    await writeFile(
        join(tdir, "detail.md"),
        `# ${id}: a real title\n\n## Test Plan\nUnit and e2e.\n\n## History\n- made\n`,
    );
    if (opts.results) {
        const pass = join(tdir, "evidence", "review-1");
        await mkdir(pass, { recursive: true });
        for (const [check, line] of Object.entries(opts.results)) {
            await writeFile(join(pass, `${check}.txt`), `running\n${line}\n`);
        }
    }
    if (opts.screenshots) {
        const ss = join(ticketsDir, "human-review", id, "evidence", "implementation-1", "screenshots");
        await mkdir(ss, { recursive: true });
        for (const name of opts.screenshots) {
            await writeFile(join(ss, name), "png");
        }
    }
}

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "review-snapshot-test-"));
    ticketsDir = join(dir, "tickets");
    await makeTicket("b-1", "second ticket", { priority: 50 });
    await makeTicket("a-1", "first ticket", {
        priority: 10,
        screenshots: ["light.png", "dark.png"],
        results: { unit: "EXIT=0", e2e: "396 passed" },
    });
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("snapshotQueue / buildSnapshot", () => {
    test("orders by priority then id, each row unchecked with a card", async () => {
        const rows = await snapshotQueue(ticketsDir, "human-review");
        expect(rows.map((r) => r.id)).toEqual(["a-1", "b-1"]);
        expect(rows.every((r) => r.checked === false)).toBe(true);
        expect(rows.every((r) => r.card !== undefined)).toBe(true);
    });

    test("buildSnapshot stamps updatedAt from the supplied clock", async () => {
        const at = Date.parse("2026-06-22T10:00:00.000Z");
        const snapshot = await buildSnapshot(ticketsDir, "human-review", at);
        expect(snapshot.updatedAt).toBe("2026-06-22T10:00:00.000Z");
        expect(snapshot.queue).toBe("human-review");
        expect(snapshot.tickets).toHaveLength(2);
    });
});

describe("gatherCard", () => {
    test("captures title, evidence pass, results, screenshots, and a tailored menu", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "a-1");
        expect(card.title).toBe("a-1: a real title");
        expect(card.testPlan).toContain("Unit and e2e");
        expect(card.latestReview).toBe("review-1");
        expect(card.latestImplementation).toBe("implementation-1");
        expect(card.testResults.unit).toBe("EXIT=0");
        expect(card.testResults.e2e).toBe("396 passed");
        expect(card.screenshots).toHaveLength(2);
        // No project branch for a temp fixture: file list unknown, so the menu
        // keeps the doc + run options rather than hiding them.
        expect(card.changedFilesKnown).toBe(false);
        const keys = card.inspect.map((o) => o.key);
        expect(keys).toContain("screenshots");
        expect(keys).toContain("code-diff");
        expect(keys).toContain("doc-diff");
    });

    test("a ticket with no screenshots drops the screenshots option", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "b-1");
        expect(card.screenshots).toHaveLength(0);
        expect(card.inspect.map((o) => o.key)).not.toContain("screenshots");
    });
});

describe("isStale", () => {
    const at = Date.parse("2026-06-22T10:00:00.000Z");
    const snapshot: ReviewSnapshot = {
        queue: "human-review",
        updatedAt: "2026-06-22T10:00:00.000Z",
        tickets: [],
    };

    test("fresh within the window", () => {
        expect(isStale(snapshot, 3600, at + 1000)).toBe(false);
    });

    test("stale past the window", () => {
        expect(isStale(snapshot, 3600, at + 3600 * 1000 + 1)).toBe(true);
    });

    test("missing/invalid stamp counts as stale", () => {
        expect(
            isStale({ queue: "q", updatedAt: "not-a-date", tickets: [] }, 3600, at),
        ).toBe(true);
    });
});

describe("markSnapshot", () => {
    test("marks a row checked with its outcome", () => {
        const snapshot: ReviewSnapshot = {
            queue: "human-review",
            updatedAt: "2026-06-22T10:00:00.000Z",
            tickets: [{ id: "a-1", description: "first" }],
        };
        expect(markSnapshot(snapshot, "a-1", "approved")).toBe(true);
        expect(snapshot.tickets[0].checked).toBe(true);
        expect(snapshot.tickets[0].outcome).toBe("approved");
    });

    test("returns false for an unknown id", () => {
        const snapshot: ReviewSnapshot = {
            queue: "human-review",
            updatedAt: "2026-06-22T10:00:00.000Z",
            tickets: [{ id: "a-1", description: "first" }],
        };
        expect(markSnapshot(snapshot, "nope-1", "approved")).toBe(false);
    });
});

describe("snapshotToSelectionTickets", () => {
    test("keeps a resolved row visible even after it leaves the live queue", () => {
        const entries = [
            { id: "a-1", description: "stored desc", checked: true, outcome: "approved" },
            { id: "b-1", description: "second", checked: false },
        ];
        // a-1 has left the queue (absent from live); b-1 still present with a
        // refreshed description.
        const live = new Map([["b-1", { id: "b-1", description: "live desc" }]]);
        const out = snapshotToSelectionTickets(entries, live);
        expect(out[0]).toMatchObject({
            id: "a-1",
            description: "stored desc",
            checked: true,
            outcome: "approved",
        });
        expect(out[1].description).toBe("live desc");
    });
});
