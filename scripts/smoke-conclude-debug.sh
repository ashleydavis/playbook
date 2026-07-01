#!/usr/bin/env bash
# Smoke test for scripts/conclude-debug.ts driven through its CLI with REAL git.
#
# A Debug ticket concludes straight to done/ (agent-review spawns a Fix ticket and
# moves the Debug ticket on), never passing through the merge train that would tear
# its worktree down. conclude-debug.ts is that teardown. This walks a ticket to
# agent-review/ with a real worktree, concludes it, and checks: the ticket moved to
# done/, the move was committed, and the worktree + branch are gone.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"
MOVE="$SCRIPT_DIR/move.ts"
CONCLUDE="$SCRIPT_DIR/conclude-debug.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-conclude-debug.XXXXXX")"
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

# State repo: git repo so the conclude move commits somewhere.
git -C "$ROOT" init -q state
git -C "$ROOT/state" config user.email smoke@test
git -C "$ROOT/state" config user.name smoke
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
mkdir -p "$ROOT/state/tickets/todo/dbg-1/evidence"
echo "# dbg-1" > "$ROOT/state/tickets/todo/dbg-1/index.md"
git -C "$ROOT/state" add -A
git -C "$ROOT/state" commit -qm "seed ticket"

# Project repo with a base commit so a worktree can be created.
git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base

run_setup() { ( cd "$ROOT/state" && bun "$SETUP" "$@" ); }
run_move() { ( cd "$ROOT/state" && bun "$MOVE" "$@" ); }
run_conclude() { ( cd "$ROOT/state" && bun "$CONCLUDE" "$@" ); }

# Admit the ticket (creates its worktree, moves to in-progress/) then walk it to
# agent-review/, where a concluded Debug ticket sits.
run_setup dbg-1 > /dev/null || fail "setup dbg-1 failed"
[[ -d "$ROOT/project/worktrees/dbg-1" ]] || fail "dbg-1 worktree not created"
run_move dbg-1 agent-review > /dev/null || fail "move dbg-1 to agent-review failed"

# ---- conclude: move to done/, close the worktree ----
run_conclude dbg-1 > /dev/null || fail "conclude-debug dbg-1 failed"
[[ -d "$ROOT/state/tickets/done/dbg-1" ]] || fail "dbg-1 not moved to done/"
[[ ! -e "$ROOT/state/tickets/agent-review/dbg-1" ]] || fail "dbg-1 still in agent-review/"
git -C "$ROOT/state" log --oneline | grep -q "conclude debug dbg-1" \
    || fail "conclude did not commit the done move"
[[ ! -e "$ROOT/project/worktrees/dbg-1" ]] || fail "dbg-1 worktree not removed"
git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/dbg-1 \
    && fail "dbg-1 branch not deleted"

# Idempotent: re-running on an already-concluded ticket is a safe no-op (the move
# sees it already in done/), exit 0, and it stays in done/.
run_conclude dbg-1 > /dev/null 2>&1 || fail "re-running conclude on a done ticket should be a no-op"
[[ -d "$ROOT/state/tickets/done/dbg-1" ]] || fail "dbg-1 left done/ on the no-op re-run"

# Error path: an unknown id exits non-zero.
if run_conclude ghost-99 > /dev/null 2>&1; then
    fail "conclude-debug on an unknown id should exit non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
