#!/usr/bin/env bun
// Gather everything pb:review needs to render one ticket, once, at snapshot
// time. The result is embedded in the review snapshot so the review loop can
// print a ticket's summary and its tailored inspect menu straight from JSON,
// without re-reading detail.md and walking evidence/ every turn.
//
// All gathering is best-effort: a missing detail.md, evidence tree, or git
// worktree degrades to a thinner card, never an error. Only cheap, on-disk
// facts are precomputed; the genuinely expensive or prose-bound bits (the full
// code/doc diffs, the testing-manual run-by-hand commands) stay lazy and are
// pointed at by `paths`/`commit` so the skill fetches them on demand.

import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// The eight inspect-loop options, in their canonical order. Each card lists the
// subset that applies to that ticket, already numbered for printing.
export interface InspectOption {
    key: string;
    label: string;
}

export interface TicketCard {
    title: string;
    // The ticket's Description (lead prose, before any "### " subsection), so
    // the review loop can open with the ticket's name and description without a
    // separate read. Null when the ticket has no Description section.
    description: string | null;
    // One-line "what changed" summary parts.
    changedFiles: string[];
    changedFilesKnown: boolean;
    docsChanged: string[];
    // Latest evidence pass and its results.
    latestImplementation: string | null;
    latestReview: string | null;
    testResults: Record<string, string>;
    screenshots: string[];
    testPlan: string | null;
    commit: string | null;
    paths: { detail: string; evidenceDir: string };
    // The tailored inspect menu, already filtered and numbered.
    inspect: InspectOption[];
}

// Pull the first markdown H1 as the title, falling back to the id.
function parseTitle(md: string, id: string): string {
    const m = md.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : id;
}

// Extract a named "## Section" body (until the next "## ") as trimmed text.
function parseSection(md: string, heading: string): string | null {
    const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "m");
    const m = md.match(re);
    if (!m) {
        return null;
    }
    const body = m[1].trim();
    return body.length > 0 ? body : null;
}

// Pull the ticket's Description: the lead prose of the "## Description" section,
// stopping before any "### " subsection (e.g. a root-cause write-up) so the card
// carries the description, not the whole analysis. Null when absent or empty.
function parseDescription(md: string): string | null {
    const body = parseSection(md, "Description");
    if (!body) {
        return null;
    }
    const lead = body.split(/^###\s+/m)[0].trim();
    if (!lead) {
        return null;
    }
    // Keep the card's description short: drop a "From the project todo list:"
    // preamble and any blockquote lines, then take the first paragraph. The full
    // Description stays in detail.md for anyone who opens it.
    const cleaned = lead
        .split("\n")
        .filter(
            (l) =>
                !/^\s*>/.test(l) &&
                !/^from the project todo list:/i.test(l.trim()),
        )
        .join("\n")
        .trim();
    const firstPara = (cleaned || lead).split(/\n\s*\n/)[0].trim();
    return firstPara.length > 0 ? firstPara : null;
}

// List the evidence pass directories matching a prefix (implementation-N /
// review-N), returning the highest-numbered one or null.
async function latestPass(
    evidenceDir: string,
    prefix: string,
): Promise<string | null> {
    let entries;
    try {
        entries = await readdir(evidenceDir, { withFileTypes: true });
    } catch {
        return null;
    }
    const ns = entries
        .filter((e) => e.isDirectory() && e.name.startsWith(`${prefix}-`))
        .map((e) => Number(e.name.slice(prefix.length + 1)))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => b - a);
    return ns.length > 0 ? `${prefix}-${ns[0]}` : null;
}

// Collect image file paths anywhere under a directory, at any nesting depth.
// Screenshots may sit directly in screenshots/ or be grouped into subfolders
// (e.g. light/, dark/, or deeper), so walk the whole tree rather than assume a
// fixed layout.
async function collectImages(dir: string): Promise<string[]> {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const found: string[] = [];
    for (const e of entries) {
        const path = join(dir, e.name);
        if (e.isDirectory()) {
            found.push(...(await collectImages(path)));
        } else if (e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name)) {
            found.push(path);
        }
    }
    return found;
}

