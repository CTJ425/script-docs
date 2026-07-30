#!/usr/bin/env bash
# =================================================================
# Kubernetes cluster installer for RHEL-family hosts (Rocky/RHEL/Alma 9)
#
# Installs CRI-O + kubeadm/kubelet/kubectl, then either initialises a
# control plane (with Calico) or joins a worker to an existing cluster.
#
# Run k8s_env_initialization.sh first: this script checks the
# prerequisites it sets up (swap off, sysctls, kernel modules) but does
# not configure them.
# =================================================================

set -euo pipefail

SCRIPT_NAME="$(basename "${0#-}")"

ROLE=""
K8S_MINOR="v1.36"
K8S_PATCH="v1.36.2"
CRIO_VERSION=""
CALICO_VERSION="v3.32.1"
POD_CIDR="10.244.0.0/16"
ADVERTISE_ADDR=""
JOIN_CMD=""
SKIP_CALICO=0
DRY_RUN=0
ASSUME_YES=0

usage() {
  cat <<USAGE
Usage:
  sudo ./${SCRIPT_NAME} --role cp     [options]      # first control plane
  sudo ./${SCRIPT_NAME} --role worker --join "<kubeadm join ...>"

Required:
  --role cp|worker            What this node becomes.
  --join "<cmd>"              Worker only: the full 'kubeadm join' command
                              printed by 'kubeadm token create --print-join-command'
                              on the control plane. The --cri-socket flag is
                              appended automatically if missing.

Options:
  --k8s-version v1.36         Package repo minor version. (default: ${K8S_MINOR})
  --k8s-patch v1.36.2         Exact version pinned by kubeadm init. (default: ${K8S_PATCH})
  --crio-version v1.36        CRI-O version, must match the k8s minor.
                              (default: same as --k8s-version)
  --calico-version v3.32.1    Calico release to install. (default: ${CALICO_VERSION})
  --pod-cidr CIDR             Pod network CIDR. (default: ${POD_CIDR})
  --apiserver-advertise-address IP
                              Control plane API address. (default: primary IP)
  --skip-calico               Control plane only: do not install the CNI.
  -n, --dry-run               Print every command instead of running it.
  -y, --yes                   Do not ask for confirmation.
  -h, --help                  Show this help.

Examples:
  # control plane
  sudo ./${SCRIPT_NAME} --role cp --apiserver-advertise-address 10.0.1.10 --yes

  # worker
  sudo ./${SCRIPT_NAME} --role worker \\
    --join "kubeadm join 10.0.1.10:6443 --token abc.123 --discovery-token-ca-cert-hash sha256:deadbeef"
USAGE
}

log()  { printf '[%s] %s\n' "$SCRIPT_NAME" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$SCRIPT_NAME" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }

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
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$content" > "$dest"
}

# --- argument parsing ---

while [ "$#" -gt 0 ]; do
  case "$1" in
    --role)
      [ "$#" -ge 2 ] || die "--role requires an argument (cp or worker)."
      ROLE="$2"; shift 2 ;;
    --join)
      [ "$#" -ge 2 ] || die "--join requires the kubeadm join command."
      JOIN_CMD="$2"; shift 2 ;;
    --k8s-version)
      [ "$#" -ge 2 ] || die "--k8s-version requires an argument."
      K8S_MINOR="$2"; shift 2 ;;
    --k8s-patch)
      [ "$#" -ge 2 ] || die "--k8s-patch requires an argument."
      K8S_PATCH="$2"; shift 2 ;;
    --crio-version)
      [ "$#" -ge 2 ] || die "--crio-version requires an argument."
      CRIO_VERSION="$2"; shift 2 ;;
    --calico-version)
      [ "$#" -ge 2 ] || die "--calico-version requires an argument."
      CALICO_VERSION="$2"; shift 2 ;;
    --pod-cidr)
      [ "$#" -ge 2 ] || die "--pod-cidr requires an argument."
      POD_CIDR="$2"; shift 2 ;;
    --apiserver-advertise-address)
      [ "$#" -ge 2 ] || die "--apiserver-advertise-address requires an argument."
      ADVERTISE_ADDR="$2"; shift 2 ;;
    --skip-calico) SKIP_CALICO=1; shift ;;
    -n|--dry-run)  DRY_RUN=1; shift ;;
    -y|--yes)      ASSUME_YES=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

CRIO_VERSION="${CRIO_VERSION:-$K8S_MINOR}"

case "$ROLE" in
  cp|worker) ;;
  "") die "--role is required (cp or worker). See --help." ;;
  *)  die "Invalid --role '$ROLE'; expected 'cp' or 'worker'." ;;
esac

