#!/usr/bin/env bash
# Smoke test for ticket priority ordering, set-priority.ts, and backlog/ isolation.
#
# Builds a throwaway state/tickets/ fixture, runs next-tickets.ts and
# board-tickets.ts, exercises set-priority and backlog promotion via move.ts.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXT="$SCRIPT_DIR/next-tickets.ts"
BOARD="$SCRIPT_DIR/board-tickets.ts"
SET_PRIORITY="$SCRIPT_DIR/set-priority.ts"
MOVE="$SCRIPT_DIR/move.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-ticket-priority.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

mkdir -p "$FIXTURE/tickets"/{todo,backlog,done,in-progress,merge-queue,agent-review,human-review,blocked,aborted}

make_ticket() {
    local queue="$1" id="$2" priority="$3"
    mkdir -p "$FIXTURE/tickets/$queue/$id"
    {
        printf '# %s\n\n**ID:** %s\n**Failures:** 0\n**Priority:** %s\n\n%s\n' \
            "$id" "$id" "$priority" "ticket $id"
    } > "$FIXTURE/tickets/$queue/$id/index.md"
}

# Non-alphabetic IDs at priorities 30, 10, 20, expect 10, 20, 30 order.
make_ticket todo zebra-1 30
make_ticket todo alpha-1 10
make_ticket todo mike-1 20

output="$( cd "$FIXTURE" && bun "$NEXT" )"
expected_todo='["alpha-1","mike-1","zebra-1"]'
if [[ "$output" != *"\"todo\":$expected_todo"* ]]; then
    fail "expected todo order $expected_todo in $output"
fi

# Change zebra-1 to priority 5 and re-run.
( cd "$FIXTURE" && bun "$SET_PRIORITY" zebra-1 5 ) > /dev/null
output="$( cd "$FIXTURE" && bun "$NEXT" )"
if [[ "$output" != *"\"todo\":[\"zebra-1\",\"alpha-1\",\"mike-1\"]"* ]]; then
    fail "expected zebra-1 first after priority change, got $output"
fi

# Backlog ticket must not appear in next-tickets todo.
make_ticket backlog later-9 1
output="$( cd "$FIXTURE" && bun "$NEXT" )"
if [[ "$output" == *"later-9"* ]]; then
    fail "backlog ticket later-9 should not appear in next-tickets output"
fi

# Promote to todo and confirm it appears.
( cd "$FIXTURE" && bun "$MOVE" later-9 todo ) > /dev/null
output="$( cd "$FIXTURE" && bun "$NEXT" )"
if [[ "$output" != *"later-9"* ]]; then
    fail "promoted backlog ticket later-9 should appear in next-tickets output"
fi

# board-tickets must include backlog key with priority.
board="$( cd "$FIXTURE" && bun "$BOARD" )"
if [[ "$board" != *'"backlog"'* ]]; then
    fail "board JSON missing backlog key"
fi
if [[ "$board" != *'"priority":1'* ]]; then
    fail "board JSON missing priority field on backlog ticket"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
