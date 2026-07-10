// Unit tests for ticket ID allocation. Filesystem-free: every case drives the
// pure helpers with an in-memory ID list. listAllIds()/idLocations() (the only
// disk-touching functions) are covered by smoke-next-id.sh.

import { nextId, nextNumber } from "./next-id";

describe("nextNumber()", () => {
    test("returns 1 when the prefix has no IDs", () => {
        expect(nextNumber("live-logs", ["auth-1", "auth-2"])).toBe(1);
    });

    test("returns one past the highest existing number", () => {
        expect(nextNumber("live-logs", ["live-logs-1", "live-logs-3"])).toBe(4);
    });

    test("scans across every queue's IDs, not just one", () => {
        // The bug: done/ IDs ignored. Here the max lives in what would be done/.
        const all = ["live-logs-2", "live-logs-1", "live-logs-8", "live-logs-3"];
        expect(nextNumber("live-logs", all)).toBe(9);
    });

    test("does not match a longer prefix", () => {
        // `live-logs` must not consume `live-logs-pod-labels-cap-1`.
        expect(
            nextNumber("live-logs", ["live-logs-pod-labels-cap-1"]),
        ).toBe(1);
    });

    test("prefix that is a suffix of another does not cross-match", () => {
        expect(nextNumber("logs", ["live-logs-5"])).toBe(1);
    });

    test("ordinary and Debug tags are independent sequences", () => {
        const all = ["search-1", "search-2", "search-d1"];
        expect(nextNumber("search", all)).toBe(3);
        expect(nextNumber("search", all, "d")).toBe(2);
    });

    test("a Debug ID does not feed the ordinary sequence", () => {
        // `search-d1` must not be read as ordinary number 1.
        expect(nextNumber("search", ["search-d1"])).toBe(1);
    });

    test("ignores non-numeric suffixes", () => {
        expect(nextNumber("misc", ["misc-final", "misc-2"])).toBe(3);
    });

    test("handles gaps by using the max, not the count", () => {
        expect(nextNumber("resource-utilization", ["resource-utilization-13"])).toBe(
            14,
        );
    });
});

describe("nextId()", () => {
    test("builds an ordinary ID one past the max", () => {
        expect(nextId("cluster-cache", ["cluster-cache-1"])).toBe(
            "cluster-cache-2",
        );
    });

    test("builds a Debug ID with the d tag", () => {
        expect(nextId("search", ["search-d1"], "d")).toBe("search-d2");
    });

    test("starts fresh prefixes at 1", () => {
        expect(nextId("brand-new", [])).toBe("brand-new-1");
    });
});
