#!/usr/bin/env bash
# Smoke test for scripts/start-review.ts + the review-render path of
# format-ticket-selection.ts (the pb:review review-snapshot lifecycle), plus
# ticket-card.ts (the per-ticket card the review loop prints). Both scripts use
# the snapshot's fixed default location in the cwd; no path is ever passed.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START="$SCRIPT_DIR/start-review.ts"
FMT="$SCRIPT_DIR/format-ticket-selection.ts"
CARD="$SCRIPT_DIR/ticket-card.ts"

FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/smoke-start-review.XXXXXX")"
# The default location start-review.ts writes to, relative to the cwd it runs in.
SNAPSHOT="$FIXTURE/.pb-review-snapshot.json"
PROMPT='Which ticket do you want to review? (number, ticket ID, or stop)'

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
    local id="$1" desc="$2" priority="$3"
    local tdir="$FIXTURE/tickets/human-review/$id"
    mkdir -p "$tdir"
    printf '# %s: a title\n\n**ID:** %s\n**Priority:** %s\n**Failures:** 0\n\n%s\n' \
        "$id" "$id" "$priority" "$desc" > "$tdir/index.md"
    printf '# %s\n\n## Test Plan\nUnit.\n\n## History\n- made\n' "$id" > "$tdir/detail.md"
}

make_ticket alpha-1 "first ticket" 10
make_ticket beta-1 "second ticket" 50

# --- start the session (build the review snapshot at the default location) ----
start_out="$( cd "$FIXTURE" && bun "$START" 2>/dev/null )"
if [[ ! -f "$SNAPSHOT" ]]; then
    fail "start-review did not create the review snapshot"
fi
if grep -qF "$SNAPSHOT" <<<"$start_out"; then
    fail "start-review printed the snapshot path (it must not): $start_out"
fi
if grep -q '\[ \]' <<<"$start_out"; then
    fail "start-review printed a checklist (it should only confirm the build): $start_out"
fi
if ! grep -q '"updatedAt"' "$SNAPSHOT"; then
    fail "review snapshot has no updatedAt timestamp"
fi

# --- print a ticket's card on demand (ticket-card.ts, not the snapshot) -------
card_out="$( cd "$FIXTURE" && bun "$CARD" alpha-1 2>/dev/null )"
if ! grep -q 'Inspect menu:' <<<"$card_out"; then
    fail "card output missing the inspect menu: $card_out"
fi
if ! grep -q 'alpha-1' <<<"$card_out"; then
    fail "card output missing the ticket title: $card_out"
fi
card_usage="$( cd "$FIXTURE" && bun "$CARD" 2>&1 >/dev/null )"
if ! grep -qi 'usage' <<<"$card_usage"; then
    fail "ticket-card with no id should print usage: $card_usage"
fi

# --- render the initial checklist (the single render path) --------------------
first_out="$( cd "$FIXTURE" && bun "$FMT" --mode pick-one-loop --queue human-review \
    --prompt "$PROMPT" 2>/dev/null )"
if ! grep -q '\[ \] 1\. alpha-1' <<<"$first_out"; then
    fail "initial render missing alpha-1 as item 1 (priority order): $first_out"
fi

# --- mark alpha-1 approved, then make it leave the live queue -----------------
mark_out="$( cd "$FIXTURE" && bun "$FMT" --mode pick-one-loop --queue human-review \
    --mark alpha-1 --outcome approved --prompt "$PROMPT" 2>/dev/null )"
if ! grep -q '\[x\] 1\. alpha-1.*(approved)' <<<"$mark_out"; then
    fail "marked ticket not shown checked with outcome: $mark_out"
fi
if ! grep -q 'Review (1 of 2 done)' <<<"$mark_out"; then
    fail "progress header wrong after mark: $mark_out"
fi

# alpha-1 leaves human-review (as an approval would move it).
rm -rf "$FIXTURE/tickets/human-review/alpha-1"
gone_out="$( cd "$FIXTURE" && bun "$FMT" --mode pick-one-loop --queue human-review \
    --prompt "$PROMPT" 2>/dev/null )"
if ! grep -q '\[x\] 1\. alpha-1.*(approved)' <<<"$gone_out"; then
    fail "resolved ticket vanished after leaving the queue (the original bug): $gone_out"
fi
if ! grep -q '\[ \] 2\. beta-1' <<<"$gone_out"; then
    fail "remaining ticket lost its fixed number: $gone_out"
fi

# --- staleness: an old stamp forces a rebuild from the live queue -------------
# Backdate the stamp well past the threshold and rebuild with a 1s max age.
python3 - "$SNAPSHOT" <<'PY' 2>/dev/null || sed -i 's/"updatedAt": "[^"]*"/"updatedAt": "2000-01-01T00:00:00.000Z"/' "$SNAPSHOT"
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["updatedAt"] = "2000-01-01T00:00:00.000Z"
json.dump(d, open(p, "w"))
PY
stale_err="$( cd "$FIXTURE" && bun "$FMT" --mode pick-one-loop --queue human-review \
    --max-age 1 --prompt "$PROMPT" 2>&1 >/dev/null )"
if ! grep -qi 'stale' <<<"$stale_err"; then
    fail "stale snapshot was not rebuilt (no notice): $stale_err"
fi
stale_out="$( cd "$FIXTURE" && bun "$FMT" --mode pick-one-loop --queue human-review \
    --max-age 999999 --prompt "$PROMPT" 2>/dev/null )"
# After the rebuild the queue holds only beta-1, and the stale (approved) row is gone.
if grep -q 'alpha-1' <<<"$stale_out"; then
    fail "rebuilt snapshot still carries the departed alpha-1: $stale_out"
fi
if ! grep -q '\[ \] 1\. beta-1' <<<"$stale_out"; then
    fail "rebuilt snapshot missing the live beta-1: $stale_out"
fi

if [[ "$failures" -eq 0 ]]; then
    echo "PASS"
    exit 0
else
    echo "FAIL ($failures check(s) failed)"
    exit 1
fi
