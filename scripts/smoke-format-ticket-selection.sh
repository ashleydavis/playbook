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
    local queue="$1" id="$2" desc="${3:-}" priority="${4:-}"
    mkdir -p "$FIXTURE/tickets/$queue/$id"
    {
        printf '# %s: a title\n\n**ID:** %s\n' "$id" "$id"
        [[ -n "$priority" ]] && printf '**Priority:** %s\n' "$priority"
        printf '\n%s\n' "$desc"
    } > "$FIXTURE/tickets/$queue/$id/index.md"
}

make_ticket backlog backlog-1 "backlog ticket one" 30
make_ticket backlog backlog-2 "backlog ticket two" 30
make_ticket todo todo-1 "todo ticket" 10

PROMPT='Which to promote? (number, several numbers, ticket ID, or "all")'
menu="$( cd "$FIXTURE" && bun "$FMT" --mode pick-many --queue backlog --fields priority --prompt "$PROMPT" )"
if [[ $? -ne 0 ]]; then
    fail "format-ticket-selection exited non-zero for backlog menu"
fi
if ! grep -q '1\. backlog-1' <<<"$menu"; then
    fail "menu missing numbered ticket: $menu"
fi
if ! grep -q 'priority: 30' <<<"$menu"; then
    fail "menu missing priority field: $menu"
fi
if ! grep -q "$PROMPT" <<<"$menu"; then
    fail "menu missing prompt line: $menu"
fi

multi="$( cd "$FIXTURE" && bun "$FMT" --mode pick-many --queue backlog --queue todo --fields priority --prompt 'Pick' )"
if ! grep -q '3\. todo-1' <<<"$multi"; then
    fail "ticket in second section should be numbered 3 globally: $multi"
fi

STATE="$(mktemp "${TMPDIR:-/tmp}/smoke-fmt-state.XXXXXX.json")"
cat > "$STATE" <<'EOF'
{"mode":"pick-many","tickets":[{"id":"backlog-1","description":"one"},{"id":"backlog-2","description":"two"},{"id":"todo-1","description":"three"}]}
EOF

resolved="$( cd "$FIXTURE" && bun "$FMT" --resolve "1, 3" --state "$STATE" )"
if ! grep -q '"backlog-1"' <<<"$resolved"; then
    fail "--resolve missing backlog-1: $resolved"
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
