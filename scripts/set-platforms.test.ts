// Unit tests for set-platforms.ts.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { QUEUES } from "./lib/move";
import {
    parsePlatformsArg,
    PlatformsError,
    setPlatforms,
    updatePlatforms,
} from "./set-platforms";

let ticketsDir: string;
let root: string;

async function makeTicket(queue: string, id: string, indexMd: string): Promise<void> {
    const dir = join(ticketsDir, queue, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.md"), indexMd);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "set-platforms-test-"));
    ticketsDir = join(root, "tickets");
    for (const queue of QUEUES) {
        await mkdir(join(ticketsDir, queue), { recursive: true });
    }
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("parsePlatformsArg()", () => {
    test("parses and trims a comma-separated list", () => {
        expect(parsePlatformsArg("linux , darwin")).toEqual(["linux", "darwin"]);
    });

    test("treats any as no platforms", () => {
        expect(parsePlatformsArg("any")).toEqual([]);
        expect(parsePlatformsArg("ANY")).toEqual([]);
    });

    test("rejects an unknown platform", () => {
        expect(() => parsePlatformsArg("linux, macos")).toThrow(/unknown platform 'macos'/);
    });

    test("rejects an empty value", () => {
        expect(() => parsePlatformsArg(" , ")).toThrow(PlatformsError);
    });
});

describe("setPlatforms()", () => {
    test("inserts **Platforms:** after **Priority:** when missing", () => {
        const md = "**Failures:** 0\n**Priority:** 100\n\nDo it.\n";
        expect(setPlatforms(md, ["linux"])).toBe(
            "**Failures:** 0\n**Priority:** 100\n**Platforms:** linux\n\nDo it.\n",
        );
    });

    test("inserts after **Failures:** when there is no priority line", () => {
        const md = "**ID:** id\n**Failures:** 0\n\nDo it.\n";
        expect(setPlatforms(md, ["linux", "darwin"])).toBe(
            "**ID:** id\n**Failures:** 0\n**Platforms:** linux, darwin\n\nDo it.\n",
        );
    });

    test("replaces an existing **Platforms:** line", () => {
        const md = "**Failures:** 0\n**Platforms:** linux\n\nDo it.\n";
        expect(setPlatforms(md, ["win32"])).toBe(
            "**Failures:** 0\n**Platforms:** win32\n\nDo it.\n",
        );
    });

    test("removes the line for an empty list", () => {
        const md = "**Failures:** 0\n**Platforms:** linux\n\nDo it.\n";
        expect(setPlatforms(md, [])).toBe("**Failures:** 0\n\nDo it.\n");
    });

    test("an empty list leaves an unlocked ticket unchanged", () => {
        const md = "**Failures:** 0\n\nDo it.\n";
        expect(setPlatforms(md, [])).toBe(md);
    });
});

describe("updatePlatforms()", () => {
    test("sets platforms on a ticket in todo/", async () => {
        await makeTicket("todo", "feat-1", "**Failures:** 0\n\nDo it.\n");
        const result = await updatePlatforms("feat-1", "linux,darwin", ticketsDir);
        expect(result.queue).toBe("todo");
        expect(result.platforms).toEqual(["linux", "darwin"]);
        const md = await readFile(join(ticketsDir, "todo", "feat-1", "index.md"), "utf8");
        expect(md).toContain("**Platforms:** linux, darwin");
    });

    test("clears platforms on a ticket in backlog/ with any", async () => {
        await makeTicket("backlog", "infra-1", "**Failures:** 0\n**Platforms:** win32\n\nLater.\n");
        await updatePlatforms("infra-1", "any", ticketsDir);
        const md = await readFile(
            join(ticketsDir, "backlog", "infra-1", "index.md"),
            "utf8",
        );
        expect(md).not.toContain("**Platforms:**");
    });

    test("rejects an unknown platform without writing", async () => {
        await makeTicket("todo", "feat-2", "**Failures:** 0\n\nDo it.\n");
        await expect(updatePlatforms("feat-2", "beos", ticketsDir)).rejects.toThrow(
            PlatformsError,
        );
        const md = await readFile(join(ticketsDir, "todo", "feat-2", "index.md"), "utf8");
        expect(md).not.toContain("**Platforms:**");
    });

    test("rejects unknown ID", async () => {
        await expect(updatePlatforms("ghost", "linux", ticketsDir)).rejects.toThrow(
            PlatformsError,
        );
    });

    test("rejects done/ tickets", async () => {
        await makeTicket("done", "old-1", "**Failures:** 0\n");
        await expect(updatePlatforms("old-1", "linux", ticketsDir)).rejects.toThrow(
            /terminal queue/,
        );
    });

    test("rejects aborted/ tickets", async () => {
        await makeTicket("aborted", "kill-1", "**Failures:** 0\n");
        await expect(updatePlatforms("kill-1", "linux", ticketsDir)).rejects.toThrow(
            /terminal queue/,
        );
    });
});
