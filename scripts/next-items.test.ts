// Unit tests for the core nextItems() logic in next-items.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway work-items/ fixture under the OS temp dir and
// removes it again in afterEach. The CLI wrapper in next-items.ts is
// intentionally not exercised here; we call the exported nextItems() function
// directly.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nextItems, parseDependsOn } from "./next-items";

let workItemsDir: string;
let root: string;

// Create an item directory `id` in `queue` with an index.md listing `deps`.
// Pass null to omit the Depends on line entirely (as the template does when
// there are no dependencies).
async function makeItem(
    queue: string,
    id: string,
    deps: string[] | null = null,
): Promise<void> {
    const dir = join(workItemsDir, queue, id);
    await mkdir(dir, { recursive: true });
    const dependsLine =
        deps === null ? "" : `**Depends on:** ${deps.join(", ")}\n`;
    await writeFile(join(dir, "index.md"), `# ${id}\n\n**ID:** ${id}\n${dependsLine}`);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "next-items-test-"));
    workItemsDir = join(root, "work-items");
    await mkdir(workItemsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("parseDependsOn()", () => {
    test("returns [] when the line is absent", () => {
        expect(parseDependsOn("# item-1\n\n**ID:** item-1\n")).toEqual([]);
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
});

describe("nextItems()", () => {
    test("returns all four queues as empty arrays for an empty work-items/", async () => {
        expect(await nextItems(workItemsDir)).toEqual({
            "merge-queue": [],
            todo: [],
            "in-progress": [],
            "agent-review": [],
        });
    });

    test("lists merge-queue, in-progress and agent-review in full, sorted", async () => {
        await makeItem("merge-queue", "auth-5");
        await makeItem("in-progress", "infra-2");
        await makeItem("agent-review", "search-5");
        await makeItem("agent-review", "search-4");

        const report = await nextItems(workItemsDir);
        expect(report["merge-queue"]).toEqual(["auth-5"]);
        expect(report["in-progress"]).toEqual(["infra-2"]);
        expect(report["agent-review"]).toEqual(["search-4", "search-5"]);
        expect(report.todo).toEqual([]);
    });

    test("todo lists only actionable items (deps merged), sorted", async () => {
        await makeItem("done", "merged-9"); // a merged dependency
        await makeItem("todo", "auth-1");
        await makeItem("todo", "auth-2", ["auth-1"]); // dep only in todo -> blocked
        await makeItem("todo", "auth-3", ["merged-9"]); // dep in done/ -> ready
        await makeItem("todo", "search-1");

        expect((await nextItems(workItemsDir)).todo).toEqual([
            "auth-1",
            "auth-3",
            "search-1",
        ]);
    });

    test("a todo item is blocked unless every dependency is in done/", async () => {
        await makeItem("done", "dep-ok");
        await makeItem("todo", "feat-1");
        await makeItem("todo", "feat-2", ["dep-ok"]); // only dep is merged -> ready
        await makeItem("todo", "feat-3", ["dep-ok", "gone-9"]); // gone-9 not merged -> blocked

        expect((await nextItems(workItemsDir)).todo).toEqual(["feat-1", "feat-2"]);
    });

    test("a dependency in-progress (not yet merged) keeps the dependent blocked", async () => {
        await makeItem("in-progress", "dep-1");
        await makeItem("todo", "child-1", ["dep-1"]);

        expect((await nextItems(workItemsDir)).todo).toEqual([]);
    });

    test("the limit caps todo but not merge-queue or agent-review", async () => {
        await makeItem("todo", "a-1");
        await makeItem("todo", "b-1");
        await makeItem("todo", "c-1");
        await makeItem("merge-queue", "m-1");
        await makeItem("merge-queue", "m-2");

        const report = await nextItems(workItemsDir, 2);
        expect(report.todo).toEqual(["a-1", "b-1"]);
        expect(report["merge-queue"]).toEqual(["m-1", "m-2"]);
    });

    test("todo and in-progress share the limit budget", async () => {
        // limit 3, with 2 already in-progress, leaves room for only 1 todo.
        await makeItem("in-progress", "ip-1");
        await makeItem("in-progress", "ip-2");
        await makeItem("todo", "t-1");
        await makeItem("todo", "t-2");
        await makeItem("todo", "t-3");

        const report = await nextItems(workItemsDir, 3);
        expect(report["in-progress"]).toEqual(["ip-1", "ip-2"]);
        expect(report.todo).toEqual(["t-1"]);
    });

    test("todo is empty once in-progress already fills the limit", async () => {
        await makeItem("in-progress", "ip-1");
        await makeItem("in-progress", "ip-2");
        await makeItem("todo", "t-1");

        const report = await nextItems(workItemsDir, 2);
        expect(report.todo).toEqual([]);
        expect(report["in-progress"]).toEqual(["ip-1", "ip-2"]);
    });

    test("ignores files and only counts item directories", async () => {
        await makeItem("todo", "real-1");
        await writeFile(join(workItemsDir, "todo", "stray.txt"), "noise\n");

        expect((await nextItems(workItemsDir)).todo).toEqual(["real-1"]);
    });
});
