#!/usr/bin/env bash
# Smoke test for scripts/next-items.ts driven through its CLI.
#
# Builds a throwaway todo/ fixture in a temp dir, runs the real CLI, and
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

# Build a todo/ with three items:
#   feat-1: no dependencies            -> ready
#   feat-2: depends on feat-1 (in todo)-> blocked
#   feat-3: depends on gone-9 (not in todo, assumed actioned) -> ready
mkdir -p "$FIXTURE/work-items/todo/feat-1"
printf '# feat-1\n\n**ID:** feat-1\n' > "$FIXTURE/work-items/todo/feat-1/index.md"
mkdir -p "$FIXTURE/work-items/todo/feat-2"
printf '# feat-2\n\n**ID:** feat-2\n**Depends on:** feat-1\n' > "$FIXTURE/work-items/todo/feat-2/index.md"
mkdir -p "$FIXTURE/work-items/todo/feat-3"
printf '# feat-3\n\n**ID:** feat-3\n**Depends on:** gone-9\n' > "$FIXTURE/work-items/todo/feat-3/index.md"

# Run the CLI with the fixture as the current working directory.
run_next() {
    ( cd "$FIXTURE" && bun "$NEXT" "$@" )
}

# Happy path: feat-1 and feat-3 are ready, feat-2 is blocked.
output="$(run_next)"
if [[ $? -ne 0 ]]; then
    fail "next-items exited non-zero on a valid todo/"
fi
expected='["feat-1","feat-3"]'
if [[ "$output" != "$expected" ]]; then
    fail "expected $expected, got $output"
fi

# Empty todo/ yields an empty JSON array.
EMPTY="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-empty.XXXXXX")"
mkdir -p "$EMPTY/work-items/todo"
empty_out="$( cd "$EMPTY" && bun "$NEXT" )"
if [[ "$empty_out" != "[]" ]]; then
    fail "expected [] for an empty todo/, got $empty_out"
fi
rm -rf "$EMPTY"

# Error path: no work-items/todo/ must exit non-zero.
NOTODO="$(mktemp -d "${TMPDIR:-/tmp}/smoke-next-notodo.XXXXXX")"
if ( cd "$NOTODO" && bun "$NEXT" ) > /dev/null 2>&1; then
    fail "next-items should have exited non-zero with no work-items/todo/"
fi
rm -rf "$NOTODO"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
