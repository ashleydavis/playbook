#!/usr/bin/env bash
# Smoke test for scripts/board-tickets.ts driven through its CLI.
#
# Builds a throwaway tickets/ fixture in a temp dir, runs the real CLI, and
# checks the JSON output (counts, the 10-ticket display cap, the truncated flag)
# and the error path, then cleans up and prints PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOARD="$SCRIPT_DIR/board-tickets.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-board-tickets.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

# Write a ticket directory: queue, id, optional description, optional deps.
make_ticket() {
    local queue="$1" id="$2" desc="${3:-}" deps="${4:-}"
    mkdir -p "$FIXTURE/tickets/$queue/$id"
    {
        printf '# %s: a title\n\n**ID:** %s\n' "$id" "$id"
        [[ -n "$deps" ]] && printf '**Depends on:** %s\n' "$deps"
        printf '**Failures:** 0\n\n%s\n' "$desc"
    } > "$FIXTURE/tickets/$queue/$id/index.md"
}

# One todo ticket with a description and a dependency.
make_ticket todo feat-2 "paginate results" feat-1

# Twelve human-review tickets so the queue trips the 5-ticket display cap.
for i in $(seq -w 1 12); do
    make_ticket human-review "auth-$i" "endpoint $i"
done

run_board() {
    ( cd "$FIXTURE" && bun "$BOARD" "$@" )
}

output="$(run_board)"
if [[ $? -ne 0 ]]; then
    fail "board-tickets exited non-zero on a valid tickets/"
fi

# todo: count 1, not truncated, description and dependency carried through.
if ! grep -q '"todo":{"count":1,"truncated":false' <<<"$output"; then
    fail "todo summary wrong in: $output"
fi
if ! grep -q '"description":"paginate results"' <<<"$output"; then
    fail "todo description missing in: $output"
fi
if ! grep -q '"dependsOn":\["feat-1"\]' <<<"$output"; then
    fail "todo dependsOn missing in: $output"
fi

# human-review: true count 12, truncated, but only 5 tickets displayed.
if ! grep -q '"human-review":{"count":12,"truncated":true' <<<"$output"; then
    fail "human-review summary wrong in: $output"
fi
# Read the JSON from a file (passed as argv), not stdin: a second `bun -e`
# reading fd 0 from a herestring is sensitive to bun version/platform and can
# return a stray trailing byte, so the count "5" would not string-compare equal.
printf '%s' "$output" > "$FIXTURE/board.json"
shown="$(bun -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))["human-review"].tickets.length)' "$FIXTURE/board.json")"
shown="${shown//[[:space:]]/}"
if [[ "$shown" != "5" ]]; then
    fail "human-review should display 5 tickets, displayed '$shown'"
fi

# Empty queues report count 0 and no tickets.
EMPTY="$(mktemp -d "${TMPDIR:-/tmp}/smoke-board-empty.XXXXXX")"
mkdir -p "$EMPTY/tickets"
empty_out="$( cd "$EMPTY" && bun "$BOARD" )"
if ! grep -q '"todo":{"count":0,"truncated":false,"tickets":\[\]}' <<<"$empty_out"; then
    fail "expected empty todo for empty queues, got $empty_out"
fi
rm -rf "$EMPTY"

# Error path: no tickets/ must exit non-zero.
NOWORK="$(mktemp -d "${TMPDIR:-/tmp}/smoke-board-nowork.XXXXXX")"
if ( cd "$NOWORK" && bun "$BOARD" ) > /dev/null 2>&1; then
    fail "board-tickets should have exited non-zero with no tickets/"
fi
rm -rf "$NOWORK"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
