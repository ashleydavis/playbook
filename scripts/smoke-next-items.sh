#!/usr/bin/env bash
# Smoke test for scripts/next-items.ts driven through its CLI.
#
# Builds a throwaway work-items/ fixture in a temp dir, runs the real CLI, and
# checks the JSON output and the error path, then cleans up and prints
# PASS or FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXT="$SCRIPT_DIR/next-items.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-items.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

# Write an item directory: queue, id, optional "Depends on" value.
make_item() {
    local queue="$1" id="$2" deps="${3:-}"
    mkdir -p "$FIXTURE/work-items/$queue/$id"
    {
        printf '# %s\n\n**ID:** %s\n' "$id" "$id"
        [[ -n "$deps" ]] && printf '**Depends on:** %s\n' "$deps"
    } > "$FIXTURE/work-items/$queue/$id/index.md"
}

# Build a fixture spanning all four reported queues.
#   merge-queue: auth-5
#   todo: auth-1 (ready), auth-2 (dep auth-1 in todo -> blocked), auth-3 (dep
#         auth-9 not in todo -> ready), search-1 (ready)
#   in-progress: infra-2
#   agent-review: search-4, search-5
make_item merge-queue auth-5
make_item todo auth-1
make_item todo auth-2 auth-1
make_item todo auth-3 auth-9
make_item todo search-1
make_item in-progress infra-2
make_item agent-review search-4
make_item agent-review search-5

# Run the CLI with the fixture as the current working directory.
run_next() {
    ( cd "$FIXTURE" && bun "$NEXT" "$@" )
}

# Happy path: the full per-queue report.
output="$(run_next)"
if [[ $? -ne 0 ]]; then
    fail "next-items exited non-zero on a valid work-items/"
fi
expected='{"merge-queue":["auth-5"],"todo":["auth-1","auth-3","search-1"],"in-progress":["infra-2"],"agent-review":["search-4","search-5"]}'
if [[ "$output" != "$expected" ]]; then
    fail "expected $expected, got $output"
fi

# Empty queues yield empty arrays for every key.
EMPTY="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-empty.XXXXXX")"
mkdir -p "$EMPTY/work-items"
empty_out="$( cd "$EMPTY" && bun "$NEXT" )"
empty_expected='{"merge-queue":[],"todo":[],"in-progress":[],"agent-review":[]}'
if [[ "$empty_out" != "$empty_expected" ]]; then
    fail "expected $empty_expected for empty queues, got $empty_out"
fi
rm -rf "$EMPTY"

# Error path: no work-items/ must exit non-zero.
NOWORK="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-nowork.XXXXXX")"
if ( cd "$NOWORK" && bun "$NEXT" ) > /dev/null 2>&1; then
    fail "next-items should have exited non-zero with no work-items/"
fi
rm -rf "$NOWORK"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