// Collect screenshot file paths under a pass's screenshots/ directory.
async function passScreenshots(
    evidenceDir: string,
    pass: string | null,
): Promise<string[]> {
    if (!pass) {
        return [];
    }
    const dir = join(evidenceDir, pass, "screenshots");
    return (await collectImages(dir)).sort();
}

// Read the tail result of each check's .txt in a pass, as a short status line.
async function passResults(
    evidenceDir: string,
    pass: string | null,
): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    if (!pass) {
        return results;
    }
    for (const check of ["compile", "unit", "smoke", "e2e"]) {
        try {
            const text = await readFile(
                join(evidenceDir, pass, `${check}.txt`),
                "utf8",
            );
            const lines = text.trimEnd().split("\n");
            // Prefer an explicit EXIT/passed line; else the last non-empty line.
            const hit =
                [...lines].reverse().find((l) =>
                    /(EXIT|exit code|passed|failed)/i.test(l),
                ) ?? lines[lines.length - 1];
            results[check] = hit.trim().slice(0, 120);
        } catch {
            // No file for this check in this pass; skip it.
        }
    }
    return results;
}

// Best-effort: the ticket's changed files vs main, read from the project repo's
// ticket branch (`worktrees/<id>`). Using the branch, not the worktree
// directory, survives a torn-down or relocated worktree. Returns
// { files, known: false } when git, the project repo, or the branch is absent.
async function changedFiles(
    id: string,
): Promise<{ files: string[]; known: boolean; commit: string | null }> {
    const project = join(process.cwd(), "..", "project");
    const branch = `worktrees/${id}`;
    try {
        await stat(project);
        const { stdout: diff } = await run(
            "git",
            ["-C", project, "diff", "--name-only", `main...${branch}`],
            { timeout: 10000 },
        );
        let commit: string | null = null;
        try {
            const { stdout: sha } = await run(
                "git",
                ["-C", project, "rev-parse", branch],
                { timeout: 10000 },
            );
            commit = sha.trim();
        } catch {
            commit = null;
        }
        const files = diff
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        return { files, known: true, commit };
    } catch {
        return { files: [], known: false, commit: null };
    }
}

// Tailor the inspect menu to the ticket: drop options that cannot apply.
function buildInspect(card: {
    screenshots: string[];
    docsChanged: string[];
    changedFiles: string[];
    changedFilesKnown: boolean;
    testPlan: string | null;
}): InspectOption[] {
    const hasCode = card.changedFiles.some(
        (f) => !f.startsWith("docs/") && !f.endsWith(".md"),
    );
    // When we could not read the file list, keep the runnable/doc options rather
    // than wrongly hide them.
    const unknown = !card.changedFilesKnown;
    const options: InspectOption[] = [];
    if (card.screenshots.length > 0) {
        options.push({ key: "screenshots", label: "Show the screenshots" });
    }
    if (hasCode || unknown) {
        options.push({
            key: "run-by-hand",
            label: "Run it by hand (I show you how)",
        });
        options.push({
            key: "start-app",
            label: "Start it for you (I launch the app, you explore it)",
        });
    }
    if (card.testPlan && !/^n\/a/i.test(card.testPlan)) {
        options.push({ key: "tests", label: "Run the automated tests" });
    }
    if (card.docsChanged.length > 0 || unknown) {
        options.push({
            key: "doc-diff",
            label: "Show the doc changes (I show you the diff)",
        });
        options.push({
            key: "docs-read",
            label: "Read the docs yourself (I point you to them)",
        });
    }
    options.push({ key: "code-diff", label: "Show the code diff (I show you the diff)" });
    options.push({
        key: "code-diff-self",
        label: "View the code diff yourself (I show you how)",
    });
    return options;
}

