// Unit tests for the core nextTickets() logic in next-tickets.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway tickets/ fixture under the OS temp dir and
// removes it again in afterEach. The CLI wrapper in next-tickets.ts is
// intentionally not exercised here; we call the exported nextTickets() function
// directly.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nextTickets } from "./next-tickets";

let ticketsDir: string;
let root: string;

// Create a ticket directory `id` in `queue` with an index.md listing `deps`.
// Pass optional priority in index.md via the priority argument.
async function makeTicket(
    queue: string,
    id: string,
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
        `# ${id}\n\n**ID:** ${id}\n${dependsLine}${priorityLine}`,
    );
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "next-tickets-test-"));
    ticketsDir = join(root, "tickets");
    await mkdir(ticketsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("nextTickets()", () => {
    test("returns all five queues as empty arrays for an empty tickets/", async () => {
        expect(await nextTickets(ticketsDir)).toEqual({
            conflicts: [],
            "merge-queue": [],
            todo: [],
            "in-progress": [],
            "agent-review": [],
        });
    });

    test("lists conflicts, merge-queue, in-progress and agent-review in full, sorted", async () => {
        await makeTicket("conflicts", "auth-7");
        await makeTicket("merge-queue", "auth-5");
        await makeTicket("in-progress", "infra-2");
        await makeTicket("agent-review", "search-5");
        await makeTicket("agent-review", "search-4");

        const report = await nextTickets(ticketsDir);
        expect(report.conflicts).toEqual(["auth-7"]);
        expect(report["merge-queue"]).toEqual(["auth-5"]);
        expect(report["in-progress"]).toEqual(["infra-2"]);
        expect(report["agent-review"]).toEqual(["search-4", "search-5"]);
        expect(report.todo).toEqual([]);
    });

    test("conflicts is reported first, ahead of merge-queue", async () => {
        await makeTicket("conflicts", "auth-7");
        await makeTicket("merge-queue", "auth-5");

        // The key order is the order pb:next processes the queues: an approved
        // ticket waiting to be rebased is nearer to done than the train itself.
        expect(Object.keys(await nextTickets(ticketsDir))).toEqual([
            "conflicts",
            "merge-queue",
            "agent-review",
            "todo",
            "in-progress",
        ]);
    });

    test("todo lists actionable tickets sorted by priority then ID", async () => {
        await makeTicket("todo", "auth-1", null, 50);
        await makeTicket("todo", "auth-9", null, 10);
        await makeTicket("todo", "search-1", null, 100);

        expect((await nextTickets(ticketsDir)).todo).toEqual([
            "auth-9",
            "auth-1",
            "search-1",
        ]);
    });

    test("todo lists only actionable tickets (deps merged), sorted by ID when priority ties", async () => {
        await makeTicket("done", "merged-9"); // a merged dependency
        await makeTicket("todo", "auth-1");
        await makeTicket("todo", "auth-2", ["auth-1"]); // dep only in todo -> blocked
        await makeTicket("todo", "auth-3", ["merged-9"]); // dep in done/ -> ready
        await makeTicket("todo", "search-1");

        expect((await nextTickets(ticketsDir)).todo).toEqual([
            "auth-1",
            "auth-3",
            "search-1",
        ]);
    });

    test("a todo ticket is blocked unless every dependency is in done/", async () => {
        await makeTicket("done", "dep-ok");
        await makeTicket("todo", "feat-1");
        await makeTicket("todo", "feat-2", ["dep-ok"]); // only dep is merged -> ready
        await makeTicket("todo", "feat-3", ["dep-ok", "gone-9"]); // gone-9 not merged -> blocked

        expect((await nextTickets(ticketsDir)).todo).toEqual(["feat-1", "feat-2"]);
    });

    test("a dependency in-progress (not yet merged) keeps the dependent blocked", async () => {
        await makeTicket("in-progress", "dep-1");
        await makeTicket("todo", "child-1", ["dep-1"]);

        expect((await nextTickets(ticketsDir)).todo).toEqual([]);
    });

    test("the limit caps todo but not merge-queue or agent-review", async () => {
        await makeTicket("todo", "a-1");
        await makeTicket("todo", "b-1");
        await makeTicket("todo", "c-1");
        await makeTicket("merge-queue", "m-1");
        await makeTicket("merge-queue", "m-2");

        const report = await nextTickets(ticketsDir, 2);
        expect(report.todo).toEqual(["a-1", "b-1"]);
        expect(report["merge-queue"]).toEqual(["m-1", "m-2"]);
    });

    test("conflicts share the in-flight budget with todo and in-progress", async () => {
        // Rebasing a conflict ticket is implementation work in its own
        // worktree, so it spends the same budget a todo admission would.
        await makeTicket("conflicts", "c-1");
        await makeTicket("todo", "a-1");
        await makeTicket("todo", "b-1");

        const report = await nextTickets(ticketsDir, 2);
        expect(report.todo).toEqual(["a-1"]);
        expect(report.conflicts).toEqual(["c-1"]);
    });

    test("the limit does not cap conflicts itself", async () => {
        await makeTicket("conflicts", "c-1");
        await makeTicket("conflicts", "c-2");
        await makeTicket("conflicts", "c-3");
        await makeTicket("todo", "a-1");

        const report = await nextTickets(ticketsDir, 2);
        expect(report.conflicts).toEqual(["c-1", "c-2", "c-3"]);
        // conflicts already over the budget, so no todo is admitted alongside.
        expect(report.todo).toEqual([]);
    });

    test("todo and in-progress share the limit budget", async () => {
        // limit 3, with 2 already in-progress, leaves room for only 1 todo.
        await makeTicket("in-progress", "ip-1");
        await makeTicket("in-progress", "ip-2");
        await makeTicket("todo", "t-1");
        await makeTicket("todo", "t-2");
        await makeTicket("todo", "t-3");

        const report = await nextTickets(ticketsDir, 3);
        expect(report["in-progress"]).toEqual(["ip-1", "ip-2"]);
        expect(report.todo).toEqual(["t-1"]);
    });

    test("todo is empty once in-progress already fills the limit", async () => {
        await makeTicket("in-progress", "ip-1");
        await makeTicket("in-progress", "ip-2");
        await makeTicket("todo", "t-1");

        const report = await nextTickets(ticketsDir, 2);
        expect(report.todo).toEqual([]);
        expect(report["in-progress"]).toEqual(["ip-1", "ip-2"]);
    });

    test("ignores files and only counts ticket directories", async () => {
        await makeTicket("todo", "real-1");
        await writeFile(join(ticketsDir, "todo", "stray.txt"), "noise\n");

        expect((await nextTickets(ticketsDir)).todo).toEqual(["real-1"]);
    });
});
