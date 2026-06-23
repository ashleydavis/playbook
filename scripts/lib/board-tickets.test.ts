// Unit tests for the shared ticket-reading helpers: parseDescription,
// truncateDescription, and readTicket.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    DESCRIPTION_LIMIT,
    parseDescription,
    readTicket,
    truncateDescription,
} from "./board-tickets";

describe("parseDescription()", () => {
    test("returns the first body line, skipping heading and metadata", () => {
        const md =
            "# id: a title\n\n**ID:** id\n**Type:** Tweak\n**Failures:** 0\n\nDo the thing.\n";
        expect(parseDescription(md)).toBe("Do the thing.");
    });

    test("returns '' when there is no body line", () => {
        const md = "# id: a title\n\n**ID:** id\n**Failures:** 0\n";
        expect(parseDescription(md)).toBe("");
    });

    test("returns '' for empty input", () => {
        expect(parseDescription("")).toBe("");
    });

    test("skips an HTML comment block opener", () => {
        expect(parseDescription("# id\n**ID:** id\n<!--")).toBe("");
    });
});

describe("truncateDescription()", () => {
    test("leaves a short description unchanged", () => {
        expect(truncateDescription("add result ranking")).toBe("add result ranking");
    });

    test("collapses internal whitespace and newlines", () => {
        expect(truncateDescription("add   result\nranking")).toBe("add result ranking");
    });

    test("cuts a long description and appends an ellipsis", () => {
        const long = "x".repeat(DESCRIPTION_LIMIT + 20);
        const out = truncateDescription(long);
        expect(out.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
        expect(out.endsWith("…")).toBe(true);
    });

    test("does not cut a trailing partial word mid-token", () => {
        const out = truncateDescription("alpha beta gamma delta epsilon zeta", 18);
        expect(out).toBe("alpha beta gamma…");
    });
});

describe("readTicket()", () => {
    let root: string;
    let ticketsDir: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "read-ticket-test-"));
        ticketsDir = join(root, "tickets");
        await mkdir(ticketsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    test("reads description, dependencies, failures, and priority", async () => {
        const dir = join(ticketsDir, "todo", "feat-2");
        await mkdir(dir, { recursive: true });
        await writeFile(
            join(dir, "index.md"),
            "# feat-2: a title\n\n**ID:** feat-2\n**Depends on:** feat-1\n**Failures:** 2\n**Priority:** 30\n\npaginate results\n",
        );
        expect(await readTicket(ticketsDir, "todo", "feat-2")).toEqual({
            id: "feat-2",
            description: "paginate results",
            dependsOn: ["feat-1"],
            failures: 2,
            priority: 30,
        });
    });

    test("tolerates a ticket with no index.md", async () => {
        await mkdir(join(ticketsDir, "todo", "broken-1"), { recursive: true });
        expect(await readTicket(ticketsDir, "todo", "broken-1")).toEqual({
            id: "broken-1",
            description: "",
            dependsOn: [],
            failures: 0,
            priority: 100,
        });
    });
});
