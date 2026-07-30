#!/usr/bin/env bash
# =================================================================
# Kubernetes node prerequisite setup
# - Disables the firewall, SELinux (via kernel argument) and swap
# - Loads the overlay / br_netfilter modules and sets the CRI sysctls
# - Verifies every change and optionally reboots
# =================================================================

# Abort on error, on an unset variable, and on a failing stage of a pipeline.
# This script disables the firewall, SELinux and swap and then reboots, so a
# typo'd variable silently expanding to "" is the last thing we want.
set -euo pipefail

SCRIPT_NAME="$(basename "${0#-}")"
ASSUME_YES=0
NO_REBOOT=0
KEEP_FIREWALL=0
KEEP_SELINUX=0
DRY_RUN=0

usage() {
    cat <<USAGE
Usage:
  sudo ./${SCRIPT_NAME} [options]
  curl -fsSL <raw-url> | sudo bash -s -- [options]

Options:
  -y, --yes            Reboot at the end without asking.
      --no-reboot      Never reboot, and do not ask.
      --keep-firewall  Leave firewalld/ufw running. You then have to open the
                       Kubernetes ports yourself.
      --keep-selinux   Leave SELinux enabled (RHEL family). CRI-O and kubelet
                       do support enforcing mode; you may need container-selinux
                       and the right labels on any hostPath volumes.
  -n, --dry-run        Print every change instead of making it. Never reboots.
  -h, --help           Show this help.

With no options the script asks before rebooting when it has a terminal, and
skips the reboot when it does not (for example under 'curl | bash').
USAGE
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -y|--yes) ASSUME_YES=1 ;;
        --no-reboot) NO_REBOOT=1 ;;
        --keep-firewall) KEEP_FIREWALL=1 ;;
        --keep-selinux) KEEP_SELINUX=1 ;;
        -n|--dry-run) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1 (try --help)" >&2; exit 1 ;;
    esac
    shift
done

# Run a command, or describe it under --dry-run.
run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '[dry-run]'
        printf ' %q' "$@"
        printf '\n'
        return 0
    fi
    "$@"
}

# Write a here-doc style file, honouring --dry-run.
write_file() {
    local dest="$1" content="$2"
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '[dry-run] write %s:\n' "$dest"
        printf '%s\n' "$content" | sed 's/^/          | /'
        return 0
    fi
    printf '%s\n' "$content" > "$dest"
}

if [ "$ASSUME_YES" -eq 1 ] && [ "$NO_REBOOT" -eq 1 ]; then
    echo "--yes and --no-reboot cannot be combined." >&2
    exit 1
fi

# Check if the script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root. Please use sudo." >&2
    exit 1
fi

# Global variables for OS detection
OS_FAMILY=""
OS_NAME=""
OS_VERSION=""
OS_ID=""
OS_ID_LIKE=""

# Function: Detect Operating System
detect_os() {
    echo "=== Detecting Operating System ==="
    if [ -f /etc/os-release ]; then
        # shellcheck source=/dev/null
        . /etc/os-release
        OS_NAME="${NAME:-Unknown Linux}"
        OS_VERSION="${VERSION_ID:-Unknown}"
        OS_ID="${ID:-unknown}"
        OS_ID_LIKE="${ID_LIKE:-}"
        if [[ "$OS_ID" =~ ^(rhel|rocky|almalinux|centos|fedora)$ ]] || [[ "$OS_ID_LIKE" =~ (rhel|centos|fedora) ]]; then
            OS_FAMILY="rhel"
        elif [[ "$OS_ID" =~ ^(ubuntu|debian|kali|linuxmint)$ ]] || [[ "$OS_ID_LIKE" =~ (debian|ubuntu) ]]; then
            OS_FAMILY="debian"
        else
            OS_FAMILY="unknown"
        fi
    else
        OS_FAMILY="unknown"
        OS_NAME="Unknown Linux"
        OS_VERSION="Unknown"
    fi
    echo "OS Detected: $OS_NAME ($OS_VERSION) - Family: $OS_FAMILY"
    if [ "$OS_FAMILY" = "unknown" ]; then
        echo "Unsupported Linux distribution. Supported families: RHEL/Rocky/Alma/CentOS/Fedora and Debian/Ubuntu." >&2
        exit 1
    fi
    echo ""
}

