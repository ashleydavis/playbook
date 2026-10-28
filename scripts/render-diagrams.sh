#!/usr/bin/env bash
#
# Render Mermaid diagram files to PNG images for the docs.
#
#   bash scripts/render-diagrams.sh <file.mmd> [<file.mmd> ...]
#
# Each <name>.mmd is rendered to <name>.png beside it, in Mermaid's dark theme on a dark
# background, because the docs that show them are designed to be viewed in dark mode.
#
# The images are committed so GitHub shows exactly what was rendered here: GitHub's own
# Mermaid lays diagrams out with a different engine and ignores their spacing settings.
#
# Needs Bun (for bunx). The first run downloads mermaid-cli and a headless Chrome.
#

set -euo pipefail

die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

if [ "$#" -eq 0 ]; then
    sed -n '3,5p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
fi

command -v bunx >/dev/null 2>&1 || die "bunx not found. Install Bun (https://bun.sh), then re-run."

#
# Chrome's sandbox needs unprivileged user namespaces, which Ubuntu 23.10 and later turn off,
# so the headless Chrome mermaid-cli starts would refuse to launch without --no-sandbox.
# It only ever loads the diagram file being rendered.
#
puppeteer_config="$(dirname "$0")/render-diagrams.puppeteer.json"

for source in "$@"; do
    case "$source" in
        *.mmd)
            ;;
        *)
            die "$source is not a .mmd file. Pass Mermaid diagram files ending in .mmd."
            ;;
    esac
    [ -f "$source" ] || die "$source does not exist."

    target="${source%.mmd}.png"

    #
    # Scale 2 keeps the text sharp when GitHub shrinks a wide diagram to the page width.
    #
    bunx @mermaid-js/mermaid-cli@12.0.0 \
        --puppeteerConfigFile "$puppeteer_config" \
        --theme dark \
        --backgroundColor '#0d1117' \
        --scale 2 \
        --input "$source" \
        --output "$target"

    [ -s "$target" ] || die "mermaid-cli reported success but wrote no image to $target."
    printf '  rendered %s\n' "$target"
done
