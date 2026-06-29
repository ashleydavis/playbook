#!/usr/bin/env bun
// Relativize the link files of every pre-existing ticket worktree.
//
// Usage (run with the state repo as the current working directory):
//   bun ../scripts/repair-worktrees.ts
//
// Worktrees created before relative links existed (or created on another machine
// at a different mount point) carry ABSOLUTE paths in their link files, so they
// are broken on this host: `git -C project/worktrees/<id> ...` and
// `git worktree remove` fail because the links point nowhere. This one-shot tool
// rewrites every worktree under ../project/worktrees/ to relative links, after
// which the normal machinery (reset-loop, merge-ticket cleanup) works again.
//
// It commits nothing: worktrees are gitignored by the project repo.

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { relativizeWorktree } from "./lib/relative-worktree";

// Immediate subdirectory names of `dir`, sorted; empty if `dir` is absent.
async function subdirs(dir: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
    } catch {
        return [];
    }
}

// Core: relativize every worktree under `worktreesDir`. Returns the list of
// worktree paths processed (empty when the directory is absent). relativizeWorktree
// is best-effort, so a subdir that is not a real worktree is silently skipped.
export async function repairWorktrees(worktreesDir: string): Promise<string[]> {
    const processed: string[] = [];
    for (const id of await subdirs(worktreesDir)) {
        const wtPath = join(worktreesDir, id);
        await relativizeWorktree(wtPath);
        processed.push(wtPath);
    }
    return processed;
}

// Thin CLI wrapper. Not exercised by the unit tests.
async function main(): Promise<void> {
    const stateDir = process.cwd();
    const projectDir = resolve(stateDir, "..", "project");
    const worktreesDir = join(projectDir, "worktrees");

    const repaired = await repairWorktrees(worktreesDir);
    for (const wtPath of repaired) {
        console.log(`repaired ${wtPath}`);
    }
    console.log(`repaired ${repaired.length} worktree(s)`);
}

// Only run the CLI when invoked directly, not when imported by tests.
if (process.argv[1] === __filename) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
