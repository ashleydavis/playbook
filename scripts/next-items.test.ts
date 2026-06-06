// Unit tests for the core nextItems() logic in next-items.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway todo/ fixture under the OS temp dir and removes
// it again in afterEach. The CLI wrapper in next-items.ts is intentionally not
// exercised here; we call the exported nextItems() function directly.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { nextItems, parseDependsOn } from "./next-items";

let todoDir: string;
let root: string;

// Create an item directory `id` in todo/ with an index.md listing `deps`.
// Pass null to omit the Depends on line entirely (as the template does when
// there are no dependencies).
async function makeItem(id: string, deps: string[] | null = null): Promise<void> {
    const dir = join(todoDir, id);
    await mkdir(dir, { recursive: true });
    const dependsLine =
        deps === null ? "" : `**Depends on:** ${deps.join(", ")}\n`;
    await writeFile(join(dir, "index.md"), `# ${id}\n\n**ID:** ${id}\n${dependsLine}`);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "next-items-test-"));
    todoDir = join(root, "work-items", "todo");
    await mkdir(todoDir, { recursive: true });
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
    test("returns all items when none have dependencies", async () => {
        await makeItem("feat-1");
        await makeItem("feat-2");

        expect(await nextItems(todoDir)).toEqual(["feat-1", "feat-2"]);
    });

    test("excludes an item whose dependency is still in todo/", async () => {
        await makeItem("feat-1");
        await makeItem("feat-2", ["feat-1"]);

        expect(await nextItems(todoDir)).toEqual(["feat-1"]);
    });

    test("includes an item whose dependency is not in todo/ (already actioned)", async () => {
        await makeItem("feat-2", ["feat-1"]);

        expect(await nextItems(todoDir)).toEqual(["feat-2"]);
    });

    test("excludes an item if any one dependency is still in todo/", async () => {
        await makeItem("feat-1");
        await makeItem("feat-3", ["feat-1", "gone-9"]);

        expect(await nextItems(todoDir)).toEqual(["feat-1"]);
    });

    test("returns IDs sorted and capped at the limit", async () => {
        await makeItem("b-1");
        await makeItem("a-1");
        await makeItem("c-1");

        expect(await nextItems(todoDir, 2)).toEqual(["a-1", "b-1"]);
    });

    test("returns [] for an empty todo/", async () => {
        expect(await nextItems(todoDir)).toEqual([]);
    });
});
