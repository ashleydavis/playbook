// Unit tests for the shared ticket-meta parsers and sort order.

import {
    compareTickets,
    DEFAULT_PRIORITY,
    parseDependsOn,
    parsePriority,
} from "./ticket-meta";

describe("parsePriority()", () => {
    test("returns DEFAULT_PRIORITY when the line is absent", () => {
        expect(parsePriority("# ticket\n\n**ID:** ticket\n")).toBe(DEFAULT_PRIORITY);
    });

    test("parses a valid integer", () => {
        expect(parsePriority("**Priority:** 10\n")).toBe(10);
    });

    test("returns DEFAULT_PRIORITY for non-numeric value", () => {
        expect(parsePriority("**Priority:** abc\n")).toBe(DEFAULT_PRIORITY);
    });

    test("returns DEFAULT_PRIORITY for empty value", () => {
        expect(parsePriority("**Priority:**\n")).toBe(DEFAULT_PRIORITY);
    });

    test("clamps negative values to 0", () => {
        expect(parsePriority("**Priority:** -5\n")).toBe(0);
    });
});

describe("compareTickets()", () => {
    test("sorts lower priority first", () => {
        const sorted = [
            { id: "z-9", priority: 50 },
            { id: "a-1", priority: 10 },
            { id: "m-5", priority: 20 },
        ].sort(compareTickets);
        expect(sorted.map((t) => t.id)).toEqual(["a-1", "m-5", "z-9"]);
    });

    test("tie-breaks equal priority by ID ascending", () => {
        const sorted = [
            { id: "auth-9", priority: 100 },
            { id: "auth-1", priority: 100 },
            { id: "auth-5", priority: 100 },
        ].sort(compareTickets);
        expect(sorted.map((t) => t.id)).toEqual(["auth-1", "auth-5", "auth-9"]);
    });
});

describe("parseDependsOn()", () => {
    test("returns [] when the line is absent", () => {
        expect(parseDependsOn("# ticket-1\n\n**ID:** ticket-1\n")).toEqual([]);
    });

    test("parses a single dependency", () => {
        expect(parseDependsOn("**Depends on:** feat-1\n")).toEqual(["feat-1"]);
    });

    test("parses and trims a comma-separated list", () => {
        expect(parseDependsOn("**Depends on:** feat-1, feat-2 , feat-3\n")).toEqual([
            "feat-1",
            "feat-2",
            "feat-3",
        ]);
    });

    test("returns [] for an empty Depends on line", () => {
        expect(parseDependsOn("**Depends on:**\n")).toEqual([]);
    });

    test("treats the literal 'none' sentinel as no dependencies", () => {
        expect(parseDependsOn("**Depends on:** none\n")).toEqual([]);
        expect(parseDependsOn("**Depends on:** None\n")).toEqual([]);
    });

    test("drops a 'none' sentinel mixed into a list", () => {
        expect(parseDependsOn("**Depends on:** none, feat-1\n")).toEqual([
            "feat-1",
        ]);
    });
});
