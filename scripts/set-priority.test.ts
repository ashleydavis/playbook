// Unit tests for set-priority.ts.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { QUEUES } from "./move";
import { PriorityError, setPriority, updatePriority } from "./set-priority";

let ticketsDir: string;
let root: string;

async function makeTicket(queue: string, id: string, indexMd: string): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.md"), indexMd);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "set-priority-test-"));
    ticketsDir = join(root, "tickets");
    for (const queue of QUEUES) {
        await mkdir(join(ticketsDir, queue), { recursive: true });
    }
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("setPriority()", () => {
    test("inserts **Priority:** after **Failures:** when missing", () => {
        const md = "# id\n\n**ID:** id\n**Failures:** 0\n\nDo it.\n";
        expect(setPriority(md, 20)).toBe(
            "# id\n\n**ID:** id\n**Failures:** 0\n**Priority:** 20\n\nDo it.\n",
        );
    });

    test("replaces an existing **Priority:** line", () => {
        const md = "**Failures:** 0\n**Priority:** 100\n\nDo it.\n";
        expect(setPriority(md, 5)).toBe("**Failures:** 0\n**Priority:** 5\n\nDo it.\n");
    });

    test("leaves other fields intact", () => {
        const md =
            "# feat-1\n\n**ID:** feat-1\n**Type:** Tweak\n**Depends on:** feat-0\n**Failures:** 1\n\nBuild it.\n";
        const out = setPriority(md, 30);
        expect(out).toContain("**Depends on:** feat-0");
        expect(out).toContain("**Failures:** 1");
        expect(out).toContain("**Priority:** 30");
        expect(out).toContain("Build it.");
    });
});

describe("updatePriority()", () => {
    test("updates a ticket in todo/", async () => {
        await makeTicket("todo", "feat-1", "**Failures:** 0\n\nDo it.\n");
        const result = await updatePriority("feat-1", 15, ticketsDir);
        expect(result.queue).toBe("todo");
        expect(result.priority).toBe(15);
        const md = await readFile(join(ticketsDir, "todo", "feat-1", "index.md"), "utf8");
        expect(md).toContain("**Priority:** 15");
    });

    test("updates a ticket in backlog/", async () => {
        await makeTicket("backlog", "infra-1", "**Failures:** 0\n\nLater.\n");
        await updatePriority("infra-1", 5, ticketsDir);
        const md = await readFile(
            join(ticketsDir, "backlog", "infra-1", "index.md"),
            "utf8",
        );
        expect(md).toContain("**Priority:** 5");
    });

    test("rejects unknown ID", async () => {
        await expect(updatePriority("ghost", 10, ticketsDir)).rejects.toThrow(
            PriorityError,
        );
    });

    test("rejects done/ tickets", async () => {
        await makeTicket("done", "old-1", "**Priority:** 100\n");
        await expect(updatePriority("old-1", 10, ticketsDir)).rejects.toThrow(
            /terminal queue/,
        );
    });

    test("rejects aborted/ tickets", async () => {
        await makeTicket("aborted", "kill-1", "**Priority:** 100\n");
        await expect(updatePriority("kill-1", 10, ticketsDir)).rejects.toThrow(
            /terminal queue/,
        );
    });
});
