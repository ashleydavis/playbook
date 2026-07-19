#!/usr/bin/env bash
# Smoke test for scripts/ticket-card.ts driven through its CLI.
#
# Builds a throwaway tickets/ fixture in a temp dir with one human-review ticket
# (detail.md, an evidence pass with results, and screenshots), runs the real CLI,
# and checks the rendered card carries the title, evidence pass, test results,
# screenshots, and the inspect menu, plus the missing-id error path. Cleans up
# and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CARD="$SCRIPT_DIR/ticket-card.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-ticket-card.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

TDIR="$FIXTURE/tickets/human-review/a-1"
mkdir -p "$TDIR/evidence/review-1"
mkdir -p "$TDIR/evidence/implementation-1/screenshots"

printf '# a-1: a title\n\n**ID:** a-1\n**Failures:** 0\n\nfirst ticket\n' > "$TDIR/index.md"
printf '# a-1: a real title\n\n## Test Plan\nUnit and e2e.\n\n## History\n- made\n' > "$TDIR/detail.md"
printf 'running\nEXIT=0\n' > "$TDIR/evidence/review-1/unit.txt"
printf 'png' > "$TDIR/evidence/implementation-1/screenshots/light.png"
printf 'png' > "$TDIR/evidence/implementation-1/screenshots/dark.png"

run_card() {
    ( cd "$FIXTURE" && bun "$CARD" "$@" )
}

output="$(run_card a-1)"
if [[ $? -ne 0 ]]; then
    fail "ticket-card exited non-zero on a valid ticket"
fi

grep -q 'a-1: a real title' <<<"$output" || fail "title missing in: $output"
grep -q 'Latest evidence pass:' <<<"$output" || fail "evidence pass missing in: $output"
grep -q 'unit: EXIT=0' <<<"$output" || fail "test result missing in: $output"
# The card prints a screenshot count and the directory, not the filenames.
grep -q 'Screenshots: 2' <<<"$output" || fail "screenshot count missing in: $output"
# This fixture has no project worktree, so the card must warn loudly rather than
# stay silent: the code under review cannot be run/launched from anywhere.
grep -q 'WARNING: no worktree found at project/worktrees/a-1' <<<"$output" || fail "missing-worktree warning missing in: $output"
grep -q 'Inspect menu:' <<<"$output" || fail "inspect menu missing in: $output"

# Error path: a missing id must exit non-zero.
if ( cd "$FIXTURE" && bun "$CARD" ) > /dev/null 2>&1; then
    fail "ticket-card should have exited non-zero with no id"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
