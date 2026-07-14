#!/usr/bin/env bash
#
# Bring up this project's Multipass VM with the repo NFS-mounted, and open a
# shell inside it. Run it on the host, from anywhere:
#
#   bash scripts/setup-host.sh    # once per machine: Multipass, NFS server, IP forwarding
#   bash scripts/vm.sh            # up + mount + shell in the VM (the usual case)
#   bash scripts/vm.sh up         # same, but stay on the host
#   bash scripts/vm.sh shell      # just open a shell (assumes it is already up)
#   bash scripts/vm.sh stop       # shut the VM down
#   bash scripts/vm.sh status     # print VM state, IP, export, mount
#
# Idempotent: every step checks before it acts, so re-running after a host
# reboot, a VM restart, or nothing at all is safe and quiet.
#
# Only tested on an Ubuntu host with an Ubuntu VM. It assumes an Ubuntu guest
# (the ubuntu user, passwordless sudo, apt) and a Linux host with systemd, the
# Multipass bridge (mpqemubr0), and /etc/exports. Elsewhere it will need work.
#
# It handles the whole cycle: launches the VM if it does not exist, starts it if
# it is stopped, makes sure the host is exporting the repo over NFS, and mounts
# that export inside the VM. NFS is used because Multipass's own SSHFS and
# virtio-fs mounts are far slower (see the write-speed table in the docs).
#
# The NFS export is granted to the whole Multipass bridge subnet rather than to
# one VM IP. The VM's IP changes across restarts; the subnet does not. That is
# what keeps this from needing host sudo on every run: after the first time,
# /etc/exports is already correct and nothing on the host needs changing.
#
# Overrides (all optional):
#   PB_VM_NAME    VM name                    (default: repo directory name)
#   PB_VM_SHARE   host directory to share    (default: the repo root)
#   PB_VM_MOUNT   mount point inside the VM  (default: /home/ubuntu/<repo name>)
#   PB_VM_IMAGE   image to launch            (default: 24.04)
#   PB_VM_CPUS    cpus                       (default: 4)
#   PB_VM_MEMORY  memory                     (default: 8G)
#   PB_VM_DISK    disk                       (default: 50G)
#   PB_VM_BRIDGE  Multipass host bridge      (default: mpqemubr0)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SHARE="${PB_VM_SHARE:-$REPO}"
VM="${PB_VM_NAME:-$(basename "$SHARE")}"
MOUNT="${PB_VM_MOUNT:-/home/ubuntu/$(basename "$SHARE")}"
IMAGE="${PB_VM_IMAGE:-24.04}"
CPUS="${PB_VM_CPUS:-4}"
MEMORY="${PB_VM_MEMORY:-8G}"
DISK="${PB_VM_DISK:-50G}"
BRIDGE="${PB_VM_BRIDGE:-mpqemubr0}"

# NFS export options for the repo. rw: the VM writes code, commits, worktrees.
# sync: acknowledge writes only once they are on disk (async is faster but can
# lose writes if the host dies, and this is your source of truth). no_subtree_check:
# the standard recommendation; it avoids a permission check that breaks when a
# file is renamed while open, at no real cost when exporting a whole directory.
EXPORT_OPTS="rw,sync,no_subtree_check"

info() { printf '  %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Run a command inside the VM. --no-map-working-directory stops Multipass trying
# to translate the host's current directory into a VM path (there is no Multipass
# mount to translate through; the NFS mount is invisible to it).
vm_exec() { multipass exec "$VM" --no-map-working-directory -- "$@"; }

# --- host side ---------------------------------------------------------------

# The VM's state as Multipass reports it, or empty when the VM does not exist.
vm_state() {
    multipass list --format csv 2>/dev/null | awk -F, -v n="$VM" 'NR>1 && $1==n {print $2}'
}

vm_ip() {
    multipass list --format csv 2>/dev/null | awk -F, -v n="$VM" 'NR>1 && $1==n {print $3}'
}

# Launch the VM if it is absent, start it if it is not running. Sets CREATED=true
# on a fresh launch, which is how cmd_up knows the VM still needs provisioning
# (git, bun, Claude Code) rather than just mounting.
ensure_vm() {
    local state
    state="$(vm_state)"

    if [ -z "$state" ]; then
        info "launching VM '$VM' ($IMAGE, $CPUS cpus, $MEMORY, $DISK) — first launch downloads the image"
        # No --mount: Multipass's own mounts are too slow. NFS is set up below.
        multipass launch "$IMAGE" --name "$VM" --cpus "$CPUS" --memory "$MEMORY" --disk "$DISK"
        CREATED=true
        return
    fi

    case "$state" in
        Running) info "ok    VM '$VM' running" ;;
        *)
            info "starting VM '$VM' (was $state)"
            multipass start "$VM"
            ;;
    esac
}

# The VM has no IP for a moment after boot. Wait for one rather than racing it.
wait_for_ip() {
    local i ip
    for i in $(seq 1 60); do
        ip="$(vm_ip)"
        if [ -n "$ip" ] && [ "$ip" != "--" ]; then
            echo "$ip"
            return
        fi
        sleep 1
    done
    die "VM '$VM' never reported an IP address. Check: multipass info $VM"
}

# The host's address on the Multipass bridge, and the subnet the VM sits on.
# Multipass always takes the .1 of that subnet for the host, so the bridge is the
# reliable source; the VM's IP is the fallback if the bridge is named something
# else on this machine.
bridge_addr() {
    ip -4 -o addr show "$BRIDGE" 2>/dev/null | awk '{print $4}' | head -1
}