# Function: Disable Firewall
disable_firewall() {
    if [ "$KEEP_FIREWALL" -eq 1 ]; then
        echo "=== 1. Keeping Firewall (--keep-firewall) ==="
        echo "Firewall left untouched. Remember to open the Kubernetes ports:"
        echo "  control plane: 6443, 2379-2380, 10250-10259"
        echo "  workers:       10250, 10256, 30000-32767"
        echo "  Calico VXLAN:  4789/udp"
        echo ""
        return 0
    fi

    echo "=== 1. Disabling Firewall ==="
    case "$OS_FAMILY" in
        debian)
            echo "Detected Debian/Ubuntu family. Disabling ufw..."
            run systemctl stop ufw || echo "ufw already stopped or not found."
            run systemctl disable ufw || echo "ufw already disabled or not found."
            echo "Firewall (ufw) has been stopped and disabled."
            ;;
        rhel)
            echo "Detected RHEL/Rocky family. Disabling firewalld..."
            run systemctl stop firewalld || echo "firewalld already stopped or not found."
            run systemctl disable firewalld || echo "firewalld already disabled or not found."
            echo "Firewall (firewalld) has been stopped and disabled."
            ;;
        *)
            echo "Unsupported OS family: $OS_FAMILY" >&2
            exit 1
            ;;
    esac
    echo ""
}

# Function: Disable SELinux through kernel argument
disable_selinux() {
    if [ "$OS_FAMILY" = "rhel" ] && [ "$KEEP_SELINUX" -eq 1 ]; then
        echo "=== 2. Keeping SELinux (--keep-selinux) ==="
        echo "SELinux left as configured. CRI-O and kubelet run under enforcing"
        echo "mode, but make sure container-selinux is installed and that any"
        echo "hostPath volumes carry a suitable label (e.g. container_file_t)."
        echo ""
        return 0
    fi

    if [ "$OS_FAMILY" = "rhel" ]; then
        echo "=== 2. Disabling SELinux ==="
        # Disable SELinux at boot by adding the kernel argument.
        if command -v grubby >/dev/null 2>&1; then
            run grubby --update-kernel ALL --args selinux=0
            echo "Updated kernel arguments via grubby to include 'selinux=0'."
            echo "A reboot is required to fully apply SELinux changes."
        elif [ "$DRY_RUN" -eq 1 ]; then
            # Keep --dry-run previewable from any host instead of aborting on a
            # missing tool: nothing is being changed, so this is not yet fatal.
            echo "[dry-run] grubby not found here; a real run on this host would abort."
        else
            echo "grubby not found. This RHEL/Rocky family system does not have grubby installed." >&2
            echo "Cannot continue because SELinux kernel argument selinux=0 was not configured." >&2
            exit 1
        fi
        echo ""
    else
        echo "=== 2. Skipping SELinux Disabling ==="
        echo "System is Debian/Ubuntu family (uses AppArmor, which is natively supported by Kubernetes)."
        echo ""
    fi
}

# Function: Disable Swap
disable_swap() {
    echo "=== 3. Disabling Swap ==="
    # Turn off all running swap partitions
    run swapoff -a

    # Back up /etc/fstab once. Using sed -i.bak would overwrite the backup on
    # every run, so after a second run the ".bak" would already have swap
    # commented out and no longer represent the original file.
    if [ ! -f /etc/fstab.orig ]; then
        run cp -a /etc/fstab /etc/fstab.orig
        echo "Saved original /etc/fstab to /etc/fstab.orig."
    else
        echo "/etc/fstab.orig already exists; keeping the original backup."
    fi

    # Comment out the swap line in /etc/fstab precisely using sed.
    # '\s+swap\s+' matches lines whose filesystem type field is swap.
    # 's/^#*/#/' collapses any leading hashes into exactly one, so re-running
    # the script never stacks up "###".
    run sed -r -i '/\s+swap\s+/s/^#*/#/' /etc/fstab

    echo "Swap has been disabled and commented out in /etc/fstab."
    echo ""
}

# Function: Load Kernel Modules
load_kernel_modules() {
    echo "=== 4. Loading Kernel Modules ==="
    # Minimal images may not ship this directory, and 'cat >' would then fail.
    run mkdir -p /etc/modules-load.d
    # Create a configuration file to load modules on boot
    write_file /etc/modules-load.d/crio.conf 'overlay
br_netfilter'

    # Load the modules immediately
    run modprobe overlay
    run modprobe br_netfilter
    echo "Kernel modules overlay and br_netfilter have been loaded."
    echo ""
}

