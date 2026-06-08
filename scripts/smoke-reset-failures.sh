#!/usr/bin/env bash
# Smoke test for scripts/reset-failures.ts driven through its CLI.
#
# Builds a throwaway state fixture with an item that already has failures, resets
# it with the real CLI, checks the count is 0 in index.md and printed, checks the
# unknown-id path exits non-zero, then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESET="$SCRIPT_DIR/reset-failures.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-reset.XXXXXX")"
QUEUES=(todo in-progress agent-review human-review merge-queue done blocked)

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

for q in "${QUEUES[@]}"; do
    mkdir -p "$FIXTURE/work-items/$q"
done
mkdir -p "$FIXTURE/work-items/human-review/demo-1"
printf '# demo-1\n\n**ID:** demo-1\n**Type:** Feature\n**Failures:** 2\n' \
    > "$FIXTURE/work-items/human-review/demo-1/index.md"

INDEX="$FIXTURE/work-items/human-review/demo-1/index.md"

# Make the state fixture a git repo so reset-failures.ts's auto-commit can run.
git -C "$FIXTURE" init -q
git -C "$FIXTURE" config user.email smoke@test
git -C "$FIXTURE" config user.name smoke
git -C "$FIXTURE" add -A
git -C "$FIXTURE" commit -qm "scaffold state repo"

run_reset() {
    ( cd "$FIXTURE" && bun "$RESET" "$@" )
}

out="$(run_reset demo-1)"
[[ "$out" == "0" ]] || fail "reset should print 0, got '$out'"
grep -q "^\*\*Failures:\*\* 0$" "$INDEX" || fail "index.md should record Failures: 0"
grep -q "^\*\*Failures:\*\* 2$" "$INDEX" && fail "old Failures: 2 should be gone"
# The reset auto-committed with the expected message.
reset_msg="$(git -C "$FIXTURE" log -1 --pretty=%s)"
[[ "$reset_msg" == "reset failures for demo-1" ]] \
    || fail "reset commit message wrong: '$reset_msg'"

if run_reset ghost-99 > /dev/null 2>&1; then
    fail "reset ghost-99 should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