// Gather a full card for one ticket. Never throws: every part degrades.
export async function gatherCard(
    ticketsDir: string,
    queue: string,
    id: string,
): Promise<TicketCard> {
    const ticketDir = join(ticketsDir, queue, id);
    const detailPath = join(ticketDir, "detail.md");
    const evidenceDir = join(ticketDir, "evidence");

    let md = "";
    try {
        md = await readFile(detailPath, "utf8");
    } catch {
        md = "";
    }

    const title = parseTitle(md, id);
    const description = parseDescription(md);
    const testPlan = parseSection(md, "Test Plan");

    const latestImplementation = await latestPass(evidenceDir, "implementation");
    const latestReview = await latestPass(evidenceDir, "review");
    const screenshots = await passScreenshots(evidenceDir, latestImplementation);
    const testResults = await passResults(
        evidenceDir,
        latestReview ?? latestImplementation,
    );

    const { files, known, commit } = await changedFiles(id);
    const docsChanged = files.filter((f) => f.startsWith("docs/"));

    const inspect = buildInspect({
        screenshots,
        docsChanged,
        changedFiles: files,
        changedFilesKnown: known,
        testPlan,
    });

    return {
        title,
        description,
        changedFiles: files,
        changedFilesKnown: known,
        docsChanged,
        latestImplementation,
        latestReview,
        testResults,
        screenshots,
        testPlan,
        commit,
        paths: { detail: detailPath, evidenceDir },
        inspect,
    };
}

// Render a card as plain text: the summary facts the review step needs and the
// tailored inspect menu, numbered. This is what the pb:review skill prints for
// the selected ticket.
export function formatCard(id: string, card: TicketCard): string {
    const lines: string[] = [];
    lines.push(card.title || id);
    lines.push("");

    if (card.description) {
        lines.push("Description:");
        lines.push(card.description);
        lines.push("");
    }

    // Print a count, not the whole list, so the card stays a short summary. The
    // full file list is one inspect-menu pick away (the code/doc diffs).
    if (card.changedFiles.length > 0) {
        const docs = card.docsChanged.length;
        const code = card.changedFiles.length - docs;
        lines.push(
            `Changed files: ${card.changedFiles.length} (${code} code, ${docs} docs)`,
        );
    } else {
        lines.push(
            `Changed files: ${card.changedFilesKnown ? "(none)" : "(unknown)"}`,
        );
    }

    // The doc files are named (usually few) because the doc inspect options act
    // on them by name.
    if (card.docsChanged.length > 0) {
        lines.push("Docs changed:");
        for (const f of card.docsChanged) {
            lines.push(`  ${f}`);
        }
    }

    const pass = [card.latestImplementation, card.latestReview]
        .filter(Boolean)
        .join(" / ");
    if (pass) {
        lines.push(`Latest evidence pass: ${pass}`);
    }

    const results = Object.entries(card.testResults ?? {});
    if (results.length > 0) {
        lines.push("Test results:");
        for (const [name, value] of results) {
            lines.push(`  ${name}: ${value}`);
        }
    }

    if (card.testPlan) {
        lines.push("Test plan:");
        lines.push(card.testPlan);
    }

    // Count plus the screenshots/ root they live under, not every path: the
    // "show the screenshots" inspect option lists and opens them from there
    // (recursing into any subfolders such as light/ and dark/).
    if (card.screenshots.length > 0) {
        const first = card.screenshots[0];
        const marker = "/screenshots/";
        const idx = first.indexOf(marker);
        const dir =
            idx >= 0
                ? first.slice(0, idx + marker.length - 1)
                : first.replace(/\/[^/]+$/, "");
        lines.push(`Screenshots: ${card.screenshots.length} (in ${dir})`);
    }

    if (card.commit) {
        lines.push(`Commit: ${card.commit}`);
    }
    lines.push(`Detail: ${card.paths.detail}`);
    lines.push(`Evidence dir: ${card.paths.evidenceDir}`);

    lines.push("");
    lines.push("Inspect menu:");
    card.inspect.forEach((opt, i) => {
        lines.push(`${i + 1}. ${opt.label}`);
    });

    return lines.join("\n");
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    let id: string | undefined;
    let queue = "human-review";
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--queue" && argv[i + 1]) {
            queue = argv[++i];
        } else if (!id && !argv[i].startsWith("--")) {
            id = argv[i];
        }
    }
    if (!id) {
        console.error("usage: ticket-card.ts <id> [--queue <name>]");
        process.exit(1);
    }

    const ticketsDir = join(process.cwd(), "tickets");
    const card = await gatherCard(ticketsDir, queue, id);
    console.log(formatCard(id, card));
}

if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
