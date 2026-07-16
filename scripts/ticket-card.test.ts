// Unit tests for ticket-card.ts: the precomputed pb:review render card
// (title, test plan, evidence pass, results, screenshots, tailored menu).

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCard, gatherCard, type TicketCard } from "./ticket-card";

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
        `# ${id}: a real title\n\n## Description\nThe lead description.\n\n### Root cause\nHidden analysis.\n\n## Test Plan\nUnit and e2e.\n\n## History\n- made\n`,
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
            // A name may carry subfolders (e.g. "light/01.png"), so create the
            // parent dir before writing the file.
            const file = join(ss, name);
            await mkdir(join(file, ".."), { recursive: true });
            await writeFile(file, "png");
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
    await makeTicket("c-1", "nested-screenshot ticket", {
        screenshots: [
            "light/01.png",
            "light/02.png",
            "dark/01.png",
            "dark/02.png",
        ],
    });
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("gatherCard", () => {
    test("captures title, evidence pass, results, screenshots, and a tailored menu", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "a-1");
        expect(card.title).toBe("a-1: a real title");
        // Description is the lead prose only; the "### Root cause" subsection is cut.
        expect(card.description).toBe("The lead description.");
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

    test("finds screenshots nested in subfolders (light/, dark/)", async () => {
        const card = await gatherCard(ticketsDir, "human-review", "c-1");
        expect(card.screenshots).toHaveLength(4);
        expect(card.inspect.map((o) => o.key)).toContain("screenshots");
        // The reported directory is the screenshots/ root, not a subfolder.
        const out = formatCard("c-1", card);
        expect(out).toMatch(/Screenshots: 4 \(in .*\/screenshots\)$/m);
    });
});

describe("formatCard", () => {
    const baseCard: TicketCard = {
        title: "a-1: a real title",
        description: "The lead description.",
        changedFiles: [],
        changedFilesKnown: false,
        docsChanged: [],
        latestImplementation: "implementation-1",
        latestReview: "review-1",
        testResults: { unit: "EXIT=0" },
        screenshots: ["light.png", "dark.png"],
        testPlan: "Unit and e2e.",
        commit: null,
        paths: { detail: "d/detail.md", evidenceDir: "d/evidence" },
        inspect: [
            { key: "screenshots", label: "Show screenshots" },
            { key: "code-diff", label: "Show code diff" },
        ],
    };

    test("renders title, evidence pass, results, screenshots, and a numbered menu", () => {
        const out = formatCard("a-1", baseCard);
        expect(out).toContain("a-1: a real title");
        expect(out).toContain("Description:");
        expect(out).toContain("The lead description.");
        expect(out).toContain("Changed files: (unknown)");
        expect(out).toContain("Latest evidence pass: implementation-1 / review-1");
        expect(out).toContain("unit: EXIT=0");
        expect(out).toContain("Test plan:");
        // The card shows a screenshot count, not every path.
        expect(out).toContain("Screenshots: 2");
        expect(out).not.toContain("Screenshots:\n");
        expect(out).toContain("Inspect menu:");
        expect(out).toContain("1. Show screenshots");
        expect(out).toContain("2. Show code diff");
    });

    test("falls back to the id when the card has no title", () => {
        const out = formatCard("a-1", { ...baseCard, title: "" });
        expect(out.split("\n")[0]).toBe("a-1");
    });

    test("omits the Description block when the card has no description", () => {
        const out = formatCard("a-1", { ...baseCard, description: null });
        expect(out).not.toContain("Description:");
    });

    test("shows a changed-file count with a code/docs split, not the list", () => {
        const out = formatCard("a-1", {
            ...baseCard,
            changedFiles: ["src/a.ts", "src/b.ts", "docs/x.md"],
            docsChanged: ["docs/x.md"],
        });
        expect(out).toContain("Changed files: 3 (2 code, 1 docs)");
        expect(out).not.toContain("  src/a.ts");
    });
});
