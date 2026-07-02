#!/usr/bin/env bash
#
# Install the prerequisites the playbook needs: git, bun, and Claude Code.
#
# Intended for a fresh Ubuntu/Debian VM (Multipass or equivalent). Idempotent:
# anything already present (and new enough) is left alone. Run this after cloning
# the playbook (cloning needs git, which is usually already on the image), then
# launch Claude Code from the clone root.
#
# git must be >= MIN_GIT (2.48), the first release with native relative-path
# worktrees (git worktree add --relative-paths). The playbook's worktree tooling
# relies on it and refuses to run against older git, so this installs the latest
# git from the git-core PPA when the distro's own git is too old.
#
# Usage: bash scripts/install-prereqs.sh

set -euo pipefail

# Minimum git the playbook's worktree tooling requires. Keep in sync with
# MIN_GIT_VERSION in scripts/lib/git-version.ts.
MIN_GIT="2.48.0"

info() { printf '  %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# True when the installed git is at least $MIN_GIT (dotted-version compare via
# sort -V). False when git is absent.
git_new_enough() {
    have git || return 1
    local current
    current="$(git --version | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)"
    [ -n "$current" ] || return 1
    # The lowest of {MIN_GIT, current} must be MIN_GIT for current to qualify.
    [ "$(printf '%s\n%s\n' "$MIN_GIT" "$current" | sort -V | head -1)" = "$MIN_GIT" ]
}

echo "Installing prerequisites:"

# --- git (>= MIN_GIT) plus curl/unzip (the bun installer needs them) --------
# apt-get needs root. Use sudo when not already root; fail clearly if neither is
# available, rather than letting set -e abort with a bare permission error.
if have apt-get; then
    if [ "$(id -u)" -eq 0 ]; then
        SUDO=""
    elif have sudo; then
        SUDO="sudo"
    else
        SUDO="none"
    fi

    # curl + unzip: install whichever is missing.
    need=()
    for pkg in curl unzip; do
        have "$pkg" || need+=("$pkg")
    done
    # git: install/upgrade only when the distro copy is missing or too old.
    upgrade_git=false
    if ! git_new_enough; then
        upgrade_git=true
    fi

    if [ "${#need[@]}" -gt 0 ] || [ "$upgrade_git" = true ]; then
        if [ "$SUDO" = "none" ]; then
            warn "need root to install packages but am not root and sudo is not available."
            warn "Re-run as root, or install git (>= $MIN_GIT), curl, and unzip manually, then run this again."
            exit 1
        fi

        if [ "$upgrade_git" = true ]; then
            # The git-core PPA carries the latest stable git; the distro's own
            # package is often years behind (e.g. Ubuntu 24.04 ships 2.43).
            info "adding git-core PPA for the latest git (need >= $MIN_GIT)"
            $SUDO apt-get update -y
            $SUDO apt-get install -y software-properties-common
            $SUDO add-apt-repository -y ppa:git-core/ppa
            need+=(git)
        fi

        info "apt-get install: ${need[*]}"
        $SUDO apt-get update -y
        $SUDO apt-get install -y "${need[@]}"
    else
        info "ok    git ($(git --version | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)), curl, unzip"
    fi

    # Confirm the upgrade actually landed a new-enough git; the guard in the
    # playbook scripts would otherwise reject it at runtime.
    if ! git_new_enough; then
        warn "git is still older than $MIN_GIT after install ($(git --version 2>/dev/null))."
        warn "The playbook's worktree tooling needs relative-path worktrees; upgrade git manually."
        exit 1
    fi
else
    warn "apt-get not found; install git (>= $MIN_GIT), curl, and unzip with your package manager."
    if ! git_new_enough; then
        warn "current git is older than $MIN_GIT ($(git --version 2>/dev/null)); the playbook needs relative-path worktrees."
    fi
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
echo "Code from the playbook repo root."
