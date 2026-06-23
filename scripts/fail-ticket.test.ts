import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    FailError,
    bumpFailures,
    locateTicket,
    parseFailures,
    recordFailure,
    setFailures,
} from "./fail-ticket";

let root: string;
let ticketsDir: string;

// Create a ticket directory `id` in `queue` with the given index.md body.
async function makeTicket(
    queue: string,
    id: string,
    indexMd: string,
): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.md"), indexMd);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fail-test-"));
    ticketsDir = join(root, "tickets");
    await mkdir(ticketsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("bumpFailures()", () => {
    test("increments an existing Failures field in place", () => {
        const { text, count } = bumpFailures(
            "# x\n\n**ID:** x\n**Failures:** 2\n",
        );
        expect(count).toBe(3);
        expect(text).toContain("**Failures:** 3");
        expect(text).not.toContain("**Failures:** 2");
    });

    test("inserts the field at 1 after Depends on when absent", () => {
        const { text, count } = bumpFailures(
            "# x\n\n**ID:** x\n**Type:** Fix\n**Depends on:** a\n\ndesc\n",
        );
        expect(count).toBe(1);
        expect(text).toBe(
            "# x\n\n**ID:** x\n**Type:** Fix\n**Depends on:** a\n**Failures:** 1\n\ndesc\n",
        );
    });

    test("falls back to after Type, then ID, then the top", () => {
        expect(bumpFailures("**ID:** x\n**Type:** Fix\n").text).toBe(
            "**ID:** x\n**Type:** Fix\n**Failures:** 1\n",
        );
        expect(bumpFailures("**ID:** x\n").text).toBe(
            "**ID:** x\n**Failures:** 1\n",
        );
        expect(bumpFailures("no fields here\n").text).toBe(
            "**Failures:** 1\nno fields here\n",
        );
    });

    test("treats only a clean integer line as the field", () => {
        // A mention in prose must not be picked up as the counter.
        const { text, count } = bumpFailures(
            "**ID:** x\nSome notes about **Failures:** in prose\n",
        );
        expect(count).toBe(1);
        expect(text).toContain("**Failures:** 1");
    });
});

describe("recordFailure()", () => {
    test("creates the field on first failure and increments on the next", async () => {
        await makeTicket("agent-review", "fix-1", "# fix-1\n\n**ID:** fix-1\n**Type:** Fix\n");

        const first = await recordFailure("fix-1", ticketsDir);
        expect(first).toEqual({ id: "fix-1", queue: "agent-review", count: 1 });

        const second = await recordFailure("fix-1", ticketsDir);
        expect(second.count).toBe(2);

        const onDisk = await readFile(
            join(ticketsDir, "agent-review", "fix-1", "index.md"),
            "utf8",
        );
        expect(onDisk).toContain("**Failures:** 2");
    });

    test("finds the ticket whichever queue it sits in", async () => {
        await makeTicket("blocked", "stuck-1", "**ID:** stuck-1\n");
        const result = await recordFailure("stuck-1", ticketsDir);
        expect(result.queue).toBe("blocked");
        expect(result.count).toBe(1);
    });

    test("throws on a missing id", async () => {
        await expect(recordFailure("", ticketsDir)).rejects.toThrow(FailError);
    });

    test("throws on an unknown id", async () => {
        await expect(recordFailure("ghost", ticketsDir)).rejects.toThrow(
            /unknown id/,
        );
    });

    test("throws when the id exists in two queues", async () => {
        await makeTicket("todo", "dup", "**ID:** dup\n");
        await makeTicket("in-progress", "dup", "**ID:** dup\n");
        await expect(recordFailure("dup", ticketsDir)).rejects.toThrow(
            /ambiguous/,
        );
    });

    test("throws when the ticket has no index.md", async () => {
        await mkdir(join(ticketsDir, "todo", "bare"), { recursive: true });
        await expect(recordFailure("bare", ticketsDir)).rejects.toThrow(
            /no index.md/,
        );
    });
});

describe("parseFailures()", () => {
    test("returns 0 when the field is absent", () => {
        expect(parseFailures("# x\n\n**ID:** x\n")).toBe(0);
    });

    test("parses the current count", () => {
        expect(parseFailures("**ID:** x\n**Failures:** 4\n")).toBe(4);
    });

    test("ignores a mention in prose", () => {
        expect(parseFailures("notes about **Failures:** here\n")).toBe(0);
    });
});

describe("setFailures()", () => {
    test("replaces an existing field in place", () => {
        expect(setFailures("**ID:** x\n**Failures:** 2\n", 5)).toBe(
            "**ID:** x\n**Failures:** 5\n",
        );
    });

    test("inserts after Depends on when absent", () => {
        expect(setFailures("**ID:** x\n**Depends on:** a\n", 1)).toBe(
            "**ID:** x\n**Depends on:** a\n**Failures:** 1\n",
        );
    });

    test("inserts at the top when no anchor field exists", () => {
        expect(setFailures("plain\n", 1)).toBe("**Failures:** 1\nplain\n");
    });
});

describe("locateTicket()", () => {
    test("returns the queue, path, and body for a located ticket", async () => {
        await makeTicket("agent-review", "fix-1", "**ID:** fix-1\n**Failures:** 1\n");
        const r = await locateTicket("fix-1", ticketsDir);
        expect(r.queue).toBe("agent-review");
        expect(r.indexPath).toBe(
            join(ticketsDir, "agent-review", "fix-1", "index.md"),
        );
        expect(r.indexMd).toContain("**Failures:** 1");
    });

    test("throws on a missing id", async () => {
        await expect(locateTicket("", ticketsDir)).rejects.toThrow(FailError);
    });

    test("throws on an unknown id", async () => {
        await expect(locateTicket("ghost", ticketsDir)).rejects.toThrow(
            /unknown id/,
        );
    });

    test("throws when the id is in two queues", async () => {
        await makeTicket("todo", "dup", "**ID:** dup\n");
        await makeTicket("blocked", "dup", "**ID:** dup\n");
        await expect(locateTicket("dup", ticketsDir)).rejects.toThrow(/ambiguous/);
    });

    test("throws when the ticket has no index.md", async () => {
        await mkdir(join(ticketsDir, "todo", "bare"), { recursive: true });
        await expect(locateTicket("bare", ticketsDir)).rejects.toThrow(
            /no index.md/,
        );
    });
});
