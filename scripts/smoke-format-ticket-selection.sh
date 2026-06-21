#!/usr/bin/env bash
# Smoke test for scripts/format-ticket-selection.ts

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FMT="$SCRIPT_DIR/format-ticket-selection.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-format-ticket-selection.XXXXXX")"

failures=0
fail() {
    echo "  FAIL: $1"
    failures=$((failures + 1))
}

cleanup() {
    rm -rf "$FIXTURE"
}
trap cleanup EXIT

make_ticket() {
    local queue="$1" id="$2" desc="${3:-}" failures="${4:-0}" priority="${5:-}"
    mkdir -p "$FIXTURE/tickets/$queue/$id"
    {
        printf '# %s: a title\n\n**ID:** %s\n' "$id" "$id"
        [[ -n "$priority" ]] && printf '**Priority:** %s\n' "$priority"
        printf '**Failures:** %s\n\n%s\n' "$failures" "$desc"
    } > "$FIXTURE/tickets/$queue/$id/index.md"
}

make_ticket blocked blocked-1 "blocked ticket one" 3
make_ticket blocked blocked-2 "blocked ticket two" 3
make_ticket todo todo-1 "todo ticket" 0 10

PROMPT='Which to unblock? (number, several numbers, ticket ID, or "all")'
menu="$( cd "$FIXTURE" && bun "$FMT" --mode pick-many --queue blocked --fields failures --prompt "$PROMPT" )"
if [[ $? -ne 0 ]]; then
    fail "format-ticket-selection exited non-zero for blocked menu"
fi
if ! grep -q '1\. blocked-1' <<<"$menu"; then
    fail "menu missing numbered ticket: $menu"
fi
if ! grep -q 'failures: 3' <<<"$menu"; then
    fail "menu missing failures field: $menu"
fi
if ! grep -q "$PROMPT" <<<"$menu"; then
    fail "menu missing prompt line: $menu"
fi

multi="$( cd "$FIXTURE" && bun "$FMT" --mode pick-many --queue blocked --queue todo --fields priority --prompt 'Pick' )"
if ! grep -q '3\. todo-1' <<<"$multi"; then
    fail "ticket in second section should be numbered 3 globally: $multi"
fi

STATE="$(mktemp "${TMPDIR:-/tmp}/smoke-fmt-state.XXXXXX.json")"
cat > "$STATE" <<'EOF'
{"mode":"pick-many","tickets":[{"id":"blocked-1","description":"one"},{"id":"blocked-2","description":"two"},{"id":"todo-1","description":"three"}]}
EOF

resolved="$( cd "$FIXTURE" && bun "$FMT" --resolve "1, 3" --state "$STATE" )"
if ! grep -q '"blocked-1"' <<<"$resolved"; then
    fail "--resolve missing blocked-1: $resolved"
fi
if ! grep -q '"todo-1"' <<<"$resolved"; then
    fail "--resolve missing todo-1: $resolved"
fi
rm -f "$STATE"

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
