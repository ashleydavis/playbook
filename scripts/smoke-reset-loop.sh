#!/usr/bin/env bash
# Smoke test for scripts/reset-loop.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout, admits two tickets (each gets a worktree and
# branch via setup-ticket.ts), commits work in one worktree and leaves the
# other dirty, then runs reset-loop and asserts the loop is wound back to a clean
# slate:
#   - both tickets return from in-progress/ to todo/,
#   - both worktrees are force-removed (discarding committed and uncommitted work),
#   - both per-ticket branches are deleted,
#   - no stale worktree records remain.
# Finally checks a second run is a clean no-op. Prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"
RESET="$SCRIPT_DIR/reset-loop.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-reset.XXXXXX")"
QUEUES=(todo in-progress agent-review human-review merge-queue done blocked)

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$ROOT"
}
trap cleanup EXIT

# State repo with two tickets waiting in todo/.
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
for id in feat-1 feat-2; do
    mkdir -p "$ROOT/state/tickets/todo/$id/evidence"
    echo "# $id" > "$ROOT/state/tickets/todo/$id/index.md"
done

# Project repo with a base commit.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
printf 'base\n' > "$ROOT/project/base.txt"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base

run_setup() { ( cd "$ROOT/state" && bun "$SETUP" "$@" ); }
run_reset() { ( cd "$ROOT/state" && bun "$RESET" "$@" ); }

# Admit both tickets: each moves todo/ -> in-progress/ and gets a worktree+branch.
run_setup feat-1 > /dev/null || fail "setup feat-1 failed"
run_setup feat-2 > /dev/null || fail "setup feat-2 failed"

# feat-1: a committed change that reset must discard (no merge).
printf 'work\n' > "$ROOT/project/worktrees/feat-1/new.txt"
git -C "$ROOT/project/worktrees/feat-1" add -A
git -C "$ROOT/project/worktrees/feat-1" commit -qm "feat-1 work"
# feat-2: an uncommitted change that force-remove must discard.
printf 'dirty\n' > "$ROOT/project/worktrees/feat-2/dirty.txt"

# ---- reset: requeue both tickets, tear down both worktrees ----
if run_reset > /dev/null; then
    [[ -d "$ROOT/state/tickets/todo/feat-1" ]] || fail "feat-1 not requeued to todo/"
    [[ -d "$ROOT/state/tickets/todo/feat-2" ]] || fail "feat-2 not requeued to todo/"
    [[ -z "$(ls -A "$ROOT/state/tickets/in-progress")" ]] || fail "in-progress/ not empty"
    [[ ! -e "$ROOT/project/worktrees/feat-1" ]] || fail "feat-1 worktree not removed"
    [[ ! -e "$ROOT/project/worktrees/feat-2" ]] || fail "feat-2 worktree not removed"
    git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/feat-1 \
        && fail "feat-1 branch not deleted"
    git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/feat-2 \
        && fail "feat-2 branch not deleted"
    # The committed feat-1 work was discarded, not merged into main.
    git -C "$ROOT/project" log --oneline | grep -q "feat-1 work" \
        && fail "feat-1 work leaked onto main (reset must not merge)"
    # Only the main worktree should remain registered.
    [[ "$(git -C "$ROOT/project" worktree list | wc -l)" -eq 1 ]] \
        || fail "stale worktree records remain"
else
    fail "reset should have exited 0"
fi

# ---- idempotent: a second run with nothing in flight is a clean no-op ----
run_reset > /dev/null || fail "second reset (nothing in flight) should exit 0"

# ---- error path: not run from a state repo must exit non-zero ----
if ( cd "$ROOT" && bun "$RESET" > /dev/null 2>&1 ); then
    fail "reset outside a state repo should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
