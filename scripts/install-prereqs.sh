#!/usr/bin/env bash
#
# Install the prerequisites the playbook needs: git, bun, and Claude Code.
#
# Intended for a fresh Ubuntu/Debian VM (Multipass or equivalent). Idempotent:
# anything already present is left alone. Run this after cloning the playbook
# (cloning needs git, which is usually already on the image), then launch
# Claude Code from the clone root.
#
# Usage: bash scripts/install-prereqs.sh

set -euo pipefail

info() { printf '  %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "Installing prerequisites:"

# --- git (plus curl/unzip, which the bun installer needs) ------------------
if have apt-get; then
  need=()
  for pkg in git curl unzip; do
    have "$pkg" || need+=("$pkg")
  done
  if [ "${#need[@]}" -gt 0 ]; then
    info "apt-get install: ${need[*]}"
    apt-get update -y
    apt-get install -y "${need[@]}"
  else
    info "ok    git, curl, unzip"
  fi
else
  warn "apt-get not found; install git, curl, and unzip with your package manager."
fi

# --- bun ------------------------------------------------------------------
if have bun; then
  info "ok    bun"
else
  info "installing bun"
  curl -fsSL https://bun.sh/install | bash
  # bun installs to ~/.bun/bin; surface it for the check below.
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# --- Claude Code ----------------------------------------------------------
# Native installer. (Alternatively: npm install -g @anthropic-ai/claude-code.)
if have claude; then
  info "ok    claude"
else
  info "installing Claude Code"
  curl -fsSL https://claude.ai/install.sh | bash
fi

echo "Done."
echo "Open a new shell so PATH picks up bun and claude, then launch Claude"
echo "Code from the clone root."