# Function: Configure Kernel Parameters
setup_kernel_params() {
    echo "=== 5. Configuring Kernel Parameters (sysctl) ==="
    run mkdir -p /etc/sysctl.d
    # Create the kernel parameters configuration file for K8s
    write_file /etc/sysctl.d/99-kubernetes-cri.conf 'net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1'

    # Apply sysctl settings without rebooting.
    # 'sysctl --system' reads every file under /etc/sysctl.d, /run/sysctl.d and
    # friends. One unrelated pre-existing file with an unknown key makes it exit
    # non-zero, which under 'set -e' would abort the script before the
    # verification stage ever ran. Our own keys are checked in verify_sysctl_params.
    if ! run sysctl --system; then
        echo "Warning: 'sysctl --system' reported an error (usually an unrelated" >&2
        echo "         pre-existing entry under /etc/sysctl.d). The verification" >&2
        echo "         section below shows whether the Kubernetes keys applied." >&2
    fi
    echo "Kernel parameters have been set and loaded."
    echo ""
}

print_check() {
    local status="$1"
    local item="$2"
    local detail="$3"

    printf '[%s] %s - %s\n' "$status" "$item" "$detail"
}

verify_firewall() {
    local service_name
    local active_state
    local enabled_state

    if [ "$OS_FAMILY" = "debian" ]; then
        service_name="ufw"
    else
        service_name="firewalld"
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        print_check "WARN" "Firewall service" "systemctl not found; cannot verify $service_name."
        return
    fi

    active_state="$(systemctl is-active "$service_name" 2>/dev/null || true)"
    enabled_state="$(systemctl is-enabled "$service_name" 2>/dev/null || true)"

    if [[ "$active_state" =~ ^(inactive|failed|unknown)$ ]] &&
        [[ "$enabled_state" =~ ^(disabled|masked|not-found|)$ ]]; then
        print_check "OK" "Firewall service ($service_name)" "inactive and not enabled on boot."
    else
        print_check "WARN" "Firewall service ($service_name)" "active=$active_state, enabled=$enabled_state."
    fi
}

verify_security_module() {
    if [ "$OS_FAMILY" = "debian" ]; then
        print_check "OK" "Security module" "SELinux skipped; AppArmor can remain enabled for Kubernetes."
        return
    fi

    local runtime_selinux="unknown"

    if command -v getenforce >/dev/null 2>&1; then
        runtime_selinux="$(getenforce 2>/dev/null || true)"
    fi

    if [ "$KEEP_SELINUX" -eq 1 ]; then
        print_check "INFO" "SELinux" "left enabled on request (--keep-selinux); runtime state: $runtime_selinux."
        return
    fi

    # Capture first rather than piping into 'grep -q': under 'set -o pipefail'
    # grep exiting early on a match can leave grubby killed by SIGPIPE, which
    # would turn a successful check into a false WARN.
    local grubby_info=""
    if command -v grubby >/dev/null 2>&1; then
        grubby_info="$(grubby --info=ALL 2>/dev/null || true)"
    fi

    if command -v grubby >/dev/null 2>&1 &&
        printf '%s' "$grubby_info" | grep -q 'selinux=0'; then
        print_check "OK" "SELinux kernel argument" "selinux=0 found; reboot is required to apply fully."
    elif command -v grubby >/dev/null 2>&1; then
        print_check "WARN" "SELinux kernel argument" "selinux=0 not found in grubby output."
    else
        print_check "WARN" "SELinux kernel argument" "grubby not found; kernel argument was not verified."
    fi

    print_check "INFO" "SELinux runtime" "current runtime state: $runtime_selinux; reboot may be required."
}

verify_swap() {
    # Command substitution rather than '| grep -q .': see verify_security_module.
    if [ -n "$(swapon --noheadings --show 2>/dev/null || true)" ]; then
        print_check "WARN" "Swap runtime" "swap is still active."
    else
        print_check "OK" "Swap runtime" "no active swap detected."
    fi

    if [ ! -f /etc/fstab ]; then
        print_check "WARN" "Swap fstab" "/etc/fstab not found."
    elif awk '$1 !~ /^#/ && $3 == "swap" {found=1} END {exit found ? 0 : 1}' /etc/fstab; then
        print_check "WARN" "Swap fstab" "uncommented swap entry still exists."
    else
        print_check "OK" "Swap fstab" "no uncommented swap entry detected."
    fi
}

