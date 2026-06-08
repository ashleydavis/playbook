#!/usr/bin/env bash
# Smoke test for scripts/move.ts driven through its CLI.
#
# Builds a throwaway state fixture in a temp dir, walks a work item
# through the queues with the real CLI, checks the error paths exit non-zero,
# then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOVE="$SCRIPT_DIR/move.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-move.XXXXXX")"
QUEUES=(todo in-progress agent-review human-review merge-queue done)

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

# Build the fixture: six empty queues plus demo-1 in todo/ with contents.
for q in "${QUEUES[@]}"; do
    mkdir -p "$FIXTURE/work-items/$q"
done
mkdir -p "$FIXTURE/work-items/todo/demo-1/evidence"
echo "# demo-1" > "$FIXTURE/work-items/todo/demo-1/index.md"
echo "pass" > "$FIXTURE/work-items/todo/demo-1/evidence/unit.txt"

# Make the state fixture a git repo so move.ts's auto-commit can run, and seed an
# initial commit so the moves produce their own commits on top.
git -C "$FIXTURE" init -q
git -C "$FIXTURE" config user.email smoke@test
git -C "$FIXTURE" config user.name smoke
git -C "$FIXTURE" add -A
git -C "$FIXTURE" commit -qm "scaffold state repo"

# Assert demo-1 (and its evidence) lives only under the given queue.
assert_only_in() {
    local queue="$1"
    for q in "${QUEUES[@]}"; do
        if [[ "$q" == "$queue" ]]; then
            [[ -d "$FIXTURE/work-items/$q/demo-1" ]] || fail "demo-1 missing from $q"
            [[ -f "$FIXTURE/work-items/$q/demo-1/evidence/unit.txt" ]] \
                || fail "demo-1 evidence missing from $q"
        else
            [[ ! -e "$FIXTURE/work-items/$q/demo-1" ]] \
                || fail "demo-1 unexpectedly present in $q"
        fi
    done
}

# Run the CLI with the fixture as the current working directory.
run_move() {
    ( cd "$FIXTURE" && bun "$MOVE" "$@" )
}

# Happy path: walk demo-1 through three queues.
for target in in-progress agent-review human-review; do
    if run_move demo-1 "$target" > /dev/null; then
        assert_only_in "$target"
    else
        fail "move demo-1 $target exited non-zero"
    fi
done

# Each move auto-committed: the latest commit names the last transition and its
# diff is scoped to the item's from/to paths (and nothing else).
last_msg="$(git -C "$FIXTURE" log -1 --pretty=%s)"
[[ "$last_msg" == "move demo-1 agent-review -> human-review" ]] \
    || fail "last commit message wrong: '$last_msg'"
changed="$(git -C "$FIXTURE" show --name-only --pretty=format: HEAD | grep -v '^$')"
echo "$changed" | grep -q "work-items/human-review/demo-1/" \
    || fail "move commit did not touch the new path"
echo "$changed" | grep -vq "demo-1" \
    && fail "move commit touched a path outside demo-1 (not item-scoped)"

# Error path: invalid queue must exit non-zero.
if run_move demo-1 not-a-queue > /dev/null 2>&1; then
    fail "move demo-1 not-a-queue should have exited non-zero"
fi

# Error path: unknown id must exit non-zero.
if run_move ghost-99 todo > /dev/null 2>&1; then
    fail "move ghost-99 todo should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
