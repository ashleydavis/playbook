#!/usr/bin/env bash
# Smoke test for scripts/fail-ticket.ts driven through its CLI.
#
# Builds a throwaway state fixture, increments a ticket's failure count twice with
# the real CLI, checks the count is written to index.md and printed, checks the
# error paths exit non-zero, then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAIL="$SCRIPT_DIR/fail-ticket.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-fail.XXXXXX")"
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

# Build the fixture: empty queues plus demo-1 in agent-review/ with an index.md.
for q in "${QUEUES[@]}"; do
    mkdir -p "$FIXTURE/tickets/$q"
done
mkdir -p "$FIXTURE/tickets/agent-review/demo-1"
printf '# demo-1\n\n**ID:** demo-1\n**Type:** Fix\n' \
    > "$FIXTURE/tickets/agent-review/demo-1/index.md"

INDEX="$FIXTURE/tickets/agent-review/demo-1/index.md"

# Make the state fixture a git repo so fail-ticket.ts's auto-commit can run.
git -C "$FIXTURE" init -q
git -C "$FIXTURE" config user.email smoke@test
git -C "$FIXTURE" config user.name smoke
git -C "$FIXTURE" add -A
git -C "$FIXTURE" commit -qm "scaffold state repo"

run_fail() {
    ( cd "$FIXTURE" && bun "$FAIL" "$@" )
}

# First failure: prints 1, writes the field.
out="$(run_fail demo-1)"
[[ "$out" == "1" ]] || fail "first failure should print 1, got '$out'"
grep -q "^\*\*Failures:\*\* 1$" "$INDEX" || fail "index.md should record Failures: 1"
# The failure auto-committed with the expected message and count.
fail_msg="$(git -C "$FIXTURE" log -1 --pretty=%s)"
[[ "$fail_msg" == "record failure for demo-1 (count 1)" ]] \
    || fail "failure commit message wrong: '$fail_msg'"

# Second failure: prints 2, increments in place.
out="$(run_fail demo-1)"
[[ "$out" == "2" ]] || fail "second failure should print 2, got '$out'"
grep -q "^\*\*Failures:\*\* 2$" "$INDEX" || fail "index.md should record Failures: 2"
grep -q "^\*\*Failures:\*\* 1$" "$INDEX" && fail "old Failures: 1 should be gone"

# Error path: unknown id must exit non-zero.
if run_fail ghost-99 > /dev/null 2>&1; then
    fail "fail ghost-99 should have exited non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
