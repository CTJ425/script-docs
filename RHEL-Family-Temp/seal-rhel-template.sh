#!/usr/bin/env bash
# =================================================================
# RHEL/Rocky/Alma 8.x, 9.x, 10.x VM sealing and first-boot setup
# - Installs the first-boot interactive setup wizard
# - Sanitizes machine identity (MAC, UUID, machine-id, SSH host keys)
# - Prepares the VM to be converted into a template
# =================================================================

set -u
set -o pipefail

SCRIPT_NAME="$(basename "${0#-}")"
DRY_RUN=0
ASSUME_YES=0
DO_POWEROFF=0

# Where to fetch the wizard files from when they are not next to this script.
# Override for a fork or a different branch:
#   SCD_RAW_BASE=https://raw.githubusercontent.com/me/my-fork/dev/RHEL-Family-Temp
SCD_RAW_BASE="${SCD_RAW_BASE:-https://raw.githubusercontent.com/CTJ425/script-docs/main/RHEL-Family-Temp}"

# Directory holding this script, or "" when it was piped in (curl | bash).
LOCAL_DIR=""

usage() {
  cat <<USAGE
Usage:
  sudo ./${SCRIPT_NAME} [--dry-run] [--yes] [--poweroff]
  curl -fsSL <raw-url> | sudo bash -s -- [--yes] [--poweroff]

Options:
  --dry-run   Show actions without changing the system.
  --yes       Skip the confirmation prompt.
  --poweroff  Power off the VM after cleanup finishes.
  -h, --help  Show this help message.

Environment:
  SCD_RAW_BASE  Base URL used to download initial-setup.sh and 99-firstboot.sh
                when they are not found beside this script.
USAGE
}

log() {
  printf '[%s] %s\n' "$SCRIPT_NAME" "$*"
}

die() {
  printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 1
}

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

run_required() {
  run "$@" || die "Required command failed: $*"
}

# Cleanup steps that may legitimately fail (component not installed, etc.).
optional_run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    run "$@"
    return 0
  fi
  "$@" || log "Command failed but cleanup will continue: $*"
}

# Truncate a file to zero bytes, creating it if needed.
truncate_file() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] truncate $1"
    return 0
  fi
  : > "$1" || die "Could not truncate $1"
}

# Write a single line to a file.
write_line() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] write '$2' to $1"
    return 0
  fi
  printf '%s\n' "$2" > "$1" || die "Could not write $1"
}

# Escape regex metacharacters so hostnames containing '.' are matched literally.
regex_escape() {
  # shellcheck disable=SC2016  # the '$' is a regex metacharacter, not an expansion
  printf '%s' "$1" | sed 's/[][\.*^$(){}?+|/]/\\&/g'
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "Please run as root, for example: sudo ./$SCRIPT_NAME"
  fi
}

# When piped in, BASH_SOURCE[0] is the literal string "main" rather than a path,
# so testing for a real file is what distinguishes "cloned the repo" from
# "curl | bash". Using dirname on "main" would silently resolve to the current
# working directory and could pick up unrelated files that happen to sit there.
detect_local_dir() {
  local src="${BASH_SOURCE[0]:-}"
  if [ -n "$src" ] && [ -f "$src" ]; then
    LOCAL_DIR="$(cd "$(dirname "$src")" && pwd -P)"
    log "Running from $LOCAL_DIR"
  else
    LOCAL_DIR=""
    log "Running from a pipe; wizard files will be downloaded if needed."
  fi
}

detect_os() {
  [ -r /etc/os-release ] || die "Cannot read /etc/os-release"
  # shellcheck disable=SC1091
  . /etc/os-release

  OS_ID="${ID:-unknown}"
  OS_ID_LIKE="${ID_LIKE:-}"
  OS_NAME="${PRETTY_NAME:-unknown}"
  OS_MAJOR="${VERSION_ID:-}"
  [ -n "$OS_MAJOR" ] || die "Cannot detect OS VERSION_ID from /etc/os-release"
  OS_MAJOR="${OS_MAJOR%%.*}"

  case " $OS_ID $OS_ID_LIKE " in
    *" rhel "*|*" rocky "*|*" almalinux "*|*" centos "*|*" fedora "*) ;;
    *) die "Unsupported OS family: $OS_NAME. This script supports RHEL/Rocky compatible systems only." ;;
  esac

  case "$OS_MAJOR" in
    8|9|10) ;;
    *) die "Unsupported OS version: $OS_NAME. This script supports RHEL/Rocky compatible 8.x, 9.x, and 10.x only." ;;
  esac

  log "Detected OS: $OS_NAME"
}

