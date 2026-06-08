#!/usr/bin/env bash
# Smoke test for scripts/commit-state.ts driven through its CLI with REAL git.
#
# Builds a throwaway git-backed state repo with a work-items/ dir, then checks:
#   - a commit with an explicit pathspec succeeds and touches only that path,
#   - a second run with no changes reports the nothing-staged skip (exit 0, no
#     new commit),
#   - running in a non-git directory reports the not-a-repo skip without a hard
#     failure (exit 0).
# Then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT="$SCRIPT_DIR/commit-state.ts"

ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smoke-commit.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$ROOT"
}
trap cleanup EXIT

# Build a git-backed state repo with two item dirs in todo/.
STATE="$ROOT/state"
mkdir -p "$STATE/work-items/todo/demo-1" "$STATE/work-items/todo/demo-2"
echo "# demo-1" > "$STATE/work-items/todo/demo-1/index.md"
echo "# demo-2" > "$STATE/work-items/todo/demo-2/index.md"
git -C "$STATE" init -q
git -C "$STATE" config user.email smoke@test
git -C "$STATE" config user.name smoke
git -C "$STATE" add -A
git -C "$STATE" commit -qm "scaffold state repo"

run_commit() {
    ( cd "$STATE" && bun "$COMMIT" "$@" )
}

# Item-scoped commit: change only demo-1, commit only its path.
echo "changed" >> "$STATE/work-items/todo/demo-1/index.md"
echo "also changed" >> "$STATE/work-items/todo/demo-2/index.md"
if run_commit "touch demo-1" work-items/todo/demo-1 > /dev/null; then
    msg="$(git -C "$STATE" log -1 --pretty=%s)"
    [[ "$msg" == "touch demo-1" ]] || fail "commit message wrong: '$msg'"
    files="$(git -C "$STATE" show --name-only --pretty=format: HEAD | grep -v '^$')"
    echo "$files" | grep -q "work-items/todo/demo-1/index.md" \
        || fail "commit did not touch demo-1"
    echo "$files" | grep -q "demo-2" \
        && fail "commit unexpectedly touched demo-2 (not item-scoped)"
else
    fail "commit-state touch demo-1 exited non-zero"
fi

# Nothing staged: committing demo-1 again (no further change to it) is a skip.
before="$(git -C "$STATE" rev-parse HEAD)"
out="$(run_commit "touch demo-1 again" work-items/todo/demo-1 2>&1)"
rc=$?
[[ $rc -eq 0 ]] || fail "nothing-staged run should exit 0, got $rc"
echo "$out" | grep -qi "nothing to commit" || fail "nothing-staged skip not reported"
after="$(git -C "$STATE" rev-parse HEAD)"
[[ "$before" == "$after" ]] || fail "nothing-staged run created a commit"

# Not a git repo: skip with a warning, no hard failure.
NONGIT="$ROOT/nongit"
mkdir -p "$NONGIT/work-items/todo"
echo x > "$NONGIT/work-items/todo/file.md"
out="$( ( cd "$NONGIT" && bun "$COMMIT" "msg" work-items/todo ) 2>&1 )"
rc=$?
[[ $rc -eq 0 ]] || fail "not-a-repo run should exit 0 (soft skip), got $rc"
echo "$out" | grep -qi "not a git repo" || fail "not-a-repo skip not reported"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