if [ "$ROLE" = "worker" ] && [ -z "$JOIN_CMD" ]; then
  die "Worker nodes need --join \"<kubeadm join ...>\". Get it on the control plane with: kubeadm token create --print-join-command"
fi
if [ "$ROLE" = "worker" ] && [ -n "$JOIN_CMD" ]; then
  case "$JOIN_CMD" in
    *"kubeadm join"*) ;;
    *) die "--join does not look like a kubeadm join command." ;;
  esac
fi

# --- preflight ---

require_root() {
  [ "${EUID:-$(id -u)}" -eq 0 ] || die "Please run as root, for example: sudo ./$SCRIPT_NAME ..."
}

detect_os() {
  [ -r /etc/os-release ] || die "Cannot read /etc/os-release."
  # shellcheck disable=SC1091
  . /etc/os-release
  local id="${ID:-unknown}" id_like="${ID_LIKE:-}"
  case " $id $id_like " in
    *" rhel "*|*" rocky "*|*" almalinux "*|*" centos "*|*" fedora "*) ;;
    *) die "This script targets RHEL-family systems (Rocky/RHEL/Alma). Detected: ${PRETTY_NAME:-$id}" ;;
  esac
  command -v dnf >/dev/null 2>&1 || die "dnf not found."
  log "Detected OS: ${PRETTY_NAME:-$id}"
}

# Report, but do not fix, what k8s_env_initialization.sh is responsible for.
check_prerequisites() {
  log "Checking node prerequisites..."
  local problems=0

  if swapon --noheadings --show 2>/dev/null | grep -q .; then
    warn "swap is still active. Run k8s_env_initialization.sh first (kubelet refuses to start with swap on)."
    problems=$((problems + 1))
  fi

  local m
  for m in overlay br_netfilter; do
    if ! lsmod 2>/dev/null | awk '{print $1}' | grep -qx "$m"; then
      warn "kernel module '$m' is not loaded."
      problems=$((problems + 1))
    fi
  done

  local key
  for key in net.bridge.bridge-nf-call-iptables net.ipv4.ip_forward; do
    if [ "$(sysctl -n "$key" 2>/dev/null || echo 0)" != "1" ]; then
      warn "sysctl $key is not 1."
      problems=$((problems + 1))
    fi
  done

  if [ "$problems" -gt 0 ]; then
    warn "$problems prerequisite problem(s) found."
    warn "Fix them with:  curl -fsSL <raw>/k8s_env_init/k8s_env_initialization.sh | sudo bash -s -- --yes"
    if [ "$ASSUME_YES" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
      confirm "Continue anyway?"
    fi
  else
    log "All prerequisites look good."
  fi
}

confirm() {
  local prompt="$1"
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ "$DRY_RUN" -eq 1 ] && return 0
  # stdin may be the script itself under 'curl | bash'; ask the terminal.
  local answer=""
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '%s [y/N] ' "$prompt" > /dev/tty
    read -r answer < /dev/tty || answer=""
  else
    die "No terminal available for confirmation. Re-run with --yes."
  fi
  case "$answer" in
    y|Y|yes|YES) ;;
    *) die "Cancelled by user." ;;
  esac
}

primary_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}'
}

# --- install steps ---

install_crio() {
  log "Installing CRI-O ${CRIO_VERSION}."
  local base="https://download.opensuse.org/repositories/isv:/cri-o:/stable:/${CRIO_VERSION}/rpm"
  write_file /etc/yum.repos.d/cri-o.repo "[cri-o]
name=CRI-O
baseurl=${base}/
enabled=1
gpgcheck=1
gpgkey=${base}/repodata/repomd.xml.key"

  run dnf install -y cri-o

  log "Setting the CRI-O cgroup driver to systemd (must match kubelet)."
  write_file /etc/crio/crio.conf.d/02-cgroup-manager.conf '[crio.runtime]
cgroup_manager = "systemd"
conmon_cgroup = "pod"'

  run systemctl daemon-reload
  run systemctl enable --now crio
}

install_kube_tools() {
  log "Installing kubelet, kubeadm and kubectl (${K8S_MINOR})."
  local base="https://pkgs.k8s.io/core:/stable:/${K8S_MINOR}/rpm"
  # 'exclude=' pins the minor version so a routine 'dnf update' cannot jump the
  # cluster to the next Kubernetes minor release behind your back.
  write_file /etc/yum.repos.d/kubernetes.repo "[kubernetes]
name=Kubernetes
baseurl=${base}/
enabled=1
gpgcheck=1
gpgkey=${base}/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni"

  run dnf install -y --disableexcludes=kubernetes kubelet kubeadm kubectl
  run systemctl enable --now kubelet
}

