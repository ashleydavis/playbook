// Unit tests for the core move() logic in move.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway state fixture under the OS temp dir
// (just the work-items/ queue tree) and removes it again in afterEach. The
// CLI wrapper in move.ts is intentionally not exercised here; we call the
// exported move() function directly.

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MoveError, QUEUES, move } from "./move";

let workItemsDir: string;
let root: string;

// True if `path` exists and is a directory.
async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

// True if `path` exists and is a file.
async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

// Create the empty queue directories under work-items/.
async function makeQueues(): Promise<void> {
    for (const queue of QUEUES) {
        await mkdir(join(workItemsDir, queue), { recursive: true });
    }
}

// Create an item directory `id` in `queue` with an index.md and an
// evidence/unit.txt so we can prove contents travel with the move.
async function makeItem(queue: string, id: string): Promise<void> {
    const dir = join(workItemsDir, queue, id);
    await mkdir(join(dir, "evidence"), { recursive: true });
    await writeFile(join(dir, "index.md"), `# ${id}\n`);
    await writeFile(join(dir, "evidence", "unit.txt"), "pass\n");
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "move-test-"));
    workItemsDir = join(root, "work-items");
    await makeQueues();
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("move()", () => {
    test("moves an item from todo to in-progress and removes it from todo", async () => {
        await makeItem("todo", "item-1");

        const result = await move("item-1", "in-progress", workItemsDir);

        expect(result.noop).toBe(false);
        expect(result.from).toBe("todo");
        expect(result.to).toBe("in-progress");
        expect(await isDir(join(workItemsDir, "in-progress", "item-1"))).toBe(true);
        expect(await isDir(join(workItemsDir, "todo", "item-1"))).toBe(false);
    });

    test("moves an item through a multi-stage path with contents intact", async () => {
        await makeItem("todo", "item-2");

        await move("item-2", "in-progress", workItemsDir);
        await move("item-2", "agent-review", workItemsDir);

        const dest = join(workItemsDir, "agent-review", "item-2");
        expect(await isDir(dest)).toBe(true);
        expect(await isFile(join(dest, "index.md"))).toBe(true);
        expect(await isFile(join(dest, "evidence", "unit.txt"))).toBe(true);
        // No copies left behind in the earlier queues.
        expect(await isDir(join(workItemsDir, "todo", "item-2"))).toBe(false);
        expect(await isDir(join(workItemsDir, "in-progress", "item-2"))).toBe(false);
    });

    test("throws an unknown-id error when no queue contains the id", async () => {
        await expect(move("ghost", "in-progress", workItemsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("ghost", "in-progress", workItemsDir)).rejects.toThrow(
            /unknown id/,
        );
    });

    test("throws an invalid-queue error for an unrecognised target queue", async () => {
        await makeItem("todo", "item-3");

        await expect(move("item-3", "not-a-queue", workItemsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("item-3", "not-a-queue", workItemsDir)).rejects.toThrow(
            /invalid queue/,
        );
    });

    test("throws an ambiguous error when the id exists in two queues", async () => {
        await makeItem("todo", "dup");
        await makeItem("in-progress", "dup");

        await expect(move("dup", "agent-review", workItemsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("dup", "agent-review", workItemsDir)).rejects.toThrow(
            /ambiguous/,
        );
    });

    test("moves a problem item to blocked and a human re-admits it to todo", async () => {
        await makeItem("in-progress", "stuck-1");

        const blocked = await move("stuck-1", "blocked", workItemsDir);
        expect(blocked.noop).toBe(false);
        expect(blocked.to).toBe("blocked");
        expect(await isDir(join(workItemsDir, "blocked", "stuck-1"))).toBe(true);
        expect(await isDir(join(workItemsDir, "in-progress", "stuck-1"))).toBe(false);

        const readmitted = await move("stuck-1", "todo", workItemsDir);
        expect(readmitted.from).toBe("blocked");
        expect(readmitted.to).toBe("todo");
        expect(await isDir(join(workItemsDir, "todo", "stuck-1"))).toBe(true);
        expect(await isDir(join(workItemsDir, "blocked", "stuck-1"))).toBe(false);
    });

    test("is a no-op when the item is already in the target queue", async () => {
        await makeItem("agent-review", "item-4");

        const result = await move("item-4", "agent-review", workItemsDir);

        expect(result.noop).toBe(true);
        expect(result.from).toBe("agent-review");
        expect(result.to).toBe("agent-review");
        expect(await isDir(join(workItemsDir, "agent-review", "item-4"))).toBe(true);
    });
});
