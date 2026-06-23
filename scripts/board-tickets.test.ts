// Unit tests for the core board() logic in board-tickets.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway tickets/ fixture under the OS temp dir and
// removes it again in afterEach. The CLI wrapper in board-tickets.ts is
// intentionally not exercised here; we call the exported board() function
// directly. The shared ticket-reading helpers (readTicket, parseDescription,
// truncateDescription) are tested in lib/board-tickets.test.ts.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { board, DISPLAY_LIMIT } from "./board-tickets";

let ticketsDir: string;
let root: string;

// Create a ticket directory `id` in `queue` with an index.md carrying the given
// description, dependencies, and optional priority.
async function makeTicket(
    queue: string,
    id: string,
    description = "",
    deps: string[] | null = null,
    priority?: number,
): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(dir, { recursive: true });
    const dependsLine =
        deps === null ? "" : `**Depends on:** ${deps.join(", ")}\n`;
    const priorityLine =
        priority !== undefined ? `**Priority:** ${priority}\n` : "";
    await writeFile(
        join(dir, "index.md"),
        `# ${id}: a title\n\n**ID:** ${id}\n**Type:** Tweak\n${dependsLine}**Failures:** 0\n${priorityLine}\n${description}\n`,
    );
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "board-tickets-test-"));
    ticketsDir = join(root, "tickets");
    await mkdir(ticketsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("board()", () => {
    test("returns every queue empty for an empty tickets/", async () => {
        const result = await board(ticketsDir);
        for (const queue of Object.values(result)) {
            expect(queue).toEqual({ count: 0, truncated: false, tickets: [] });
        }
    });

    test("reports id, description, and dependencies per ticket", async () => {
        await makeTicket("todo", "feat-2", "paginate results", ["feat-1"]);
        const result = await board(ticketsDir);
        expect(result.todo.count).toBe(1);
        expect(result.todo.truncated).toBe(false);
        expect(result.todo.tickets).toEqual([
            {
                id: "feat-2",
                description: "paginate results",
                dependsOn: ["feat-1"],
                failures: 0,
                priority: 100,
            },
        ]);
    });

    test("orders todo and backlog by priority then ID", async () => {
        await makeTicket("todo", "feat-3", "", null, 30);
        await makeTicket("todo", "feat-1", "", null, 10);
        await makeTicket("todo", "feat-2", "", null, 20);
        await makeTicket("backlog", "infra-2", "", null, 50);
        await makeTicket("backlog", "infra-1", "", null, 5);
        const result = await board(ticketsDir);
        expect(result.todo.tickets.map((t) => t.id)).toEqual([
            "feat-1",
            "feat-2",
            "feat-3",
        ]);
        expect(result.backlog.tickets.map((t) => t.id)).toEqual([
            "infra-1",
            "infra-2",
        ]);
    });

    test("orders pipeline queues by ticket ID when not todo/backlog", async () => {
        await makeTicket("todo", "feat-3");
        await makeTicket("todo", "feat-1");
        await makeTicket("todo", "feat-2");
        const result = await board(ticketsDir);
        expect(result.todo.tickets.map((t) => t.id)).toEqual([
            "feat-1",
            "feat-2",
            "feat-3",
        ]);
    });

    test("caps each queue at the display limit and flags truncation", async () => {
        for (let i = 0; i < DISPLAY_LIMIT + 5; i++) {
            // Zero-pad so ID sort order is stable.
            await makeTicket("todo", `feat-${String(i).padStart(2, "0")}`);
        }
        const result = await board(ticketsDir);
        expect(result.todo.count).toBe(DISPLAY_LIMIT + 5);
        expect(result.todo.truncated).toBe(true);
        expect(result.todo.tickets).toHaveLength(DISPLAY_LIMIT);
    });

    test("does not flag truncation at exactly the limit", async () => {
        for (let i = 0; i < DISPLAY_LIMIT; i++) {
            await makeTicket("todo", `feat-${String(i).padStart(2, "0")}`);
        }
        const result = await board(ticketsDir);
        expect(result.todo.count).toBe(DISPLAY_LIMIT);
        expect(result.todo.truncated).toBe(false);
        expect(result.todo.tickets).toHaveLength(DISPLAY_LIMIT);
    });

    test("respects an explicit lower limit", async () => {
        await makeTicket("blocked", "infra-1");
        await makeTicket("blocked", "infra-2");
        await makeTicket("blocked", "infra-3");
        const result = await board(ticketsDir, 2);
        expect(result.blocked.count).toBe(3);
        expect(result.blocked.truncated).toBe(true);
        expect(result.blocked.tickets).toHaveLength(2);
    });

    test("orders done/ most-recent-first by mtime", async () => {
        // Create three done tickets with increasing mtimes.
        await makeTicket("done", "old-1");
        await new Promise((r) => setTimeout(r, 20));
        await makeTicket("done", "mid-1");
        await new Promise((r) => setTimeout(r, 20));
        await makeTicket("done", "new-1");
        const result = await board(ticketsDir);
        expect(result.done.tickets.map((t) => t.id)).toEqual([
            "new-1",
            "mid-1",
            "old-1",
        ]);
    });

    test("tolerates a ticket with no index.md", async () => {
        await mkdir(join(ticketsDir, "todo", "broken-1"), { recursive: true });
        const result = await board(ticketsDir);
        expect(result.todo.tickets).toEqual([
            { id: "broken-1", description: "", dependsOn: [], failures: 0, priority: 100 },
        ]);
    });

    test("includes backlog queue in the board", async () => {
        await makeTicket("backlog", "later-1", "upgrade runner", null, 40);
        const result = await board(ticketsDir);
        expect(result.backlog.count).toBe(1);
        expect(result.backlog.tickets[0]).toMatchObject({
            id: "later-1",
            priority: 40,
        });
    });

    test("parses failures from index.md", async () => {
        const dir = join(ticketsDir, "blocked", "infra-1");
        await mkdir(dir, { recursive: true });
        await writeFile(
            join(dir, "index.md"),
            `# infra-1: a title\n\n**ID:** infra-1\n**Type:** Tweak\n**Failures:** 3\n\nflaky smoke test\n`,
        );
        const result = await board(ticketsDir);
        expect(result.blocked.tickets[0].failures).toBe(3);
    });
});
