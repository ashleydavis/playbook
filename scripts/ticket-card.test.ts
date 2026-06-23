// Unit tests for ticket-card.ts: the precomputed pb:review render card
// (title, test plan, evidence pass, results, screenshots, tailored menu).

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gatherCard } from "./ticket-card";

let dir: string;
let ticketsDir: string;

async function makeTicket(
    id: string,
    body: string,
    opts: { screenshots?: string[]; results?: Record<string, string> } = {},
): Promise<void> {
    const tdir = join(ticketsDir, "human-review", id);
    await mkdir(tdir, { recursive: true });
    await writeFile(
        join(tdir, "index.md"),
        `# ${id}: a title\n\n**ID:** ${id}\n**Failures:** 0\n\n${body}\n`,
    );
    await writeFile(
        join(tdir, "detail.md"),
        `# ${id}: a real title\n\n## Test Plan\nUnit and e2e.\n\n## History\n- made\n`,
    );
    if (opts.results) {
        const pass = join(tdir, "evidence", "review-1");
        await mkdir(pass, { recursive: true });
        for (const [check, line] of Object.entries(opts.results)) {
            await writeFile(join(pass, `${check}.txt`), `running\n${line}\n`);
        }
    }
    if (opts.screenshots) {
        const ss = join(tdir, "evidence", "implementation-1", "screenshots");
        await mkdir(ss, { recursive: true });
        for (const name of opts.screenshots) {
            await writeFile(join(ss, name), "png");
        }
    }
}

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ticket-card-test-"));
    ticketsDir = join(dir, "tickets");
    await makeTicket("b-1", "second ticket");
    await makeTicket("a-1", "first ticket", {
        screenshots: ["light.png", "dark.png"],
        results: { unit: "EXIT=0", e2e: "396 passed" },
    });
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("gatherCard", () => {
    test("captures title, evidence pass, results, screenshots, and a tailored menu", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "a-1");
        expect(card.title).toBe("a-1: a real title");
        expect(card.testPlan).toContain("Unit and e2e");
        expect(card.latestReview).toBe("review-1");
        expect(card.latestImplementation).toBe("implementation-1");
        expect(card.testResults.unit).toBe("EXIT=0");
        expect(card.testResults.e2e).toBe("396 passed");
        expect(card.screenshots).toHaveLength(2);
        // No project branch for a temp fixture: file list unknown, so the menu
        // keeps the doc + run options rather than hiding them.
        expect(card.changedFilesKnown).toBe(false);
        const keys = card.inspect.map((o) => o.key);
        expect(keys).toContain("screenshots");
        expect(keys).toContain("code-diff");
        expect(keys).toContain("doc-diff");
    });

    test("a ticket with no screenshots drops the screenshots option", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "b-1");
        expect(card.screenshots).toHaveLength(0);
        expect(card.inspect.map((o) => o.key)).not.toContain("screenshots");
    });
});
