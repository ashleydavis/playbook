// Unit tests for the core move() logic in move.ts.
//
// Run with: npm test (Jest via ts-jest, ESM).
//
// Each test builds a throwaway state fixture under the OS temp dir
// (just the tickets/ queue tree) and removes it again in afterEach. The
// CLI wrapper in move.ts is intentionally not exercised here; we call the
// exported move() function directly.

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MoveError, QUEUES, move } from "./move";

let ticketsDir: string;
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

// Create the empty queue directories under tickets/.
async function makeQueues(): Promise<void> {
    for (const queue of QUEUES) {
        await mkdir(join(ticketsDir, queue), { recursive: true });
    }
}

// Create a ticket directory `id` in `queue` with an index.md and an
// evidence/unit.txt so we can prove contents travel with the move.
async function makeTicket(queue: string, id: string): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(join(dir, "evidence"), { recursive: true });
    await writeFile(join(dir, "index.md"), `# ${id}\n`);
    await writeFile(join(dir, "evidence", "unit.txt"), "pass\n");
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "move-test-"));
    ticketsDir = join(root, "tickets");
    await makeQueues();
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("move()", () => {
    test("moves a ticket from todo to in-progress and removes it from todo", async () => {
        await makeTicket("todo", "ticket-1");

        const result = await move("ticket-1", "in-progress", ticketsDir);

        expect(result.noop).toBe(false);
        expect(result.from).toBe("todo");
        expect(result.to).toBe("in-progress");
        expect(await isDir(join(ticketsDir, "in-progress", "ticket-1"))).toBe(true);
        expect(await isDir(join(ticketsDir, "todo", "ticket-1"))).toBe(false);
    });

    test("moves a ticket through a multi-stage path with contents intact", async () => {
        await makeTicket("todo", "ticket-2");

        await move("ticket-2", "in-progress", ticketsDir);
        await move("ticket-2", "agent-review", ticketsDir);

        const dest = join(ticketsDir, "agent-review", "ticket-2");
        expect(await isDir(dest)).toBe(true);
        expect(await isFile(join(dest, "index.md"))).toBe(true);
        expect(await isFile(join(dest, "evidence", "unit.txt"))).toBe(true);
        // No copies left behind in the earlier queues.
        expect(await isDir(join(ticketsDir, "todo", "ticket-2"))).toBe(false);
        expect(await isDir(join(ticketsDir, "in-progress", "ticket-2"))).toBe(false);
    });

    test("throws an unknown-id error when no queue contains the id", async () => {
        await expect(move("ghost", "in-progress", ticketsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("ghost", "in-progress", ticketsDir)).rejects.toThrow(
            /unknown id/,
        );
    });

    test("throws an invalid-queue error for an unrecognised target queue", async () => {
        await makeTicket("todo", "ticket-3");

        await expect(move("ticket-3", "not-a-queue", ticketsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("ticket-3", "not-a-queue", ticketsDir)).rejects.toThrow(
            /invalid queue/,
        );
    });

    test("throws an ambiguous error when the id exists in two queues", async () => {
        await makeTicket("todo", "dup");
        await makeTicket("in-progress", "dup");

        await expect(move("dup", "agent-review", ticketsDir)).rejects.toThrow(
            MoveError,
        );
        await expect(move("dup", "agent-review", ticketsDir)).rejects.toThrow(
            /ambiguous/,
        );
    });

    test("moves a problem ticket to blocked and a human re-admits it to todo", async () => {
        await makeTicket("in-progress", "stuck-1");

        const blocked = await move("stuck-1", "blocked", ticketsDir);
        expect(blocked.noop).toBe(false);
        expect(blocked.to).toBe("blocked");
        expect(await isDir(join(ticketsDir, "blocked", "stuck-1"))).toBe(true);
        expect(await isDir(join(ticketsDir, "in-progress", "stuck-1"))).toBe(false);

        const readmitted = await move("stuck-1", "todo", ticketsDir);
        expect(readmitted.from).toBe("blocked");
        expect(readmitted.to).toBe("todo");
        expect(await isDir(join(ticketsDir, "todo", "stuck-1"))).toBe(true);
        expect(await isDir(join(ticketsDir, "blocked", "stuck-1"))).toBe(false);
    });

    test("aborts a ticket from human-review to the aborted pen", async () => {
        await makeTicket("human-review", "kill-1");

        const aborted = await move("kill-1", "aborted", ticketsDir);
        expect(aborted.noop).toBe(false);
        expect(aborted.from).toBe("human-review");
        expect(aborted.to).toBe("aborted");
        expect(await isDir(join(ticketsDir, "aborted", "kill-1"))).toBe(true);
        expect(await isDir(join(ticketsDir, "human-review", "kill-1"))).toBe(
            false,
        );
    });

    test("is a no-op when the ticket is already in the target queue", async () => {
        await makeTicket("agent-review", "ticket-4");

        const result = await move("ticket-4", "agent-review", ticketsDir);

        expect(result.noop).toBe(true);
        expect(result.from).toBe("agent-review");
        expect(result.to).toBe("agent-review");
        expect(await isDir(join(ticketsDir, "agent-review", "ticket-4"))).toBe(true);
    });
});
