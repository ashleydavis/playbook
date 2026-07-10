#!/usr/bin/env bash
# Smoke test for scripts/next-id.ts driven through its CLI.
#
# Builds a throwaway tickets/ fixture spanning several queues (including done/),
# runs the real CLI, and checks ID allocation and the --check guard, then cleans
# up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXT_ID="$SCRIPT_DIR/next-id.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-id.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

# An empty ticket directory in a queue is all the ID scan needs.
make_ticket() {
    local queue="$1" id="$2"
    mkdir -p "$FIXTURE/tickets/$queue/$id"
}

# Fixture: a feature whose earlier tickets already reached done/, plus live work
# spread across queues, plus a Debug ID that must not feed the ordinary sequence.
#   done:        live-logs-1, live-logs-2, performance-tabs-1..3, search-d1
#   in-progress: live-logs-4
#   todo:        performance-tabs-5
make_ticket done live-logs-1
make_ticket done live-logs-2
make_ticket in-progress live-logs-4
make_ticket done performance-tabs-1
make_ticket done performance-tabs-2
make_ticket done performance-tabs-3
make_ticket todo performance-tabs-5
make_ticket done search-d1

run() {
    ( cd "$FIXTURE" && bun "$NEXT_ID" "$@" )
}

# Next ordinary ID scans every queue: highest live-logs is 4 (in-progress) -> 5.
out="$(run live-logs)"
[[ "$out" == "live-logs-5" ]] || fail "expected live-logs-5, got '$out'"

# Highest performance-tabs is 5 (in todo) -> 6, even though done/ holds 1..3.
out="$(run performance-tabs)"
[[ "$out" == "performance-tabs-6" ]] || fail "expected performance-tabs-6, got '$out'"

# A brand-new prefix starts at 1.
out="$(run brand-new)"
[[ "$out" == "brand-new-1" ]] || fail "expected brand-new-1, got '$out'"

# Debug tag is its own sequence: search-d1 exists -> search-d2. The ordinary
# search sequence is untouched by the Debug ID.
out="$(run search --debug)"
[[ "$out" == "search-d2" ]] || fail "expected search-d2, got '$out'"
out="$(run search)"
[[ "$out" == "search-1" ]] || fail "expected search-1 (ordinary), got '$out'"

# --check: a free ID exits 0 and prints "free".
if out="$(run --check live-logs-9)"; then
    [[ "$out" == "free" ]] || fail "expected 'free', got '$out'"
else
    fail "--check on a free ID should exit 0"
fi

# --check: a taken ID exits non-zero and names the queue.
if out="$(run --check live-logs-1)" 2>/dev/null; then
    fail "--check on a taken ID should exit non-zero"
else
    [[ "$out" == "taken: done" ]] || fail "expected 'taken: done', got '$out'"
fi

# Usage error: no arguments exits non-zero.
if ( cd "$FIXTURE" && bun "$NEXT_ID" ) > /dev/null 2>&1; then
    fail "next-id with no arguments should exit non-zero"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