confirm_run() {
  if [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi

  # stdin is the script itself under 'curl | bash', so always ask the terminal.
  if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
    die "No interactive terminal available. Re-run with --yes for non-interactive execution."
  fi

  printf 'This will configure first-boot setup and seal this VM. Continue? [y/N] ' > /dev/tty
  if ! read -r answer < /dev/tty; then
    die "Could not read confirmation from /dev/tty. Re-run with --yes for non-interactive execution."
  fi
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "Cancelled by user." ;;
  esac
}

# --- Installation ---

# Reject anything that is not plausibly the script we asked for before it gets
# installed as root-executed code.
validate_downloaded() {
  local file="$1" marker="$2"
  [ -s "$file" ] || die "Downloaded $file is empty."
  head -n 1 "$file" | grep -q '^#!' || die "Downloaded $file does not start with a shebang."
  grep -q "$marker" "$file" || die "Downloaded $file does not look like the expected script (missing '$marker')."
}

# Install one wizard file: prefer a copy sitting beside this script, otherwise
# download it. There is deliberately no embedded copy of these files here — an
# inlined duplicate would be a second version of initial-setup.sh to maintain,
# and it would drift from the real one.
install_wizard_file() {
  local name="$1" dest="$2" marker="$3"

  if [ -n "$LOCAL_DIR" ] && [ -f "$LOCAL_DIR/$name" ]; then
    log "Installing $name from $LOCAL_DIR"
    run_required cp "$LOCAL_DIR/$name" "$dest"
    return 0
  fi

  local url="$SCD_RAW_BASE/$name"
  log "Downloading $name from $url"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] download $url -> $dest"
    return 0
  fi

  local tmp
  tmp="$(mktemp)" || die "Could not create a temporary file."
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tmp" || die "Failed to download $url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$tmp" "$url" || die "Failed to download $url"
  else
    die "Neither curl nor wget is available, and $name was not found beside this script. Clone the repository instead."
  fi

  validate_downloaded "$tmp" "$marker"
  run_required cp "$tmp" "$dest"
}

install_initial_setup() {
  log "Installing the first-boot wizard and its login trigger."

  install_wizard_file initial-setup.sh /usr/local/bin/initial-setup.sh 'FLAG_FILE='
  install_wizard_file 99-firstboot.sh /etc/profile.d/99-firstboot.sh 'firstboot_completed'

  run_required chmod 755 /usr/local/bin/initial-setup.sh
  run_required chmod 644 /etc/profile.d/99-firstboot.sh

  log "Arming the wizard by removing the /etc/firstboot_completed flag."
  run rm -f /etc/firstboot_completed
}

# --- Sealing cleanup ---

clean_subscription() {
  if [ "$OS_ID" != "rhel" ]; then
    log "Skip subscription-manager cleanup for non-RHEL OS ID: $OS_ID"
    return 0
  fi
  if ! command -v subscription-manager >/dev/null 2>&1; then
    log "subscription-manager not found; skip registration cleanup."
    return 0
  fi

  log "Cleaning Red Hat subscription registration."
  optional_run subscription-manager unregister
  optional_run subscription-manager remove --all
  optional_run subscription-manager clean
}

