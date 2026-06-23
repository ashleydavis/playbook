// Unit tests for the shared review-snapshot builders: snapshotQueue,
// buildSnapshot, and writeSnapshot.

import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSnapshot, snapshotQueue, writeSnapshot } from "./review-snapshot";

let dir: string;
let ticketsDir: string;

async function makeTicket(
    id: string,
    body: string,
    opts: { priority?: number } = {},
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
}

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "review-snapshot-test-"));
    ticketsDir = join(dir, "tickets");
    await makeTicket("b-1", "second ticket", { priority: 50 });
    await makeTicket("a-1", "first ticket", { priority: 10 });
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

describe("writeSnapshot", () => {
    test("stamps updatedAt from the supplied clock and writes readable JSON", async () => {
        const at = Date.parse("2026-06-22T10:00:00.000Z");
        const path = join(dir, "snap.json");
        const snapshot = {
            queue: "human-review",
            updatedAt: "stale",
            tickets: [{ id: "a-1", description: "first" }],
        };
        await writeSnapshot(path, snapshot, at);
        // Mutates the stamp in place.
        expect(snapshot.updatedAt).toBe("2026-06-22T10:00:00.000Z");
        const onDisk = JSON.parse(await readFile(path, "utf8"));
        expect(onDisk.updatedAt).toBe("2026-06-22T10:00:00.000Z");
        expect(onDisk.tickets[0].id).toBe("a-1");
    });
});
