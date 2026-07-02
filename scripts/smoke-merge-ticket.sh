#!/usr/bin/env bash
# Smoke test for scripts/merge-ticket.ts driven through its CLI with REAL git.
#
# Builds a throwaway repo layout, sets up several tickets with commits in their
# worktrees, then exercises the train end to end against real git:
#   - build:   stack two tickets' commits onto one fresh train worktree, with a
#              noop ticket (no commits) recorded as a noop, not cherry-picked.
#   - land:    fast-forward main to the train; every ticket's change is on main,
#              each ticket directory has moved merge-queue/ -> done/, and the train
#              + ticket worktrees and branches are gone.
#   - conflict: a ticket that edits the same line an already-landed ticket touched
#              is reported as a conflict (exit 2), not landed.
#   - discard: a built train is torn down, leaving the ticket worktree in place.
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-ticket.ts"
MERGE="$SCRIPT_DIR/merge-ticket.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-merge-ticket.XXXXXX")"
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

# State repo is a git repo so the land step's commit-to-done has somewhere to land.
git -C "$ROOT" init -q state
git -C "$ROOT/state" config user.email smoke@test
git -C "$ROOT/state" config user.name smoke
for q in "${QUEUES[@]}"; do
    mkdir -p "$ROOT/state/tickets/$q"
done
for id in feat-1 feat-2 noop-1 conflict-1 discard-1; do
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

for id in feat-1 feat-2 noop-1 conflict-1 discard-1; do
    run_setup "$id" > /dev/null || fail "setup $id failed"
done
wt_commit feat-1 a.txt "from feat-1"
wt_commit feat-2 b.txt "from feat-2"
wt_commit conflict-1 a.txt "from conflict-1"
wt_commit discard-1 d.txt "from discard-1"

# setup-ticket moved these to in-progress/; the merge stage acts on merge-queue/,
# so move the ones we will land into merge-queue/ via the real (committing) move,
# matching how an approved ticket reaches merge-queue/ in the live process.
for id in feat-1 feat-2 noop-1 conflict-1 discard-1; do
    run_move "$id" merge-queue > /dev/null || fail "move $id to merge-queue failed"
done

# ---- build: stack feat-1, feat-2 cleanly, noop-1 as a noop ----
BUILD_JSON="$(run_merge build feat-1 feat-2 noop-1)"
rc=$?
[[ "$rc" -eq 0 ]] || fail "build expected exit 0, got $rc"
echo "$BUILD_JSON" | grep -q '"status":"built"' || fail "build status not 'built': $BUILD_JSON"
echo "$BUILD_JSON" | grep -q '"noops":\["noop-1"\]' || fail "noop-1 not recorded as a noop: $BUILD_JSON"
TRAIN_ID="$(echo "$BUILD_JSON" | grep -o '"trainId":"[^"]*"' | head -1 | cut -d'"' -f4)"
[[ -n "$TRAIN_ID" ]] || fail "no trainId in build output"
[[ -d "$ROOT/project/worktrees/$TRAIN_ID" ]] || fail "train worktree not created"
[[ -f "$ROOT/project/worktrees/$TRAIN_ID/a.txt" ]] || fail "feat-1 change missing from train"
[[ -f "$ROOT/project/worktrees/$TRAIN_ID/b.txt" ]] || fail "feat-2 change missing from train"
# Both of the train worktree's link files must be RELATIVE (git worktree add
# --relative-paths, git >= 2.48) so it survives the repo being shared across
# machines (NFS) at different mount points: its own .git and the admin back-link.
grep -q '^gitdir: /' "$ROOT/project/worktrees/$TRAIN_ID/.git" \
    && fail "train .git is absolute: $(cat "$ROOT/project/worktrees/$TRAIN_ID/.git")"
grep -q '^/' "$ROOT/project/.git/worktrees/$TRAIN_ID/gitdir" \
    && fail "train admin gitdir is absolute: $(cat "$ROOT/project/.git/worktrees/$TRAIN_ID/gitdir")"
[[ ! -f "$ROOT/project/a.txt" ]] || fail "train leaked onto main before land"

# ---- land: ff main, move tickets to done/, tear everything down ----
run_merge land "$TRAIN_ID" feat-1 feat-2 noop-1 > /dev/null || fail "land failed"
[[ -f "$ROOT/project/a.txt" ]] || fail "feat-1 change not on main after land"
[[ -f "$ROOT/project/b.txt" ]] || fail "feat-2 change not on main after land"
for id in feat-1 feat-2 noop-1; do
    [[ -d "$ROOT/state/tickets/done/$id" ]] || fail "$id not moved to done/ after land"
    [[ ! -e "$ROOT/state/tickets/merge-queue/$id" ]] || fail "$id still in merge-queue/ after land"
done
# The done move was committed.
git -C "$ROOT/state" log --oneline | grep -q "land" || fail "land did not commit the done move"
[[ ! -e "$ROOT/project/worktrees/$TRAIN_ID" ]] || fail "train worktree not removed after land"
[[ ! -e "$ROOT/project/worktrees/feat-1" ]] || fail "feat-1 worktree not removed after land"
git -C "$ROOT/project" show-ref --verify --quiet "refs/heads/worktrees/$TRAIN_ID" \
    && fail "train branch not deleted after land"

# ---- conflict: conflict-1 edits a.txt, now on main via feat-1; report it ----
CONFLICT_JSON="$(run_merge build conflict-1 2>/dev/null)"
rc=$?
[[ "$rc" -eq 2 ]] || fail "build conflict-1 expected exit 2, got $rc"
echo "$CONFLICT_JSON" | grep -q '"status":"conflict"' || fail "conflict not reported: $CONFLICT_JSON"
echo "$CONFLICT_JSON" | grep -q '"ticket":"conflict-1"' || fail "wrong conflict ticket: $CONFLICT_JSON"
CONFLICT_TRAIN="$(echo "$CONFLICT_JSON" | grep -o '"trainId":"[^"]*"' | head -1 | cut -d'"' -f4)"
run_merge discard "$CONFLICT_TRAIN" > /dev/null 2>&1 || fail "discard of conflicted train failed"

# ---- discard: build a clean train, tear it down, ticket worktree survives ----
DBUILD="$(run_merge build discard-1)"
DTRAIN="$(echo "$DBUILD" | grep -o '"trainId":"[^"]*"' | head -1 | cut -d'"' -f4)"
[[ -d "$ROOT/project/worktrees/$DTRAIN" ]] || fail "discard-test train not created"
run_merge discard "$DTRAIN" > /dev/null || fail "discard failed"
[[ ! -e "$ROOT/project/worktrees/$DTRAIN" ]] || fail "train worktree not removed after discard"
[[ -d "$ROOT/project/worktrees/discard-1" ]] || fail "discard left ticket worktree should survive"
git -C "$ROOT/project" show-ref --verify --quiet refs/heads/worktrees/discard-1 \
    || fail "discard wrongly deleted the ticket branch"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