verify_kernel_modules() {
    local module
    local config_ok="yes"

    for module in overlay br_netfilter; do
        # One awk instead of 'lsmod | awk | grep -qx': grep -q exits on the
        # first match, and under pipefail the resulting SIGPIPE upstream would
        # be reported as a pipeline failure.
        if lsmod | awk -v m="$module" '$1 == m { found = 1 } END { exit found ? 0 : 1 }'; then
            print_check "OK" "Kernel module ($module)" "loaded."
        else
            print_check "WARN" "Kernel module ($module)" "not loaded."
        fi

        if ! grep -qx "$module" /etc/modules-load.d/crio.conf 2>/dev/null; then
            config_ok="no"
        fi
    done

    if [ "$config_ok" = "yes" ]; then
        print_check "OK" "Kernel module boot config" "/etc/modules-load.d/crio.conf contains overlay and br_netfilter."
    else
        print_check "WARN" "Kernel module boot config" "/etc/modules-load.d/crio.conf is missing expected modules."
    fi
}

verify_sysctl_params() {
    local key
    local value
    local config_file="/etc/sysctl.d/99-kubernetes-cri.conf"

    for key in net.bridge.bridge-nf-call-iptables net.ipv4.ip_forward net.bridge.bridge-nf-call-ip6tables; do
        if value="$(sysctl -n "$key" 2>/dev/null)" && [ "$value" = "1" ]; then
            print_check "OK" "Sysctl runtime ($key)" "value=$value."
        else
            print_check "WARN" "Sysctl runtime ($key)" "expected value=1, current value=${value:-unavailable}."
        fi
    done

    if [ -f "$config_file" ] &&
        grep -q '^net.bridge.bridge-nf-call-iptables[[:space:]]*=[[:space:]]*1$' "$config_file" &&
        grep -q '^net.ipv4.ip_forward[[:space:]]*=[[:space:]]*1$' "$config_file" &&
        grep -q '^net.bridge.bridge-nf-call-ip6tables[[:space:]]*=[[:space:]]*1$' "$config_file"; then
        print_check "OK" "Sysctl config" "$config_file contains required Kubernetes parameters."
    else
        print_check "WARN" "Sysctl config" "$config_file is missing one or more required parameters."
    fi
}

verify_setup() {
    echo "=== Verification Summary ==="
    echo "Detected OS: $OS_NAME ($OS_VERSION)"
    echo "OS ID: $OS_ID"
    echo "OS family: $OS_FAMILY"
    echo ""

    verify_firewall
    verify_security_module
    verify_swap
    verify_kernel_modules
    verify_sysctl_params
    echo ""
}

# Main function
main() {
    detect_os
    disable_firewall
    disable_selinux
    disable_swap
    load_kernel_modules
    setup_kernel_params

    # Verification inspects live system state. Under --dry-run nothing was
    # changed, so every check would report WARN and read as a failure.
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "=== Verification skipped (--dry-run made no changes) ==="
        echo ""
        echo "Dry run complete. No changes were made and no reboot was performed."
        return 0
    fi

    verify_setup

    echo "Setup is complete."

    if [ "$NO_REBOOT" -eq 1 ]; then
        echo "--no-reboot given. Remember to reboot before joining the cluster."
        return 0
    fi

    if [ "$ASSUME_YES" -eq 1 ]; then
        echo "Rebooting (--yes)..."
        reboot
        return 0
    fi

    local reboot_prompt="Reboot now to apply all changes? (y/n): "
    if [ "$OS_FAMILY" = "rhel" ]; then
        reboot_prompt="Reboot now to apply all changes (especially for SELinux)? (y/n): "
    fi

    # Under 'curl | sudo bash' stdin is the script itself, so there is nothing
    # to read: prompting would consume script text or block. Read from the
    # terminal directly when one is available, else skip.
    local reboot_confirm=""
    if [ -t 0 ]; then
        read -r -p "$reboot_prompt" reboot_confirm
    elif [ -r /dev/tty ]; then
        printf '%s' "$reboot_prompt" > /dev/tty
        read -r reboot_confirm < /dev/tty || reboot_confirm=""
    else
        echo "Non-interactive shell and no terminal available. Skipping reboot."
        echo "Re-run with --yes to reboot automatically."
        reboot_confirm="n"
    fi

    # Convert input to lowercase for comparison
    if [[ "${reboot_confirm,,}" == "y" || "${reboot_confirm,,}" == "yes" ]]; then
        echo "Rebooting..."
        reboot
    else
        echo "Reboot cancelled. Please remember to reboot manually later if needed."
    fi
}

# Execute the main function
main "$@"
