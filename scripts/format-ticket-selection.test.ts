// Unit tests for format-ticket-selection.ts

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    formatTicketSelection,
    loadQueueTickets,
    queueLabel,
    resolveSelection,
    snapshotToSelectionTickets,
    type SelectionTicket,
} from "./format-ticket-selection";

const blockedTickets: SelectionTicket[] = [
    {
        id: "treemap-tooltip-1",
        description: "custom treemap hover tooltip",
        failures: 3,
    },
    {
        id: "flaky-smoke-1",
        description: "smoke suite intermittently times out on this host",
        failures: 3,
    },
];

describe("formatTicketSelection() pick-many", () => {
    test("renders headers, numbers, optional fields, and prompt", () => {
        const out = formatTicketSelection({
            mode: "pick-many",
            sections: [{ label: "Blocked", tickets: blockedTickets }],
            prompt:
                'Which to unblock? (number, several numbers, ticket ID, or "all")',
            fields: new Set(["failures"]),
        });
        expect(out).toContain("Blocked (2)");
        expect(out).toContain("1. treemap-tooltip-1, custom treemap hover tooltip");
        expect(out).toContain("   failures: 3");
        expect(out).toContain(
            'Which to unblock? (number, several numbers, ticket ID, or "all")',
        );
    });

    test("numbers globally across two sections", () => {
        const out = formatTicketSelection({
            mode: "pick-many",
            sections: [
                {
                    label: "Todo",
                    tickets: [
                        {
                            id: "auth-9",
                            description: "session refresh",
                            priority: 10,
                        },
                    ],
                },
                {
                    label: "Backlog",
                    tickets: [
                        {
                            id: "infra-2",
                            description: "upgrade test runner",
                            priority: 100,
                        },
                    ],
                },
            ],
            prompt: "Which ticket(s) to rank?",
            fields: new Set(["priority"]),
        });
        expect(out).toContain("Todo (1)");
        expect(out).toContain("1. auth-9, session refresh");
        expect(out).toContain("Backlog (1)");
        expect(out).toContain("2. infra-2, upgrade test runner");
    });

    test("empty single queue omits prompt", () => {
        const out = formatTicketSelection({
            mode: "pick-many",
            sections: [{ label: "Blocked", tickets: [] }],
            prompt: "Which to unblock?",
        });
        expect(out).toBe("No tickets in Blocked.");
    });
});

describe("formatTicketSelection() pick-one-loop", () => {
    const reviewTickets: SelectionTicket[] = [
        {
            id: "search-3",
            description: "debounced search input",
            checked: true,
            outcome: "approved",
        },
        { id: "search-4", description: "result ranking", checked: false },
        { id: "search-5", description: "fuzzy matching", checked: false },
    ];

    test("renders progress header, checkboxes, outcomes, and prompt", () => {
        const out = formatTicketSelection({
            mode: "pick-one-loop",
            sections: [{ label: "Human review", tickets: reviewTickets }],
            prompt:
                "Which ticket do you want to review? (number, ticket ID, or stop)",
            progress: { done: 1, total: 3 },
        });
        expect(out).toContain("Review (1 of 3 done)");
        expect(out).toContain(
            "[x] 1. search-3, debounced search input (approved)",
        );
        expect(out).toContain("[ ] 2. search-4, result ranking");
        expect(out).toContain(
            "Which ticket do you want to review? (number, ticket ID, or stop)",
        );
    });

    test("keeps fixed numbers when middle item is checked", () => {
        const tickets: SelectionTicket[] = [
            { id: "a-1", description: "first", checked: true, outcome: "skipped" },
            { id: "b-1", description: "second", checked: false },
            { id: "c-1", description: "third", checked: false },
        ];
        const out = formatTicketSelection({
            mode: "pick-one-loop",
            sections: [{ label: "Human review", tickets }],
            prompt: "Pick one",
            progress: { done: 1, total: 3 },
        });
        expect(out).toContain("[x] 1. a-1, first (skipped)");
        expect(out).toContain("[ ] 2. b-1, second");
        expect(out).toContain("[ ] 3. c-1, third");
    });
});

