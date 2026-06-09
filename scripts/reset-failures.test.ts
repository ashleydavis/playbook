import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FailError } from "./fail-ticket";
import { resetFailures } from "./reset-failures";

let root: string;
let ticketsDir: string;

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
    root = await mkdtemp(join(tmpdir(), "reset-test-"));
    ticketsDir = join(root, "tickets");
    await mkdir(ticketsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("resetFailures()", () => {
    test("sets an existing count back to 0", async () => {
        await makeTicket(
            "human-review",
            "feat-1",
            "# feat-1\n\n**ID:** feat-1\n**Failures:** 2\n",
        );

        const result = await resetFailures("feat-1", ticketsDir);
        expect(result).toEqual({ id: "feat-1", queue: "human-review", count: 0 });

        const onDisk = await readFile(
            join(ticketsDir, "human-review", "feat-1", "index.md"),
            "utf8",
        );
        expect(onDisk).toContain("**Failures:** 0");
        expect(onDisk).not.toContain("**Failures:** 2");
    });

    test("inserts the field at 0 when absent", async () => {
        await makeTicket("human-review", "feat-2", "**ID:** feat-2\n");
        await resetFailures("feat-2", ticketsDir);
        const onDisk = await readFile(
            join(ticketsDir, "human-review", "feat-2", "index.md"),
            "utf8",
        );
        expect(onDisk).toContain("**Failures:** 0");
    });

    test("throws on an unknown id", async () => {
        await expect(resetFailures("ghost", ticketsDir)).rejects.toThrow(
            FailError,
        );
    });
});
