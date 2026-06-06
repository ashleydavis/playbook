import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FailError } from "./fail-work-item";
import { resetFailures } from "./reset-failures";

let root: string;
let workItemsDir: string;

async function makeItem(
    queue: string,
    id: string,
    indexMd: string,
): Promise<void> {
    const dir = join(workItemsDir, queue, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.md"), indexMd);
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "reset-test-"));
    workItemsDir = join(root, "work-items");
    await mkdir(workItemsDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("resetFailures()", () => {
    test("sets an existing count back to 0", async () => {
        await makeItem(
            "human-review",
            "feat-1",
            "# feat-1\n\n**ID:** feat-1\n**Failures:** 2\n",
        );

        const result = await resetFailures("feat-1", workItemsDir);
        expect(result).toEqual({ id: "feat-1", queue: "human-review", count: 0 });

        const onDisk = await readFile(
            join(workItemsDir, "human-review", "feat-1", "index.md"),
            "utf8",
        );
        expect(onDisk).toContain("**Failures:** 0");
        expect(onDisk).not.toContain("**Failures:** 2");
    });

    test("inserts the field at 0 when absent", async () => {
        await makeItem("human-review", "feat-2", "**ID:** feat-2\n");
        await resetFailures("feat-2", workItemsDir);
        const onDisk = await readFile(
            join(workItemsDir, "human-review", "feat-2", "index.md"),
            "utf8",
        );
        expect(onDisk).toContain("**Failures:** 0");
    });

    test("throws on an unknown id", async () => {
        await expect(resetFailures("ghost", workItemsDir)).rejects.toThrow(
            FailError,
        );
    });
});
