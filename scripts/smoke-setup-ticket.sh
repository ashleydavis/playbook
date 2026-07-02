#!/usr/bin/env bash
# Smoke test for scripts/setup-ticket.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout in a temp dir (a state/ sibling with the six
# queues, plus a project/ git repo on a `main` commit), admits a ticket with
# the real CLI, and asserts:
#   - the ticket moved todo/ -> in-progress/,
#   - a worktree was created at ../project/worktrees/<id> against project/ (not state/),
#   - the worktree is on a new branch worktrees/<id> at the project's current commit,
#   - a second run is idempotent (no error, worktree reused).
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-setup.XXXXXX")"
QUEUES=(todo in-progress agent-review human-review merge-queue done)

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$ROOT"
}
trap cleanup EXIT

# Build the state repo: six empty queues plus feat-1 waiting in todo/.
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
mkdir -p "$ROOT/state/tickets/todo/feat-1/evidence"
echo "# feat-1" > "$ROOT/state/tickets/todo/feat-1/index.md"

# Make the state repo a git repo so setup-ticket.ts's auto-commit can run.
git -C "$ROOT/state" init -q
git -C "$ROOT/state" config user.email smoke@test
git -C "$ROOT/state" config user.name smoke
git -C "$ROOT/state" add -A
git -C "$ROOT/state" commit -qm "scaffold state repo"

# Build the project repo: one commit on main.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
echo base > "$ROOT/project/base.txt"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base
MAIN_SHA="$(git -C "$ROOT/project" rev-parse HEAD)"

# Run the CLI from the state repo, like the loop does.
run_setup() {
    ( cd "$ROOT/state" && bun "$SETUP" "$@" )
}

# Happy path.
if run_setup feat-1 > /dev/null; then
    [[ -d "$ROOT/state/tickets/in-progress/feat-1" ]] \
        || fail "feat-1 not in in-progress/"
    [[ ! -e "$ROOT/state/tickets/todo/feat-1" ]] \
        || fail "feat-1 still in todo/"
    [[ -d "$ROOT/project/worktrees/feat-1" ]] \
        || fail "worktree not created at project/worktrees/feat-1"
    # The worktree must belong to the project repo, never the state repo.
    git -C "$ROOT/project" worktree list | grep -q "worktrees/feat-1" \
        || fail "worktree not registered in project repo"
    # The admit auto-committed in the state repo with the expected message.
    admit_msg="$(git -C "$ROOT/state" log -1 --pretty=%s)"
    [[ "$admit_msg" == "admit feat-1 to in-progress" ]] \
        || fail "admit commit message wrong: '$admit_msg'"
    # On a new branch worktrees/feat-1 at the project's current commit.
    WT_SHA="$(git -C "$ROOT/project/worktrees/feat-1" rev-parse HEAD)"
    [[ "$WT_SHA" == "$MAIN_SHA" ]] \
        || fail "worktree HEAD ($WT_SHA) is not main ($MAIN_SHA)"
    git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/feat-1 \
        || fail "branch worktrees/feat-1 was not created"
    WT_BRANCH="$(git -C "$ROOT/project/worktrees/feat-1" rev-parse --abbrev-ref HEAD)"
    [[ "$WT_BRANCH" == "worktrees/feat-1" ]] \
        || fail "worktree not on branch worktrees/feat-1 (got $WT_BRANCH)"
    # Both link files must be RELATIVE (git worktree add --relative-paths, git
    # >= 2.48) so the repo survives being shared across machines (NFS) at
    # different mount points: the worktree's own .git and the admin back-link.
    grep -q '^gitdir: /' "$ROOT/project/worktrees/feat-1/.git" \
        && fail "worktree .git is absolute: $(cat "$ROOT/project/worktrees/feat-1/.git")"
    grep -q '^/' "$ROOT/project/.git/worktrees/feat-1/gitdir" \
        && fail "admin gitdir is absolute: $(cat "$ROOT/project/.git/worktrees/feat-1/gitdir")"
    git -C "$ROOT/project/worktrees/feat-1" status >/dev/null 2>&1 \
        || fail "git status fails in the worktree with relative links"
else
    fail "setup-ticket feat-1 exited non-zero"
fi

# Idempotent re-run: ticket already in in-progress/, worktree already present.
if run_setup feat-1 > /dev/null; then
    [[ -d "$ROOT/project/worktrees/feat-1" ]] || fail "worktree gone after re-run"
else
    fail "idempotent re-run of setup-ticket feat-1 exited non-zero"
fi

# Error path: unknown id must exit non-zero.
if run_setup ghost-99 > /dev/null 2>&1; then
    fail "setup-ticket ghost-99 should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
