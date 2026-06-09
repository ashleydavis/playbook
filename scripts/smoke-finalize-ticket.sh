#!/usr/bin/env bash
# Smoke test for scripts/finalize-ticket.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout, sets up a ticket, makes a commit in its
# worktree, then exercises the three finalize outcomes against real git:
#   - merged:   worktree commit rebases onto an advanced main, fast-forwards in,
#               and the worktree is removed (exit 0).
#   - conflict: the worktree and main edit the same line; finalize aborts the
#               rebase, leaves the worktree intact, and exits 2.
#   - noop:     a worktree with no commits ahead is just removed (exit 0).
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"
FINALIZE="$SCRIPT_DIR/finalize-ticket.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-finalize.XXXXXX")"
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

# State repo with three tickets waiting in todo/.
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
for id in merge-1 conflict-1 noop-1; do
    mkdir -p "$ROOT/state/tickets/todo/$id/evidence"
    echo "# $id" > "$ROOT/state/tickets/todo/$id/index.md"
done

# Project repo with a shared file both sides can touch.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
printf 'line1\nline2\n' > "$ROOT/project/shared.txt"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base

run_setup() { ( cd "$ROOT/state" && bun "$SETUP" "$@" ); }
run_finalize() { ( cd "$ROOT/state" && bun "$FINALIZE" "$@" ); }
wt_commit() {
    # Commit a change in ticket $1's worktree.
    local id="$1" file="$2" content="$3"
    printf '%s' "$content" > "$ROOT/project/worktrees/$id/$file"
    git -C "$ROOT/project/worktrees/$id" add -A
    git -C "$ROOT/project/worktrees/$id" commit -qm "$id work"
}

# ---- merged: clean rebase onto advanced main, fast-forward, remove ----
run_setup merge-1 > /dev/null || fail "setup merge-1 failed"
wt_commit merge-1 feature.txt "from merge-1"
# Advance main on an unrelated file so the rebase is real but conflict-free.
echo other > "$ROOT/project/other.txt"
git -C "$ROOT/project" add -A && git -C "$ROOT/project" commit -qm "other on main"
if run_finalize merge-1 > /dev/null; then
    [[ ! -e "$ROOT/project/worktrees/merge-1" ]] || fail "merge-1 worktree not removed"
    [[ -f "$ROOT/project/feature.txt" ]] || fail "merge-1 change missing from main"
    git -C "$ROOT/project" log --oneline | grep -q "merge-1 work" \
        || fail "merge-1 commit not on main"
    git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/merge-1 \
        && fail "merge-1 per-ticket branch not deleted"
else
    fail "finalize merge-1 should have exited 0"
fi

# ---- conflict: both sides edit the same line; abort and exit 2 ----
run_setup conflict-1 > /dev/null || fail "setup conflict-1 failed"
wt_commit conflict-1 shared.txt $'line1\nWORKTREE\n'
# Main edits the same second line differently.
printf 'line1\nMAIN\n' > "$ROOT/project/shared.txt"
git -C "$ROOT/project" add -A && git -C "$ROOT/project" commit -qm "main edits shared"
run_finalize conflict-1 > /dev/null 2>&1
rc=$?
[[ "$rc" -eq 2 ]] || fail "finalize conflict-1 expected exit 2, got $rc"
[[ -d "$ROOT/project/worktrees/conflict-1" ]] || fail "conflict-1 worktree was removed (should stay)"
# Worktree must be left clean (rebase aborted), not mid-rebase.
if [[ -d "$ROOT/project/worktrees/conflict-1/.git" ]] || true; then
    git -C "$ROOT/project/worktrees/conflict-1" status > /dev/null 2>&1 \
        || fail "conflict-1 worktree left in a broken state"
fi
git -C "$ROOT/project" rev-parse --verify -q REBASE_HEAD > /dev/null 2>&1 \
    && fail "project repo left mid-rebase"

# ---- noop: worktree with no commits ahead is just removed ----
run_setup noop-1 > /dev/null || fail "setup noop-1 failed"
if run_finalize noop-1 > /dev/null; then
    [[ ! -e "$ROOT/project/worktrees/noop-1" ]] || fail "noop-1 worktree not removed"
else
    fail "finalize noop-1 should have exited 0"
fi

# Error path: unknown id (no worktree) must exit non-zero.
if run_finalize ghost-99 > /dev/null 2>&1; then
    fail "finalize ghost-99 should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
