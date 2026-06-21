// Unit tests for the core board() logic and parseDescription() in board-tickets.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway tickets/ fixture under the OS temp dir and
// removes it again in afterEach. The CLI wrapper in board-tickets.ts is
// intentionally not exercised here; we call the exported board() function
// directly.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    board,
    DESCRIPTION_LIMIT,
    DISPLAY_LIMIT,
    parseDescription,
    truncateDescription,
} from "./board-tickets";

let ticketsDir: string;
let root: string;

// Create a ticket directory `id` in `queue` with an index.md carrying the given
// description and dependencies. Pass null for deps to omit the Depends on line
// (as the template does when there are none).
async function makeTicket(
    queue: string,
    id: string,
    description = "",
    deps: string[] | null = null,
): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(dir, { recursive: true });
    const dependsLine =
        deps === null ? "" : `**Depends on:** ${deps.join(", ")}\n`;
    await writeFile(
        join(dir, "index.md"),
        `# ${id}: a title\n\n**ID:** ${id}\n**Type:** Tweak\n${dependsLine}**Failures:** 0\n\n${description}\n`,
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

describe("parseDescription()", () => {
    test("returns the first body line, skipping heading and metadata", () => {
        const md =
            "# id: a title\n\n**ID:** id\n**Type:** Tweak\n**Failures:** 0\n\nDo the thing.\n";
        expect(parseDescription(md)).toBe("Do the thing.");
    });

    test("returns '' when there is no body line", () => {
        const md = "# id: a title\n\n**ID:** id\n**Failures:** 0\n";
        expect(parseDescription(md)).toBe("");
    });

    test("returns '' for empty input", () => {
        expect(parseDescription("")).toBe("");
    });

    test("skips an HTML comment block opener", () => {
        const md = "# id\n\n**ID:** id\n\n<!--\na comment\n-->\n";
        // The first non-skipped line is the comment body, which is acceptable;
        // real tickets put the description before the comment. Guard only the
        // markers we explicitly skip.
        expect(parseDescription("# id\n**ID:** id\n<!--")).toBe("");
    });
});

describe("truncateDescription()", () => {
    test("leaves a short description unchanged", () => {
        expect(truncateDescription("add result ranking")).toBe("add result ranking");
    });

    test("collapses internal whitespace and newlines", () => {
        expect(truncateDescription("add   result\nranking")).toBe("add result ranking");
    });

    test("cuts a long description and appends an ellipsis", () => {
        const long = "x".repeat(DESCRIPTION_LIMIT + 20);
        const out = truncateDescription(long);
        expect(out.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
        expect(out.endsWith("…")).toBe(true);
    });

    test("does not cut a trailing partial word mid-token", () => {
        const out = truncateDescription("alpha beta gamma delta epsilon zeta", 18);
        // No partial word before the ellipsis; ends on a word boundary.
        expect(out).toBe("alpha beta gamma…");
    });
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
            { id: "feat-2", description: "paginate results", dependsOn: ["feat-1"], failures: 0 },
        ]);
    });

    test("orders pipeline queues by ticket ID", async () => {
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
            { id: "broken-1", description: "", dependsOn: [], failures: 0 },
        ]);
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
