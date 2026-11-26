#!/usr/bin/env bash
# Smoke test for scripts/merge-ticket.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout, sets up several tickets with commits in their
# worktrees, then exercises the chain (main => ticket 1 => ticket 2 => ... => main)
# end to end against real git:
#   - stack:   each ticket's branch is rebased onto the one before it, in its own
#              worktree, with a noop ticket (no commits) recorded as a noop. The
#              last ticket's worktree holds every ticket's change, and no extra
#              worktree or branch is created.
#   - land:    fast-forward main to the last ticket's branch; every ticket's change
#              is on main, each ticket directory has moved merge-queue/ -> done/, and
#              the ticket worktrees and branches are gone.
#   - conflict: a ticket that edits the same line an already-landed ticket touched
#              is reported as a conflict (exit 2) with its rebase left IN PROGRESS in
#              its own worktree, naming the ticket, its paths and the tickets after it.
#   - resume:  `resume` with the conflict unresolved reports it again (exit 2); after
#              the conflict is resolved, `resume` continues the rebase, the ticket
#              after it is stacked too, both land, and main has no merge commits.
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"
MERGE="$SCRIPT_DIR/merge-ticket.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-merge-ticket.XXXXXX")"
QUEUES=(todo in-progress human-review merge-queue done)

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$ROOT"
}
trap cleanup EXIT

# State repo is a git repo so the land step's commit-to-done has somewhere to land.
git -C "$ROOT" init -q state
git -C "$ROOT/state" config user.email smoke@test
git -C "$ROOT/state" config user.name smoke
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
for id in feat-1 feat-2 noop-1 conflict-1 after-1; do
    mkdir -p "$ROOT/state/tickets/todo/$id/evidence"
    echo "# $id" > "$ROOT/state/tickets/todo/$id/index.md"
done
git -C "$ROOT/state" add -A
git -C "$ROOT/state" commit -qm "seed tickets"

git -C "$ROOT" init -q project
git -C "$ROOT/project" config user.email smoke@test
git -C "$ROOT/project" config user.name smoke
git -C "$ROOT/project" checkout -q -b main
printf 'worktrees/\n' > "$ROOT/project/.gitignore"
printf 'line1\nline2\n' > "$ROOT/project/shared.txt"
git -C "$ROOT/project" add -A
git -C "$ROOT/project" commit -qm base

MOVE="$SCRIPT_DIR/move.ts"
run_setup() { ( cd "$ROOT/state" && bun "$SETUP" "$@" ); }
run_move() { ( cd "$ROOT/state" && bun "$MOVE" "$@" ); }
run_merge() { ( cd "$ROOT/state" && bun "$MERGE" "$@" ); }
wt_commit() {
    local id="$1" file="$2" content="$3"
    printf '%s' "$content" > "$ROOT/project/worktrees/$id/$file"
    git -C "$ROOT/project/worktrees/$id" add -A
    git -C "$ROOT/project/worktrees/$id" commit -qm "$id work"
}

for id in feat-1 feat-2 noop-1 conflict-1 after-1; do
    run_setup "$id" > /dev/null || fail "setup $id failed"
done
wt_commit feat-1 a.txt "from feat-1"
wt_commit feat-2 b.txt "from feat-2"
wt_commit conflict-1 a.txt "from conflict-1"
wt_commit after-1 e.txt "from after-1"

# setup-ticket moved these to in-progress/; the merge stage acts on merge-queue/,
# so move them there via the real (committing) move, matching how an approved
# ticket reaches merge-queue/ in the live process.
for id in feat-1 feat-2 noop-1 conflict-1 after-1; do
    run_move "$id" merge-queue > /dev/null || fail "move $id to merge-queue failed"
done

WORKTREES_BEFORE="$(git -C "$ROOT/project" worktree list | wc -l)"
BRANCHES_BEFORE="$(git -C "$ROOT/project" branch --list | wc -l)"

# ---- stack: feat-1, feat-2 cleanly, noop-1 as a noop ----
STACK_JSON="$(run_merge stack feat-1 feat-2 noop-1)"
rc=$?
[[ "$rc" -eq 0 ]] || fail "stack expected exit 0, got $rc: $STACK_JSON"
echo "$STACK_JSON" | grep -q '"status":"stacked"' || fail "stack status not 'stacked': $STACK_JSON"
echo "$STACK_JSON" | grep -q '"noops":\["noop-1"\]' || fail "noop-1 not recorded as a noop: $STACK_JSON"
echo "$STACK_JSON" | grep -q '"tip":"feat-2"' || fail "tip is not feat-2: $STACK_JSON"
[[ -f "$ROOT/project/worktrees/feat-2/a.txt" ]] || fail "feat-1 change missing from feat-2's worktree"
[[ -f "$ROOT/project/worktrees/feat-2/b.txt" ]] || fail "feat-2 change missing from feat-2's worktree"
[[ ! -f "$ROOT/project/a.txt" ]] || fail "stack leaked onto main before land"
[[ "$(git -C "$ROOT/project" worktree list | wc -l)" == "$WORKTREES_BEFORE" ]] || fail "stack created an extra worktree"
[[ "$(git -C "$ROOT/project" branch --list | wc -l)" == "$BRANCHES_BEFORE" ]] || fail "stack created an extra branch"

