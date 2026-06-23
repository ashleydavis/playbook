// Unit tests for the review-snapshot helpers that stay in review-snapshot.ts:
// defaultSnapshotPath, readSnapshot, isStale, and markSnapshot. The shared
// builders (snapshotQueue, buildSnapshot, writeSnapshot) are tested in
// lib/review-snapshot.test.ts.

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    DEFAULT_SNAPSHOT_FILE,
    defaultSnapshotPath,
    isStale,
    markSnapshot,
    readSnapshot,
} from "./review-snapshot";
import type { ReviewSnapshot } from "./lib/review-snapshot";

describe("defaultSnapshotPath", () => {
    test("resolves the default file against the given cwd", () => {
        expect(defaultSnapshotPath("/state")).toBe(
            join("/state", DEFAULT_SNAPSHOT_FILE),
        );
    });
});

describe("readSnapshot", () => {
    let dir: string;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), "read-snapshot-test-"));
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    test("parses a written snapshot back", async () => {
        const path = join(dir, "snap.json");
        const snapshot: ReviewSnapshot = {
            queue: "human-review",
            updatedAt: "2026-06-22T10:00:00.000Z",
            tickets: [{ id: "a-1", description: "first" }],
        };
        await writeFile(path, JSON.stringify(snapshot));
        expect(await readSnapshot(path)).toEqual(snapshot);
    });

    test("returns null when the file is missing", async () => {
        expect(await readSnapshot(join(dir, "absent.json"))).toBeNull();
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
