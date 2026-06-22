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

// Collect screenshot file paths under a pass's screenshots/ directory.
async function passScreenshots(
    evidenceDir: string,
    pass: string | null,
): Promise<string[]> {
    if (!pass) {
        return [];
    }
    const dir = join(evidenceDir, pass, "screenshots");
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter((e) => e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name))
            .map((e) => join(dir, e.name))
            .sort();
    } catch {
        return [];
    }
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
