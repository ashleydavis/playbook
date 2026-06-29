// Make a git worktree's link files portable across machines (e.g. an NFS share
// mounted at a different path on the host than in a VM).
//
// `git worktree add` records two link files:
//   - the worktree's own `.git` file: `gitdir: <abs admin dir>`
//   - the admin back-link `<repo>/.git/worktrees/<id>/gitdir`: `<abs worktree>/.git`
// The worktree's `.git` file is the one that breaks a shared repo: on a different
// mount point its absolute path resolves nowhere, so the worktree is unusable
// there. We rewrite it to a path RELATIVE to the worktree directory; because the
// admin dir is always `project/.git/worktrees/<id>` (co-located with the
// worktree under `project/`), a relative link resolves on any machine.
//
// The admin back-link is left ABSOLUTE. Installed git is 2.43.0, whose
// `git worktree remove`/`list` validate that the back-link holds an absolute
// path to the worktree and resolve it relative to the repo, not the admin dir;
// a relative back-link makes them fail ("does not contain absolute path to the
// working tree location"). Native relative-path worktrees that lift this
// restriction arrived in git 2.48. So we keep the back-link absolute and
// pointed at the worktree on the current machine (the same thing
// `git worktree repair` would write), which is all worktree management needs.

import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

// Pure: compute the contents for both worktree link files.
//   worktreePath: absolute worktree directory (e.g. project/worktrees/<id>).
//   adminDir:     absolute admin directory (project/.git/worktrees/<id>).
// Returns the strings to write into each link file. No IO.
//
//   dotGit:    the worktree's `.git`, RELATIVE to the worktree so it survives a
//              mount-point change (e.g. `gitdir: ../../.git/worktrees/<id>`).
//   adminLink: the admin back-link, ABSOLUTE to the worktree's `.git` on this
//              machine, as git 2.43.0 requires.
export function computeRelativeLinks(
    worktreePath: string,
    adminDir: string,
): { dotGit: string; adminLink: string } {
    return {
        dotGit: "gitdir: " + relative(worktreePath, adminDir) + "\n",
        adminLink: join(worktreePath, ".git") + "\n",
    };
}

// Best-effort, idempotent IO wrapper around computeRelativeLinks. Makes the
// worktree at `worktreePath` portable by rewriting its `.git` link to a relative
// path (and refreshing the admin back-link to this machine's absolute path).
// Returns quietly (never throws) when there is nothing to do, so callers running
// under a mocked git runner, or against a main worktree, are unaffected. Running
// it again recomputes the same strings and rewrites them harmlessly.
export async function relativizeWorktree(worktreePath: string): Promise<void> {
    // A linked worktree's `.git` is a FILE (the link), not a directory. Bail on a
    // main worktree (directory) or a subdir with no `.git` at all. We do NOT trust
    // the file's contents to locate the admin dir: a worktree created on another
    // machine holds a stale absolute path there (the very case repair must fix).
    try {
        const info = await stat(join(worktreePath, ".git"));
        if (info.isDirectory()) return;
    } catch {
        return;
    }

    // Derive the admin dir from the known layout: a worktree at
    // project/worktrees/<id> is administered at project/.git/worktrees/<id>.
    const adminDir = resolve(
        worktreePath,
        "..",
        "..",
        ".git",
        "worktrees",
        basename(worktreePath),
    );
    try {
        await stat(join(adminDir, "gitdir"));
    } catch {
        return; // not a recognised worktree admin dir
    }

    const { dotGit, adminLink } = computeRelativeLinks(worktreePath, adminDir);
    await writeFile(join(worktreePath, ".git"), dotGit);
    await writeFile(join(adminDir, "gitdir"), adminLink);
}
