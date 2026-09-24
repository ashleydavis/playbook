#!/usr/bin/env bun
// Set or clear a ticket's platforms field in its index.md.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/set-platforms.ts <id> <platform[,platform...]|any>
//
// Finds the ticket in any queue except done/ and aborted/, inserts or replaces
// the `**Platforms:**` line (or removes it for `any`, which clears the lock),
// and commits the change. Platform names are Node's process.platform values.

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { commitState } from "./lib/commit-state";
import { QUEUES } from "./lib/move";

const PLATFORMS_FIELD = /^\*\*Platforms:\*\*.*$/m;

// The platform names a ticket may be locked to (process.platform values).
export const KNOWN_PLATFORMS = ["linux", "darwin", "win32"];

// Queues where platforms may be edited (terminal history is excluded).
const EDITABLE_QUEUES = QUEUES.filter(
    (q) => q !== "done" && q !== "aborted",
) as Exclude<(typeof QUEUES)[number], "done" | "aborted">[];

export class PlatformsError extends Error {}

// Parse the platforms argument: a comma-separated list of known platforms, or
// `any` to clear the lock (returned as []).
export function parsePlatformsArg(arg: string): string[] {
    const trimmed = arg.trim();
    if (trimmed.toLowerCase() === "any") {
        return [];
    }
    const platforms = trimmed
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    if (platforms.length === 0) {
        throw new PlatformsError(
            `invalid platforms '${arg}': give ${KNOWN_PLATFORMS.join(", ")}, or any`,
        );
    }
    for (const p of platforms) {
        if (!KNOWN_PLATFORMS.includes(p)) {
            throw new PlatformsError(
                `unknown platform '${p}': must be one of ${KNOWN_PLATFORMS.join(", ")}, or any`,
            );
        }
    }
    return platforms;
}

// Insert, replace, or remove `**Platforms:** ...` in an index.md body. An
// empty list removes the line. When inserting, place the line after
// `**Priority:**`, else after `**Failures:**`, when present.
export function setPlatforms(indexMd: string, platforms: string[]): string {
    if (platforms.length === 0) {
        return indexMd.replace(/^\*\*Platforms:\*\*.*\n?/m, "");
    }
    const line = `**Platforms:** ${platforms.join(", ")}`;
    if (PLATFORMS_FIELD.test(indexMd)) {
        return indexMd.replace(PLATFORMS_FIELD, line);
    }
    for (const field of [/^\*\*Priority:\*\*.*$/m, /^\*\*Failures:\*\*.*$/m]) {
        const match = field.exec(indexMd);
        if (match) {
            const end = match.index + match[0].length;
            return `${indexMd.slice(0, end)}\n${line}${indexMd.slice(end)}`;
        }
    }
    return `${line}\n${indexMd}`;
}

async function isDir(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function locateEditableTicket(
    id: string,
    ticketsDir: string,
): Promise<{ queue: string; indexPath: string; indexMd: string }> {
    if (!id) {
        throw new PlatformsError(
            "missing id: usage: set-platforms.ts <id> <platform[,platform...]|any>",
        );
    }

    const present = await Promise.all(
        EDITABLE_QUEUES.map((queue) => isDir(join(ticketsDir, queue, id))),
    );
    const matches = EDITABLE_QUEUES.filter((_, i) => present[i]);

    if (matches.length === 0) {
        const inTerminal = await Promise.all(
            (["done", "aborted"] as const).map((queue) =>
                isDir(join(ticketsDir, queue, id)),
            ),
        );
        if (inTerminal.some(Boolean)) {
            throw new PlatformsError(
                `cannot change platforms for '${id}': ticket is in a terminal queue`,
            );
        }
        throw new PlatformsError(`unknown id '${id}': not found in any queue`);
    }
    if (matches.length > 1) {
        throw new PlatformsError(
            `ambiguous id '${id}': found in multiple queues (${matches.join(", ")})`,
        );
    }

    const queue = matches[0];
    const indexPath = join(ticketsDir, queue, id, "index.md");
    let indexMd: string;
    try {
        indexMd = await readFile(indexPath, "utf8");
    } catch {
        throw new PlatformsError(`no index.md for '${id}' in ${queue}/`);
    }
    return { queue, indexPath, indexMd };
}

export async function updatePlatforms(
    id: string,
    platformsArg: string,
    ticketsDir: string,
): Promise<{ id: string; queue: string; platforms: string[] }> {
    const platforms = parsePlatformsArg(platformsArg);
    const { queue, indexPath, indexMd } = await locateEditableTicket(id, ticketsDir);
    await writeFile(indexPath, setPlatforms(indexMd, platforms));
    return { id, queue, platforms };
}

async function main(argv: string[]): Promise<void> {
    const [id, platformsArg] = argv;
    if (!id || platformsArg === undefined) {
        console.error("usage: set-platforms.ts <id> <platform[,platform...]|any>");
        process.exit(1);
    }

    const ticketsDir = join(process.cwd(), "tickets");
    try {
        await readdir(ticketsDir);
    } catch {
        console.error(
            `no tickets/ directory in ${process.cwd()}: run from the state repo root`,
        );
        process.exit(1);
    }

    try {
        const result = await updatePlatforms(id, platformsArg, ticketsDir);
        const shown = result.platforms.length > 0 ? result.platforms.join(", ") : "any";
        console.log(`set platforms for ${id}: ${shown}`);
        await commitState(
            process.cwd(),
            `set platforms ${id} -> ${shown}`,
            [relative(process.cwd(), join(ticketsDir, result.queue, id))],
        );
    } catch (err) {
        if (err instanceof PlatformsError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }
}

if (process.argv[1] === __filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
