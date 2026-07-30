#!/usr/bin/env bash
# =================================================================
# Proxmox VE ISO symlink sync
#
# Recursively finds *.iso under a source directory and creates
# symlinks in the Proxmox VE ISO storage directory, so ISOs kept on
# an NFS/SMB share show up in the PVE web UI without being copied.
# =================================================================

set -euo pipefail

SCRIPT_NAME="$(basename "${0#-}")"

# Defaults; override with -s/-t or the SOURCE_DIR/TARGET_DIR env vars.
SOURCE_DIR="${SOURCE_DIR:-/mnt/pve/ISO}"
TARGET_DIR="${TARGET_DIR:-/mnt/pve/ISO/template/iso}"
DRY_RUN=0
QUIET=0

usage() {
  cat <<USAGE
Usage:
  ${SCRIPT_NAME} [-s SOURCE_DIR] [-t TARGET_DIR] [--dry-run] [--quiet]

Options:
  -s, --source DIR   Directory to scan recursively for *.iso
                     (default: ${SOURCE_DIR})
  -t, --target DIR   Proxmox VE ISO directory to create symlinks in
                     (default: ${TARGET_DIR})
  -n, --dry-run      Show what would change without touching anything.
  -q, --quiet        Only print the summary (useful for cron).
  -h, --help         Show this help.

Environment variables SOURCE_DIR and TARGET_DIR are honoured as well,
so the script needs no editing to be used via curl.

Example:
  ${SCRIPT_NAME} -s /mnt/nas/iso -t /var/lib/vz/template/iso
USAGE
}

log() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '%s\n' "$*"
}

die() {
  printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -s|--source)
      [ "$#" -ge 2 ] || die "$1 requires a directory argument."
      SOURCE_DIR="$2"; shift 2 ;;
    -t|--target)
      [ "$#" -ge 2 ] || die "$1 requires a directory argument."
      TARGET_DIR="$2"; shift 2 ;;
    -n|--dry-run) DRY_RUN=1; shift ;;
    -q|--quiet)   QUIET=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "Unknown option: $1 (try --help)" ;;
  esac
done

[ -d "$SOURCE_DIR" ] || die "Source directory '$SOURCE_DIR' does not exist."
[ -d "$TARGET_DIR" ] || die "Target directory '$TARGET_DIR' does not exist. Check the Proxmox VE storage configuration."

# Normalise both paths. Without this, a trailing slash on SOURCE_DIR makes the
# -path prune below never match, so the script would descend into the target
# directory and try to symlink the ISOs onto themselves.
SOURCE_DIR="$(cd "$SOURCE_DIR" && pwd -P)"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd -P)"

log "============================================="
log "Syncing ISO symlinks"
log "Source: $SOURCE_DIR"
log "Target: $TARGET_DIR"
[ "$DRY_RUN" -eq 1 ] && log "Mode:   dry-run (no changes will be made)"
log "============================================="

# Step 1: drop the symlinks created by a previous run. Only symlinks are
# removed, so real ISO files sitting in the target directory are never touched.
log "Removing existing ISO symlinks in the target directory..."
if [ "$DRY_RUN" -eq 1 ]; then
  find "$TARGET_DIR" -maxdepth 1 -type l -iname '*.iso' -printf '  [dry-run] would remove %p\n' 2>/dev/null || true
else
  find "$TARGET_DIR" -maxdepth 1 -type l -iname '*.iso' -delete
fi

# Step 2: create a symlink for every ISO found under the source directory.
log "Scanning source directory..."
LINKED=0
SKIPPED=0
FAILED=0

while IFS= read -r -d '' iso_file; do
  filename="$(basename "$iso_file")"
  target_file="${TARGET_DIR}/${filename}"

  # -e follows symlinks, so a dangling link would test false and then make
  # `ln -s` fail with EEXIST. Test for the link itself as well.
  if [ -e "$target_file" ] || [ -L "$target_file" ]; then
    log "  [skip] '$filename' already exists in the target directory (source: $iso_file)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "  [dry-run] would link $filename -> $iso_file"
    LINKED=$((LINKED + 1))
  elif ln -s "$iso_file" "$target_file"; then
    log "  [ok] linked $filename"
    LINKED=$((LINKED + 1))
  else
    log "  [fail] could not link $filename"
    FAILED=$((FAILED + 1))
  fi
done < <(
  find "$SOURCE_DIR" \
    -path "$TARGET_DIR" -prune -o \
    -type d -name '@eaDir' -prune -o \
    -type f -iname '*.iso' \
    -print0
)

printf '=============================================\n'
printf 'Linked: %d   Skipped: %d   Failed: %d\n' "$LINKED" "$SKIPPED" "$FAILED"
if [ "$SKIPPED" -gt 0 ]; then
  printf 'Skipped entries already existed in the target directory. Two ISOs with\n'
  printf 'the same filename in different source folders can only yield one link.\n'
fi
printf '=============================================\n'

[ "$FAILED" -eq 0 ] || exit 1
