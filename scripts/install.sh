#!/usr/bin/env bash
#
# Install the playbook into this machine's Claude Code setup.
#
# One-time, per-machine. Wires the playbook into the three places Claude Code
# reads from a fixed location: the global instruction file, the commands
# directory, and the global settings file. Idempotent and safe to re-run.
#
# This is NOT the per-project bootstrap. Once this has run, scaffold an
# individual project with the /bootstrap:new or /bootstrap:existing skill.
#
# Usage: bash ~/playbook/scripts/install.sh

set -euo pipefail

# Resolve the playbook root from this script's location, so it works whatever
# the clone is named or wherever it lives.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYBOOK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"

info()  { printf '  %s\n' "$1"; }
warn()  { printf 'WARN: %s\n' "$1" >&2; }

# link <target> <link-path>: create or refresh a symlink, never clobbering a
# real file or a foreign symlink.
link() {
  local target="$1" link_path="$2"
  if [ -L "$link_path" ]; then
    if [ "$(readlink "$link_path")" = "$target" ]; then
      info "ok    $link_path -> $target"
      return
    fi
    warn "$link_path is a symlink to a different target ($(readlink "$link_path")); leaving it alone."
    return
  fi
  if [ -e "$link_path" ]; then
    warn "$link_path already exists and is not our symlink; leaving it alone."
    return
  fi
  ln -s "$target" "$link_path"
  info "link  $link_path -> $target"
}

echo "Installing playbook from $PLAYBOOK_DIR"

# --- Prerequisites --------------------------------------------------------
echo "Checking prerequisites:"
missing=0
for cmd in git bun claude; do
  if command -v "$cmd" >/dev/null 2>&1; then
    info "ok    $cmd"
  else
    warn "$cmd not found on PATH."
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  warn "Install the missing prerequisites before running the process (bun runs scripts/move.ts)."
fi

mkdir -p "$COMMANDS_DIR"

# --- Global instructions --------------------------------------------------
# ~/.claude/CLAUDE.md is loaded at the start of every session, in every
# directory. Point it at PLAYBOOK-CLAUDE.md so the machine knows the process.
echo "Wiring global instructions:"
if [ -e "$CLAUDE_DIR/CLAUDE.md" ] && [ ! -L "$CLAUDE_DIR/CLAUDE.md" ]; then
  warn "$CLAUDE_DIR/CLAUDE.md already exists (your personal global instructions)."
  warn "Not overwriting it. To load the process, add this line to it by hand:"
  warn "    @$PLAYBOOK_DIR/process.md"
else
  link "$PLAYBOOK_DIR/config/PLAYBOOK-CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
fi

# --- Skills (slash commands) ----------------------------------------------
# Plain .md files under ~/.claude/commands/ become slash commands, namespaced
# by subdirectory with colons: commands/pb/next.md -> /pb:next, and
# commands/pb/bootstrap/new.md -> /pb:bootstrap:new. One symlink at
# commands/pb covers the whole skill set.
echo "Wiring skills:"
link "$PLAYBOOK_DIR/skills/pb" "$COMMANDS_DIR/pb"

# --- Settings (permissions) -----------------------------------------------
# ~/.claude/settings.json is the global settings file. Point it at the
# playbook's settings.json so the machine runs with permission prompts off
# (bypassPermissions). Only do this inside the sandbox VM.
echo "Wiring settings:"
link "$PLAYBOOK_DIR/config/settings.json" "$CLAUDE_DIR/settings.json"

echo "Done."
echo "Next: start Claude Code (in the VM) and run /pb:bootstrap:new or"
echo "/pb:bootstrap:existing to scaffold a project."
