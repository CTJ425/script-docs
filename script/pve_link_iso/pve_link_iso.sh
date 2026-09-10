#!/usr/bin/env bash
# =================================================================
# Proxmox VE ISO symlink sync
#
# Recursively finds *.iso under a source directory and reconciles
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
    --source=*)
      SOURCE_DIR="${1#*=}"; shift ;;
    -s=*)
      SOURCE_DIR="${1#*=}"; shift ;;
    -t|--target)
      [ "$#" -ge 2 ] || die "$1 requires a directory argument."
      TARGET_DIR="$2"; shift 2 ;;
    --target=*)
      TARGET_DIR="${1#*=}"; shift ;;
    -t=*)
      TARGET_DIR="${1#*=}"; shift ;;
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

[ "$SOURCE_DIR" != "$TARGET_DIR" ] || die "Source directory and target directory cannot be the same."

log "============================================="
log "Syncing ISO symlinks"
log "Source: $SOURCE_DIR"
log "Target: $TARGET_DIR"
[ "$DRY_RUN" -eq 1 ] && log "Mode:   dry-run (no changes will be made)"
log "============================================="

# Step 1: Scan source directory and reconcile symlinks incrementally.
# Existing valid links are preserved untouched to avoid downtime in PVE.
log "Scanning source directory..."
declare -A ACTIVE_LINKS=()
LINKED=0
UNCHANGED=0
PRUNED=0
SKIPPED=0
FAILED=0
SCAN_DONE=0
SCAN_EXIT=1

while IFS= read -r -d '' iso_file; do
  if [[ "$iso_file" == __FIND_DONE__:* ]]; then
    SCAN_DONE=1
    SCAN_EXIT="${iso_file#__FIND_DONE__:}"
    break
  fi

  filename="$(basename "$iso_file")"
  target_file="${TARGET_DIR}/${filename}"

  # Real files in target directory are left untouched
  if [ -f "$target_file" ] && [ ! -L "$target_file" ]; then
    log "  [skip] '$filename' is a regular file in the target directory (source: $iso_file)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Existing symlinks
  if [ -L "$target_file" ]; then
    curr_target="$(readlink "$target_file" || true)"
    if [ "$curr_target" = "$iso_file" ]; then
      log "  [ok] up-to-date $filename"
      ACTIVE_LINKS["$filename"]=1
      UNCHANGED=$((UNCHANGED + 1))
      continue
    elif [ -n "${ACTIVE_LINKS[$filename]:-}" ]; then
      log "  [skip] '$filename' conflict (already linked to $curr_target, skipping $iso_file)"
      SKIPPED=$((SKIPPED + 1))
      continue
    else
      # Target is a symlink pointing to an outdated or broken path; update it.
      if [ "$DRY_RUN" -eq 1 ]; then
        log "  [dry-run] would update $filename -> $iso_file (was $curr_target)"
        ACTIVE_LINKS["$filename"]=1
        LINKED=$((LINKED + 1))
      elif ln -sfn "$iso_file" "$target_file"; then
        log "  [ok] updated $filename -> $iso_file"
        ACTIVE_LINKS["$filename"]=1
        LINKED=$((LINKED + 1))
      else
        log "  [fail] could not update $filename"
        FAILED=$((FAILED + 1))
      fi
      continue
    fi
  fi

  # Target does not exist; create new symlink
  if [ "$DRY_RUN" -eq 1 ]; then
    log "  [dry-run] would link $filename -> $iso_file"
    ACTIVE_LINKS["$filename"]=1
    LINKED=$((LINKED + 1))
  elif ln -s "$iso_file" "$target_file"; then
    log "  [ok] linked $filename"
    ACTIVE_LINKS["$filename"]=1
    LINKED=$((LINKED + 1))
  else
    log "  [fail] could not link $filename"
    FAILED=$((FAILED + 1))
  fi
done < <(
  find "$SOURCE_DIR" \
    -path "$TARGET_DIR" -prune -o \
    -type d \( -name '@eaDir' -o -name '#recycle' -o -name '@Recycle' -o -name '.zfs' -o -name '.snapshot' \) -prune -o \
    -type f -iname '*.iso' \
    -print0
  printf '__FIND_DONE__:%d\0' "$?"
)

if [ "$SCAN_DONE" -ne 1 ] || [ "$SCAN_EXIT" -ne 0 ]; then
  die "Source scan did not complete cleanly; aborting without pruning target directory."
fi

# Step 2: Remove stale or dangling ISO symlinks in target directory.
log "Cleaning up stale symlinks in the target directory..."
while IFS= read -r -d '' link_file; do
  link_name="$(basename "$link_file")"
  if [ -z "${ACTIVE_LINKS[$link_name]:-}" ] || [ ! -e "$link_file" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "  [dry-run] would remove stale link $link_name"
      PRUNED=$((PRUNED + 1))
    elif rm -f "$link_file"; then
      log "  [prune] removed stale link $link_name"
      PRUNED=$((PRUNED + 1))
    else
      log "  [fail] could not remove stale link $link_name"
      FAILED=$((FAILED + 1))
    fi
  fi
done < <(find "$TARGET_DIR" -maxdepth 1 -type l -iname '*.iso' -print0)

printf '=============================================\n'
printf 'Linked: %d   Unchanged: %d   Pruned: %d   Skipped: %d   Failed: %d\n' \
  "$LINKED" "$UNCHANGED" "$PRUNED" "$SKIPPED" "$FAILED"
if [ "$SKIPPED" -gt 0 ]; then
  printf 'Skipped entries were regular files or collided with another ISO with\n'
  printf 'the same filename in a different source folder.\n'
fi
printf '=============================================\n'

[ "$FAILED" -eq 0 ] || exit 1