setup_kubeconfig() {
  # kubeadm writes admin.conf as root; make it usable by whoever ran sudo.
  local user="${SUDO_USER:-root}" home
  home="$(getent passwd "$user" | cut -d: -f6)"
  [ -n "$home" ] || home="/root"

  log "Installing kubeconfig for user '$user' at $home/.kube/config"
  run install -d -m 700 -o "$user" -g "$user" "$home/.kube"
  run install -m 600 -o "$user" -g "$user" /etc/kubernetes/admin.conf "$home/.kube/config"
}

install_calico() {
  log "Installing Calico ${CALICO_VERSION} via the Tigera operator."
  local manifests="https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests"
  local kubectl_cmd=(kubectl --kubeconfig=/etc/kubernetes/admin.conf)

  run "${kubectl_cmd[@]}" create -f "${manifests}/v1_crd_projectcalico_org.yaml"
  run "${kubectl_cmd[@]}" create -f "${manifests}/tigera-operator.yaml"
  run "${kubectl_cmd[@]}" wait --for=condition=Available deployment/tigera-operator \
    -n tigera-operator --timeout=120s

  # The upstream custom-resources.yaml hardcodes 192.168.0.0/16. If it does not
  # match --pod-network-cidr, calico-node never becomes ready, so patch it.
  local tmp
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] download ${manifests}/custom-resources.yaml, replace the pod CIDR with ${POD_CIDR}, then apply it"
  else
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' RETURN
    curl -fsSL "${manifests}/custom-resources.yaml" -o "$tmp/custom-resources.yaml" ||
      die "Could not download custom-resources.yaml"
    sed -i "s#cidr: 192\.168\.0\.0/16#cidr: ${POD_CIDR}#" "$tmp/custom-resources.yaml"
    if ! grep -q "cidr: ${POD_CIDR}" "$tmp/custom-resources.yaml"; then
      die "Could not set the pod CIDR in custom-resources.yaml; upstream format may have changed. Apply it manually."
    fi
    "${kubectl_cmd[@]}" create -f "$tmp/custom-resources.yaml"
  fi

  log "Waiting for Calico to become available (up to 5 minutes)..."
  run "${kubectl_cmd[@]}" wait --for=condition=Available tigerastatus/calico --timeout=300s
}

init_control_plane() {
  [ -n "$ADVERTISE_ADDR" ] || ADVERTISE_ADDR="$(primary_ip)"
  [ -n "$ADVERTISE_ADDR" ] ||
    die "Could not determine the API server address. Pass --apiserver-advertise-address."

  log "Initialising the control plane:"
  log "  advertise address : $ADVERTISE_ADDR"
  log "  pod CIDR          : $POD_CIDR"
  log "  kubernetes version: $K8S_PATCH"
  confirm "Run 'kubeadm init' now?"

  run kubeadm init \
    --pod-network-cidr="$POD_CIDR" \
    --apiserver-advertise-address="$ADVERTISE_ADDR" \
    --cri-socket=unix:///var/run/crio/crio.sock \
    --kubernetes-version="$K8S_PATCH"

  setup_kubeconfig

  if [ "$SKIP_CALICO" -eq 0 ]; then
    install_calico
  else
    log "Skipping Calico (--skip-calico). Nodes stay NotReady until a CNI is installed."
  fi

  log "-------------------------------------------------------------"
  log "Control plane ready. Join workers with:"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "  kubeadm token create --print-join-command"
  else
    printf '\n  %s \\\n    --cri-socket=unix:///var/run/crio/crio.sock\n\n' \
      "$(kubeadm token create --print-join-command)"
  fi
  log "-------------------------------------------------------------"
}

join_worker() {
  # kubeadm needs to be told about CRI-O when more than one runtime socket
  # exists; the CP's printed command does not include it.
  case "$JOIN_CMD" in
    *--cri-socket*) ;;
    *) JOIN_CMD="$JOIN_CMD --cri-socket=unix:///var/run/crio/crio.sock" ;;
  esac

  log "Joining the cluster."
  confirm "Run the join command now?"

  # The join command arrives as one string from the control plane's output, so
  # it has to be word-split deliberately here.
  local -a join_args
  read -r -a join_args <<< "$JOIN_CMD"
  run "${join_args[@]}"

  log "Worker joined. Check 'kubectl get nodes' on the control plane."
  log "The node stays NotReady until the CNI pods are scheduled onto it."
}

main() {
  require_root
  detect_os
  check_prerequisites
  install_crio
  install_kube_tools

  case "$ROLE" in
    cp)     init_control_plane ;;
    worker) join_worker ;;
  esac

  log "Done."
}

main