describe("resolveSelection() pick-many", () => {
    const tickets = blockedTickets;

    test("single number", () => {
        expect(resolveSelection("1", tickets, "pick-many")).toEqual({
            ids: ["treemap-tooltip-1"],
        });
    });

    test("multiple numbers", () => {
        expect(resolveSelection("1, 2", tickets, "pick-many")).toEqual({
            ids: ["treemap-tooltip-1", "flaky-smoke-1"],
        });
        expect(resolveSelection("1 2", tickets, "pick-many")).toEqual({
            ids: ["treemap-tooltip-1", "flaky-smoke-1"],
        });
    });

    test("ticket ID", () => {
        expect(
            resolveSelection("flaky-smoke-1", tickets, "pick-many"),
        ).toEqual({ ids: ["flaky-smoke-1"] });
    });

    test("all", () => {
        expect(resolveSelection("all", tickets, "pick-many")).toEqual({
            ids: ["treemap-tooltip-1", "flaky-smoke-1"],
        });
    });

    test("empty input", () => {
        expect(resolveSelection("", tickets, "pick-many")).toEqual({
            error: expect.stringContaining("empty"),
        });
    });

    test("out-of-range number", () => {
        expect(resolveSelection("9", tickets, "pick-many")).toEqual({
            error: expect.stringContaining("out of range"),
        });
    });

    test("unknown ID", () => {
        expect(resolveSelection("nope-1", tickets, "pick-many")).toEqual({
            error: expect.stringContaining("unknown ticket ID"),
        });
    });
});

describe("resolveSelection() pick-one-loop", () => {
    const tickets: SelectionTicket[] = [
        { id: "search-3", description: "debounced search input" },
        { id: "search-4", description: "result ranking" },
    ];

    test("single number", () => {
        expect(resolveSelection("2", tickets, "pick-one-loop")).toEqual({
            ids: ["search-4"],
        });
    });

    test("ticket ID", () => {
        expect(resolveSelection("search-3", tickets, "pick-one-loop")).toEqual({
            ids: ["search-3"],
        });
    });

    test("stop synonyms", () => {
        expect(resolveSelection("q", tickets, "pick-one-loop")).toEqual({
            ids: [],
            stopped: true,
        });
        expect(resolveSelection("quit", tickets, "pick-one-loop")).toEqual({
            ids: [],
            stopped: true,
        });
    });

    test("rejects all", () => {
        expect(resolveSelection("all", tickets, "pick-one-loop")).toEqual({
            error: expect.stringContaining("does not support"),
        });
    });

    test("rejects multiple numbers", () => {
        expect(resolveSelection("1 2", tickets, "pick-one-loop")).toEqual({
            error: expect.stringContaining("one ticket at a time"),
        });
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

describe("queueLabel()", () => {
    test("maps a known queue to its label", () => {
        expect(queueLabel("human-review")).toBe("Human review");
        expect(queueLabel("merge-queue")).toBe("Merge queue");
    });

    test("title-cases an unknown queue", () => {
        expect(queueLabel("some-other-pen")).toBe("Some Other Pen");
    });
});

describe("loadQueueTickets()", () => {
    let root: string;
    let ticketsDir: string;

    async function makeTicket(
        queue: string,
        id: string,
        priority: number,
    ): Promise<void> {
        const dir = join(ticketsDir, queue, id);
        await mkdir(dir, { recursive: true });
        await writeFile(
            join(dir, "index.md"),
            `# ${id}\n\n**ID:** ${id}\n**Failures:** 0\n**Priority:** ${priority}\n\n${id} desc\n`,
        );
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "load-queue-test-"));
        ticketsDir = join(root, "tickets");
        await mkdir(ticketsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    test("returns [] for a missing queue directory", async () => {
        expect(await loadQueueTickets(ticketsDir, "todo", new Set())).toEqual([]);
    });

    test("orders by priority then id and keeps only requested fields", async () => {
        await makeTicket("todo", "b-1", 50);
        await makeTicket("todo", "a-1", 10);
        const out = await loadQueueTickets(ticketsDir, "todo", new Set(["priority"]));
        expect(out.map((t) => t.id)).toEqual(["a-1", "b-1"]);
        expect(out[0].priority).toBe(10);
        expect(out[0].failures).toBeUndefined();
        expect(out[0].dependsOn).toBeUndefined();
    });
});
