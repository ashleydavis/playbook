#!/usr/bin/env bash
# Smoke test for scripts/repair-worktrees.ts driven through its CLI with REAL git.
#
# Builds a throwaway project/ git repo with a worktree under worktrees/<id>, then
# simulates the NFS breakage by overwriting BOTH link files (the worktree's .git
# and the admin gitdir) with absolute paths to a bogus root. It then runs the
# repair CLI from a sibling state/ dir and asserts:
#   - both link files are now relative (no leading slash),
#   - the worktree resolves again (git -C worktrees/<id> rev-parse --git-dir works).
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPAIR="$SCRIPT_DIR/repair-worktrees.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-repair.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$ROOT"
}
trap cleanup EXIT

# A state/ sibling so the CLI (run from state/) resolves ../project correctly.
mkdir -p "$ROOT/state"

# Build the project repo with one commit and a real worktree.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
echo base > "$ROOT/project/base.txt"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base
git -C "$ROOT/project" worktree add -q -b worktrees/feat-1 "$ROOT/project/worktrees/feat-1" >/dev/null 2>&1

DOTGIT="$ROOT/project/worktrees/feat-1/.git"
ADMIN="$ROOT/project/.git/worktrees/feat-1/gitdir"

# Simulate the NFS breakage: rewrite both link files with absolute paths to a
# bogus root that does not exist on this host.
printf 'gitdir: /bogus/root/project/.git/worktrees/feat-1\n' > "$DOTGIT"
printf '/bogus/root/project/worktrees/feat-1/.git\n' > "$ADMIN"

# Sanity: the worktree is genuinely broken now.
if git -C "$ROOT/project/worktrees/feat-1" rev-parse --git-dir >/dev/null 2>&1; then
    fail "worktree should be broken after writing bogus absolute links"
fi

# Run the repair CLI from the state repo, like the loop does.
( cd "$ROOT/state" && bun "$REPAIR" > /dev/null ) || fail "repair-worktrees exited non-zero"

# The worktree's own .git link must now be relative (no leading slash on the
# path), so it survives a mount-point change; the admin back-link must be
# absolute and pointed at this host's worktree (git 2.43.0 requires it).
grep -q '^gitdir: /' "$DOTGIT" && fail "worktree .git still absolute: $(cat "$DOTGIT")"
grep -q '^/' "$ADMIN" || fail "admin gitdir not absolute after repair: $(cat "$ADMIN")"

# And the worktree resolves again.
git -C "$ROOT/project/worktrees/feat-1" rev-parse --git-dir >/dev/null 2>&1 \
    || fail "worktree does not resolve after repair"

# Worktree management works again too: git can list and remove it (the back-link
# was the part that broke `git worktree remove` when left relative).
git -C "$ROOT/project" worktree remove --force worktrees/feat-1 >/dev/null 2>&1 \
    || fail "git worktree remove fails after repair"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