clean_network_identity() {
  log "Removing NIC MAC, UUID, and persistent interface mappings."

  # RHEL 8 style ifcfg files.
  local f
  for f in /etc/sysconfig/network-scripts/ifcfg-*; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in
      ifcfg-lo) continue ;;
    esac
    log "Sanitizing $f"
    run_required sed -i \
      -e '/^[[:space:]]*HWADDR=/d' \
      -e '/^[[:space:]]*MACADDR=/d' \
      -e '/^[[:space:]]*UUID=/d' \
      "$f"
  done

  # NetworkManager keyfiles (RHEL 9/10).
  for f in /etc/NetworkManager/system-connections/*.nmconnection; do
    [ -f "$f" ] || continue
    log "Sanitizing NM connection: $f"
    run_required sed -i \
      -e '/^[[:space:]]*stable-id=/d' \
      -e '/^[[:space:]]*interface-name=/d' \
      -e '/^[[:space:]]*mac-address=/d' \
      -e '/^[[:space:]]*cloned-mac-address=/d' \
      -e '/^[[:space:]]*uuid=/d' \
      "$f"

    # NetworkManager can refuse to load a keyfile that has no uuid at all, so
    # give each profile a fresh one instead of just deleting the old value.
    if command -v uuidgen >/dev/null 2>&1; then
      if grep -q '^\[connection\]' "$f"; then
        local new_uuid
        new_uuid="$(uuidgen)"
        run_required sed -i "/^\[connection\]/a uuid=${new_uuid}" "$f"
        log "Regenerated UUID for $f: ${new_uuid}"
      else
        log "WARNING: $f has no [connection] section; cannot insert a uuid."
      fi
    else
      log "uuidgen not available; $f was left without a uuid."
    fi
    run_required chmod 600 "$f"
  done

  optional_run rm -f /etc/udev/rules.d/70-persistent-net.rules
  optional_run rm -f /etc/udev/rules.d/70-persistent-cd.rules
}

clean_hosts_resolver() {
  log "Cleaning hostname entries from /etc/hosts and clearing resolv.conf."

  local current_hn
  current_hn="$(hostname)"

  # Remove only the current hostname, keeping any custom entries the admin
  # added. 'localhost' is never removed or local resolution would break.
  if [ -n "$current_hn" ] &&
     [ "$current_hn" != "localhost" ] &&
     [ "$current_hn" != "localhost.localdomain" ]; then
    local hn_re
    hn_re="$(regex_escape "$current_hn")"
    run_required sed -i -E "s/[[:space:]]+${hn_re}([[:space:]]|\$)/\1/g" /etc/hosts
  fi

  if [ -L /etc/resolv.conf ]; then
    log "/etc/resolv.conf is a symlink; leaving it intact (its target in /run is transient and clears on reboot)."
  else
    truncate_file /etc/resolv.conf
  fi
}

clean_hostname() {
  log "Resetting hostname."
  run_required hostnamectl set-hostname localhost.localdomain
}

clean_ssh_host_keys() {
  log "Removing SSH host keys (regenerated on next boot by sshd-keygen)."
  optional_run rm -f /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_dsa_key.pub
  optional_run rm -f /etc/ssh/ssh_host_ecdsa_key /etc/ssh/ssh_host_ecdsa_key.pub
  optional_run rm -f /etc/ssh/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key.pub
  optional_run rm -f /etc/ssh/ssh_host_rsa_key /etc/ssh/ssh_host_rsa_key.pub
}

clean_machine_id() {
  log "Resetting machine-id for RHEL compatible $OS_MAJOR."

  optional_run rm -f /var/lib/dbus/machine-id

  if [ "$OS_MAJOR" = "8" ]; then
    # systemd 239 does not understand the "uninitialized" marker; an empty
    # file is what triggers regeneration there.
    truncate_file /etc/machine-id
  else
    # systemd 240+ treats this exact content as "first boot pending".
    write_line /etc/machine-id uninitialized
  fi
  run_required chmod 444 /etc/machine-id
}

clean_package_cache() {
  log "Cleaning package manager cache."
  optional_run dnf clean all
}

clean_tmp() {
  log "Cleaning temporary directories /tmp and /var/tmp."

  # Keep the sockets and per-service private directories belonging to the
  # currently running session, and never delete the directory this script is
  # being executed from.
  local -a keep=(
    ! -name 'systemd-private-*'
    ! -name '.X11-unix' ! -name '.XIM-unix' ! -name '.font-unix'
    ! -name '.ICE-unix' ! -name '.Test-unix'
  )
  local -a guard=()
  if [ -n "$LOCAL_DIR" ]; then
    case "$LOCAL_DIR" in
      /tmp/*|/var/tmp/*|/tmp|/var/tmp)
        guard=( ! -path "$LOCAL_DIR" ! -path "$LOCAL_DIR/*" )
        log "Preserving the script directory $LOCAL_DIR during temp cleanup."
        ;;
    esac
  fi

  optional_run find /tmp -mindepth 1 -maxdepth 1 "${keep[@]}" "${guard[@]}" -exec rm -rf {} +
  optional_run find /var/tmp -mindepth 1 -maxdepth 1 "${keep[@]}" "${guard[@]}" -exec rm -rf {} +
}

clean_logs() {
  log "Cleaning system logs."

  if command -v journalctl >/dev/null 2>&1; then
    log "Vacuuming journal."
    optional_run journalctl --flush --rotate
    optional_run journalctl --vacuum-time=1s
  fi

  if [ -d /var/log/journal ]; then
    log "Removing persistent journal files."
    optional_run find /var/log/journal -mindepth 1 -delete
  fi

  log "Truncating log files in /var/log."
  # -print0 so filenames containing spaces or newlines cannot split the loop.
  while IFS= read -r -d '' log_file; do
    optional_run truncate -s 0 "$log_file"
  done < <(find /var/log -type f -print0 2>/dev/null)
}

clean_optional_components() {
  log "Cleaning optional components when installed."

  if command -v rpm >/dev/null 2>&1 && rpm -qa 'katello-ca-consumer*' | grep -q .; then
    optional_run dnf remove -y 'katello-ca-consumer*'
  fi
  optional_run rm -f /etc/rhsm/facts/katello.facts

  if [ -f /etc/iscsi/initiatorname.iscsi ]; then
    optional_run rm -f /etc/iscsi/initiatorname.iscsi
  fi
  if command -v cloud-init >/dev/null 2>&1; then
    optional_run cloud-init clean --logs --seed
  fi
  if command -v insights-client >/dev/null 2>&1; then
    optional_run insights-client --unregister
  fi
}

# Top-level helpers: nesting these inside clean_shell_history meant their
# variables were not declared local and silently clobbered globals.
clear_bash_history() {
  local history_file="$1"
  [ -e "$history_file" ] || return 0
  optional_run rm -f "$history_file"
}

clear_history_dir() {
  local home_dir="$1"
  [ -n "$home_dir" ] || return 0
  [ -d "$home_dir" ] || return 0

  case "$home_dir" in
    /|/bin|/boot|/dev|/etc|/proc|/run|/sbin|/sys|/tmp|/usr|/var)
      log "Skip suspicious home directory while clearing history: $home_dir"
      return 0
      ;;
  esac
  clear_bash_history "$home_dir/.bash_history"
}

clean_shell_history() {
  log "Clearing shell history files."
  clear_history_dir /root

  if command -v getent >/dev/null 2>&1; then
    while IFS=: read -r _ _ uid _ _ home_dir _; do
      case "$uid" in
        ''|*[!0-9]*) continue ;;
      esac
      [ "$uid" -ge 1000 ] || continue
      clear_history_dir "$home_dir"
    done < <(getent passwd)
  elif [ -d /home ]; then
    while IFS= read -r -d '' history_file; do
      clear_bash_history "$history_file"
    done < <(find /home -mindepth 2 -maxdepth 2 -name .bash_history -type f -print0)
  fi
}

# --- Main ---

main() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --yes) ASSUME_YES=1 ;;
      --poweroff) DO_POWEROFF=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1 (try --help)" ;;
    esac
    shift
  done

  require_root
  detect_local_dir
  detect_os
  confirm_run

  install_initial_setup

  clean_subscription
  clean_network_identity
  clean_hosts_resolver
  clean_hostname
  clean_ssh_host_keys
  clean_machine_id
  clean_package_cache
  clean_tmp
  clean_logs
  clean_optional_components
  clean_shell_history

  log "Seal and setup configuration completed successfully."
  log "Shut down this VM before converting it to a template."
  log "--------------------------------------------------------"
  log "NOTE: to keep this shell's history off the template, exit with:"
  log "  history -c && history -w && exit"
  log "--------------------------------------------------------"

  if [ "$DO_POWEROFF" -eq 1 ]; then
    log "Powering off VM."
    run_required systemctl poweroff
  fi
}

main "$@"
