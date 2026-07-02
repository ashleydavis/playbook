// Guard: the playbook's worktree tooling requires git >= 2.48.0, the first
// release with native relative-path worktrees (`git worktree add --relative-paths`
// and the `worktree.useRelativePaths` config). Before 2.48 git wrote ABSOLUTE
// paths into a worktree's two link files, so a repo shared across machines (e.g.
// an NFS mount at a different path on the host than in a VM) had worktrees that
// resolved nowhere. The playbook used to rewrite those links by hand; now we let
// git write them relative, so every script that creates or manages a worktree
// asserts this minimum first and fails fast with a clear message rather than
// producing worktrees that silently break on another machine.

// The lowest git version the worktree tooling supports.
export const MIN_GIT_VERSION = "2.48.0";

// Raised when the installed git is older than MIN_GIT_VERSION. The CLIs map this
// to a non-zero exit with a clean message; the unit test asserts on it.
export class GitVersionError extends Error {}

export type Version = [number, number, number];

// Injectable: return the raw `git --version` output. The unit test passes a
// scripted string; the real one shells out to git.
export type VersionRunner = () => Promise<string>;

const realVersion: VersionRunner = async () => {
    const proc = Bun.spawn(["git", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    if (code !== 0) {
        throw new GitVersionError(
            `could not run 'git --version': ${stderr.trim() || `exit ${code}`}`,
        );
    }
    return stdout;
};

// Parse the first "major.minor[.patch]" out of a version string. Handles vendor
// suffixes like "git version 2.39.3 (Apple Git-146)". Missing patch counts as 0.
// Returns null when no version number can be found.
export function parseGitVersion(output: string): Version | null {
    const m = output.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

// True when `version` is >= `min`, compared component by component.
export function meetsMinimum(version: Version, min: Version): boolean {
    for (let i = 0; i < 3; i++) {
        if (version[i] > min[i]) return true;
        if (version[i] < min[i]) return false;
    }
    return true; // equal
}

// Throw GitVersionError unless the installed git is at least MIN_GIT_VERSION.
// `run` and `min` are injectable for testing; both default to the real values.
export async function assertGitVersion(
    run: VersionRunner = realVersion,
    min: string = MIN_GIT_VERSION,
): Promise<void> {
    const raw = await run();
    const version = parseGitVersion(raw);
    if (!version) {
        throw new GitVersionError(
            `could not parse git version from: ${raw.trim()}`,
        );
    }
    const minVersion = parseGitVersion(min);
    if (!minVersion) {
        throw new GitVersionError(`invalid minimum version: ${min}`);
    }
    if (!meetsMinimum(version, minVersion)) {
        throw new GitVersionError(
            `git ${version.join(".")} is too old: the playbook needs git ` +
                `${min} or newer (for native relative-path worktrees). ` +
                `Upgrade git and try again.`,
        );
    }
}