# ---- land: ff main, move tickets to done/, close the worktrees ----
run_merge land feat-1 feat-2 noop-1 > /dev/null || fail "land failed"
[[ -f "$ROOT/project/a.txt" ]] || fail "feat-1 change not on main after land"
[[ -f "$ROOT/project/b.txt" ]] || fail "feat-2 change not on main after land"
for id in feat-1 feat-2 noop-1; do
    [[ -d "$ROOT/state/tickets/done/$id" ]] || fail "$id not moved to done/ after land"
    [[ ! -e "$ROOT/state/tickets/merge-queue/$id" ]] || fail "$id still in merge-queue/ after land"
    [[ ! -e "$ROOT/project/worktrees/$id" ]] || fail "$id worktree not removed after land"
done
git -C "$ROOT/state" log --oneline | grep -q "land" || fail "land did not commit the done move"

# ---- conflict: conflict-1 edits a.txt, now on main via feat-1; after-1 is behind it ----
CONFLICT_JSON="$(run_merge stack conflict-1 after-1 2>/dev/null)"
rc=$?
[[ "$rc" -eq 2 ]] || fail "stack conflict-1 expected exit 2, got $rc"
echo "$CONFLICT_JSON" | grep -q '"status":"conflict"' || fail "conflict not reported: $CONFLICT_JSON"
echo "$CONFLICT_JSON" | grep -q '"ticket":"conflict-1"' || fail "wrong conflict ticket: $CONFLICT_JSON"
echo "$CONFLICT_JSON" | grep -q '"conflicts":\["a.txt"\]' || fail "conflicted path not reported: $CONFLICT_JSON"
echo "$CONFLICT_JSON" | grep -q '"remaining":\["after-1"\]' || fail "remaining tickets not reported: $CONFLICT_JSON"
echo "$CONFLICT_JSON" | grep -q '"worktree":"' || fail "worktree not reported: $CONFLICT_JSON"
CONFLICT_WT="$ROOT/project/worktrees/conflict-1"
GIT_REBASE_DIR="$(git -C "$CONFLICT_WT" rev-parse --git-path rebase-merge)"
[[ -d "$GIT_REBASE_DIR" || -d "$CONFLICT_WT/$GIT_REBASE_DIR" ]] || fail "rebase was not left in progress in conflict-1's worktree"

# ---- unresolved: resume before resolving reports the conflict, rebase still going ----
UNRESOLVED_JSON="$(run_merge resume conflict-1 after-1 2>/dev/null)"
rc=$?
[[ "$rc" -eq 2 ]] || fail "resume with unresolved conflict expected exit 2, got $rc: $UNRESOLVED_JSON"
echo "$UNRESOLVED_JSON" | grep -q '"conflicts":\["a.txt"\]' || fail "unresolved conflict not reported: $UNRESOLVED_JSON"

# ---- resume: resolve in conflict-1's worktree, continue, stack after-1, land both ----
printf '%s' "from conflict-1" > "$CONFLICT_WT/a.txt"
git -C "$CONFLICT_WT" add -A
RESUME_JSON="$(run_merge resume conflict-1 after-1)"
rc=$?
[[ "$rc" -eq 0 ]] || fail "resume expected exit 0, got $rc: $RESUME_JSON"
echo "$RESUME_JSON" | grep -q '"status":"stacked"' || fail "resume status not 'stacked': $RESUME_JSON"
echo "$RESUME_JSON" | grep -q '"included":\["conflict-1","after-1"\]' || fail "resume did not stack both tickets: $RESUME_JSON"
[[ -f "$ROOT/project/worktrees/after-1/e.txt" ]] || fail "after-1 change missing after resume"
[[ "$(cat "$ROOT/project/worktrees/after-1/a.txt")" == "from conflict-1" ]] || fail "conflict-1 change missing from after-1's worktree"
run_merge land conflict-1 after-1 > /dev/null || fail "land after resume failed"
[[ "$(cat "$ROOT/project/a.txt")" == "from conflict-1" ]] || fail "resolved conflict-1 change not on main"
[[ -f "$ROOT/project/e.txt" ]] || fail "after-1 change not on main"
for id in conflict-1 after-1; do
    [[ -d "$ROOT/state/tickets/done/$id" ]] || fail "$id not moved to done/ after land"
done
[[ "$(git -C "$ROOT/project" rev-list --count --merges main)" == "0" ]] \
    || fail "main has merge commits after landing"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
