#!/usr/bin/env bash
# Smoke test for scripts/setup-work-item.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout in a temp dir (a state/ sibling with the six
# queues, plus a project/ git repo on a `main` commit), admits a work item with
# the real CLI, and asserts:
#   - the item moved todo/ -> in-progress/,
#   - a worktree was created at ../worktrees/<id> against project/ (not state/),
#   - the worktree is detached at the project's current commit (no new branch),
#   - a second run is idempotent (no error, worktree reused).
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-work-item.ts"

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
    mkdir -p "$ROOT/state/work-items/$q"
done
mkdir -p "$ROOT/state/work-items/todo/feat-1/evidence"
echo "# feat-1" > "$ROOT/state/work-items/todo/feat-1/index.md"

# Build the project repo: one commit on main.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
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
    [[ -d "$ROOT/state/work-items/in-progress/feat-1" ]] \
        || fail "feat-1 not in in-progress/"
    [[ ! -e "$ROOT/state/work-items/todo/feat-1" ]] \
        || fail "feat-1 still in todo/"
    [[ -d "$ROOT/worktrees/feat-1" ]] \
        || fail "worktree not created at worktrees/feat-1"
    # The worktree must belong to the project repo, never the state repo.
    git -C "$ROOT/project" worktree list | grep -q "worktrees/feat-1" \
        || fail "worktree not registered in project repo"
    [[ ! -d "$ROOT/state/.git" ]] \
        || fail "state repo unexpectedly became a git repo"
    # Detached at the project's current commit, with no new branch named feat-1.
    WT_SHA="$(git -C "$ROOT/worktrees/feat-1" rev-parse HEAD)"
    [[ "$WT_SHA" == "$MAIN_SHA" ]] \
        || fail "worktree HEAD ($WT_SHA) is not main ($MAIN_SHA)"
    if git -C "$ROOT/project" show-ref --verify --quiet refs/heads/feat-1; then
        fail "a branch named feat-1 was created (expected detached HEAD)"
    fi
else
    fail "setup-work-item feat-1 exited non-zero"
fi

# Idempotent re-run: item already in in-progress/, worktree already present.
if run_setup feat-1 > /dev/null; then
    [[ -d "$ROOT/worktrees/feat-1" ]] || fail "worktree gone after re-run"
else
    fail "idempotent re-run of setup-work-item feat-1 exited non-zero"
fi

# Error path: unknown id must exit non-zero.
if run_setup ghost-99 > /dev/null 2>&1; then
    fail "setup-work-item ghost-99 should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