# Multipass NATs the VM's traffic through the host bridge, which only works when
# the host forwards IP. The kernel default is off, and a reboot resets it unless
# it is persisted, which is the usual cause of "the VM has no internet".
ensure_ip_forward() {
    if [ "$(sysctl -n net.ipv4.ip_forward)" = "1" ]; then
        info "ok    ip forwarding"
        return
    fi
    info "enabling ip forwarding (the VM needs it to reach the internet)"
    sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
    echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-multipass.conf >/dev/null
}

ensure_nfs_server() {
    have exportfs || die "no NFS server on this host. Set the host up once with: bash scripts/setup-host.sh"
    if ! systemctl is-active --quiet nfs-kernel-server; then
        info "starting nfs-kernel-server"
        sudo systemctl start nfs-kernel-server
    fi
}

# Export $SHARE to the whole Multipass subnet. Rewrites /etc/exports only when the
# line is missing or wrong, so the common case needs no sudo at all.
ensure_export() {
    local subnet="$1" want current tmp
    want="$SHARE $subnet($EXPORT_OPTS)"
    current="$(awk -v s="$SHARE" '$1==s' /etc/exports 2>/dev/null || true)"

    if [ "$current" = "$want" ]; then
        info "ok    export  $want"
        return
    fi

    info "updating /etc/exports: $want"
    tmp="$(mktemp)"
    # Drop any existing line for this share (a stale single-VM IP from before),
    # then append the subnet-wide one.
    awk -v s="$SHARE" '$1!=s' /etc/exports > "$tmp" 2>/dev/null || true
    printf '%s\n' "$want" >> "$tmp"
    sudo cp "$tmp" /etc/exports
    rm -f "$tmp"
    sudo exportfs -ra
}

# --- VM side -----------------------------------------------------------------

ensure_nfs_client() {
    if vm_exec bash -c 'command -v mount.nfs >/dev/null 2>&1'; then
        info "ok    nfs-common in the VM"
        return
    fi
    info "installing nfs-common in the VM"
    vm_exec sudo apt-get update -y
    vm_exec sudo apt-get install -y nfs-common
}

# Mount (or re-mount) the export inside the VM. After a host reboot the old mount
# is often still listed but dead, and after a VM restart the host IP it was
# mounted from may have changed, so an existing mount from the wrong source is
# force-unmounted rather than trusted.
ensure_mount() {
    local host_ip="$1" want current
    want="$host_ip:$SHARE"

    vm_exec sudo mkdir -p "$MOUNT"
    current="$(vm_exec findmnt -n -o SOURCE "$MOUNT" 2>/dev/null || true)"

    if [ "$current" = "$want" ] && vm_exec bash -c "ls '$MOUNT' >/dev/null 2>&1"; then
        info "ok    mount   $want -> $MOUNT"
        return
    fi

    if [ -n "$current" ]; then
        info "unmounting stale mount ($current)"
        vm_exec sudo umount -f -l "$MOUNT" || true
    fi

    info "mounting $want -> $MOUNT"
    vm_exec sudo mount "$want" "$MOUNT"
}

# --- commands ----------------------------------------------------------------

CREATED=false

cmd_up() {
    have multipass || die "multipass is not installed. Set the host up once with: bash scripts/setup-host.sh"
    [ -d "$SHARE" ] || die "share directory does not exist: $SHARE"

    echo "Bringing up '$VM':"

    ensure_ip_forward
    ensure_vm

    local ip cidr host_ip subnet
    ip="$(wait_for_ip)"

    cidr="$(bridge_addr)"
    if [ -n "$cidr" ]; then
        host_ip="${cidr%/*}"
        # Network address of the bridge subnet, e.g. 10.103.119.1/24 -> 10.103.119.0/24.
        subnet="${host_ip%.*}.0/${cidr#*/}"
    else
        warn "bridge '$BRIDGE' not found; deriving the host address from the VM's IP"
        host_ip="${ip%.*}.1"
        subnet="${ip%.*}.0/24"
    fi

    ensure_nfs_server
    ensure_export "$subnet"
    ensure_nfs_client
    ensure_mount "$host_ip"

    if [ "$CREATED" = true ]; then
        info "provisioning the new VM (git, bun, Claude Code)"
        # --working-directory cannot be combined with --no-map-working-directory.
        multipass exec "$VM" --working-directory "$MOUNT" -- bash scripts/install-prereqs.sh
    fi

    echo "Ready: $MOUNT in VM '$VM' ($ip)"
}

cmd_shell() {
    # -l so the login shell picks up PATH for bun and claude. --working-directory
    # lands the shell in the mounted repo, and cannot be combined with
    # --no-map-working-directory.
    exec multipass exec "$VM" --working-directory "$MOUNT" -- bash -l
}

cmd_stop() {
    multipass stop "$VM"
}

cmd_status() {
    local state
    state="$(vm_state)"
    printf 'VM:      %s (%s)\n' "$VM" "${state:-absent}"
    printf 'IP:      %s\n' "$(vm_ip)"
    printf 'Share:   %s\n' "$SHARE"
    printf 'Mount:   %s\n' "$MOUNT"
    printf 'Export:  %s\n' "$(awk -v s="$SHARE" '$1==s' /etc/exports 2>/dev/null || echo 'none')"
    printf 'Mounted: %s\n' "$(vm_exec findmnt -n -o SOURCE,TARGET "$MOUNT" 2>/dev/null || echo 'no')"
}

case "${1:-default}" in
    default) cmd_up; cmd_shell ;;
    up)      cmd_up ;;
    shell)   cmd_shell ;;
    stop)    cmd_stop ;;
    status)  cmd_status ;;
    *)       die "unknown command: $1 (use: up, shell, stop, status, or no argument for up + shell)" ;;
esac
