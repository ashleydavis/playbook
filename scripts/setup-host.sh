#!/usr/bin/env bash
#
# One-time setup of a host machine that will run the playbook's sandbox VM.
# Run this once per machine; then use scripts/vm.sh for every session.
#
#   bash scripts/setup-host.sh
#
# It installs what the host needs to run the VM and share this repo into it:
#
#   - Multipass          (the VM manager)
#   - nfs-kernel-server  (the repo is shared into the VM over NFS; Multipass's
#                         own SSHFS and virtio-fs mounts are several times slower)
#   - IP forwarding      (persisted; Multipass NATs the VM's traffic through the
#                         host, so without it the VM has no internet, and the
#                         kernel default is off and resets on every reboot)
#
# It does not create the VM or the NFS export for a particular repo: scripts/vm.sh
# does that, and does it per repo. It does not install git, bun, or Claude Code
# either; those go on the machine that runs Claude Code (usually the VM), and
# scripts/install-prereqs.sh installs them there.
#
# Idempotent: anything already present is left alone, so re-running is safe.
#
# Only tested on Ubuntu. It needs snap (for Multipass), apt, and systemd. On
# another distro, install the same three things with your package manager and
# skip this script; on macOS or Windows, install Multipass from
# https://multipass.run and share the repo into the VM yourself.

set -euo pipefail

info() { printf '  %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "Setting up this host to run the playbook VM:"

[ "$(uname -s)" = "Linux" ] || die "this script sets up a Linux host. On macOS or Windows, install Multipass from https://multipass.run and share the repo into the VM yourself."

# --- Multipass ---------------------------------------------------------------
if have multipass; then
    info "ok    multipass ($(multipass version | awk 'NR==1 {print $2}'))"
elif have snap; then
    info "installing multipass"
    sudo snap install multipass
else
    die "snap is not available. Install Multipass another way (https://multipass.run), then re-run."
fi

# --- NFS server --------------------------------------------------------------
# vm.sh exports the repo from here and mounts it in the VM. exportfs comes with
# the server package, so it is the thing to test for.
if have exportfs; then
    info "ok    nfs-kernel-server"
elif have apt-get; then
    info "installing nfs-kernel-server"
    sudo apt-get update -y
    sudo apt-get install -y nfs-kernel-server
else
    die "apt-get not found. Install an NFS server (nfs-kernel-server or equivalent) with your package manager, then re-run."
fi

if ! systemctl is-active --quiet nfs-kernel-server; then
    info "starting nfs-kernel-server"
    sudo systemctl start nfs-kernel-server
fi
# Without this the server does not come back after a reboot and the VM's mount fails.
if ! systemctl is-enabled --quiet nfs-kernel-server 2>/dev/null; then
    info "enabling nfs-kernel-server at boot"
    sudo systemctl enable nfs-kernel-server
fi

# --- IP forwarding -----------------------------------------------------------
if [ "$(sysctl -n net.ipv4.ip_forward)" = "1" ]; then
    info "ok    ip forwarding"
else
    info "enabling ip forwarding (the VM reaches the internet through the host)"
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
fi

# Persist it whether or not it is on now: it may be on only because something
# else set it this boot, and a reboot would silently take the VM's internet away.
if [ ! -f /etc/sysctl.d/99-multipass.conf ]; then
    info "persisting ip forwarding across reboots (/etc/sysctl.d/99-multipass.conf)"
    echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-multipass.conf >/dev/null
    sudo sysctl --system >/dev/null
fi

echo "Done."
echo "Next: bash scripts/vm.sh — creates the VM, shares this repo into it over NFS, and opens a shell in it."
