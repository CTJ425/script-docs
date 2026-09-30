#!/usr/bin/env bash
#
# install.sh — install the Claude Code release skills (versioning, ship).
#
# The skills are plain Markdown, so installing is a download into a skills
# directory. The only real decision is *which* directory: ~/.claude/skills
# (every repo on this machine) or <repo>/.claude/skills (this repo only).
#
# Run it from a pipe or from a clone:
#   curl -fsSL .../AI/skill/install.sh | bash -s -- --global
#   ./install.sh --project versioning
#
set -euo pipefail

REPO='CTJ425/script-docs'
BRANCH="${SKILL_RAW_BRANCH:-main}"
RAW_BASE="${SKILL_RAW_BASE:-https://raw.githubusercontent.com/${REPO}/${BRANCH}/AI/skill}"

SCOPE=''
PROJECT_PATH=''
FORCE=0
DRY_RUN=0
LIST_ONLY=0
WANTED=()
TMPDIR_SELF=''

# Where this script lives, when it was not piped in. A pipe leaves
# BASH_SOURCE[0] unset, and that is what selects remote mode. Running from a
# clone finds manifest.json next to the script and never touches the network.
SELF_DIR=''
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

usage() {
  cat <<'USAGE'
install.sh — install the Claude Code release skills

Usage:
  install.sh [--global | --project[=PATH]] [SKILL...] [options]

Scope (pick one; asked interactively when neither is given):
  --global            install into ${CLAUDE_CONFIG_DIR:-~/.claude}/skills
                      — available in every repo on this machine
  --project[=PATH]    install into <repo>/.claude/skills
                      — available in that repo only. PATH defaults to the
                        current git repository root

Skills:
  SKILL...            names to install. Omit to install every skill in the
                      manifest. --list prints the names

Options:
  --force             overwrite a changed file without keeping a .bak copy
  --dry-run           print what would change and write nothing
  --list              list the available skills and exit
  -h, --help          this text

Environment:
  SKILL_RAW_BASE      base URL to download from (for a fork)
  SKILL_RAW_BRANCH    branch to download from (default: main)
  CLAUDE_CONFIG_DIR   Claude Code config directory (default: ~/.claude)

Examples:
  curl -fsSL https://raw.githubusercontent.com/CTJ425/script-docs/main/AI/skill/install.sh \
    | bash -s -- --global
  ./install.sh --project=/srv/app versioning --dry-run

An existing file that differs is copied to <file>.bak before it is replaced,
unless --force is given. A file that is already identical is left alone.
USAGE
}

die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

# An EXIT trap whose last command fails becomes the script's exit status, so
# this must not end on a false test: `--help` exits 0 before TMPDIR_SELF is set.
cleanup() {
  if [ -n "$TMPDIR_SELF" ]; then
    rm -rf "$TMPDIR_SELF"
  fi
}
trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --global)       SCOPE='global' ;;
    --project)      SCOPE='project' ;;
    --project=*)    SCOPE='project'; PROJECT_PATH="${1#*=}" ;;
    --force)        FORCE=1 ;;
    --dry-run)      DRY_RUN=1 ;;
    --list)         LIST_ONLY=1 ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "unknown option: $1 (try --help)" ;;
    *)              WANTED+=("$1") ;;
  esac
  shift
done

need_cmd python3

TMPDIR_SELF="$(mktemp -d)"

# ---------------------------------------------------------------- manifest

MANIFEST=''
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/manifest.json" ]; then
  MANIFEST="$SELF_DIR/manifest.json"
  SOURCE_KIND='clone'
else
  need_cmd curl
  MANIFEST="$TMPDIR_SELF/manifest.json"
  curl -fsSL "$RAW_BASE/manifest.json" -o "$MANIFEST" \
    || die "cannot download the manifest from $RAW_BASE/manifest.json"
  SOURCE_KIND='remote'
fi

manifest_query() {
  python3 - "$MANIFEST" "$@" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
skills = {s['name']: s for s in data['skills']}
mode = sys.argv[2]
if mode == 'names':
    print('\n'.join(skills))
elif mode == 'list':
    for name, s in skills.items():
        print(f"{name}\t{s.get('summary', '')}")
elif mode == 'files':
    s = skills.get(sys.argv[3])
    if s is None:
        sys.exit(f"unknown skill: {sys.argv[3]} (available: {', '.join(skills)})")
    print('\n'.join(s['files']))
PY
}

if [ "$LIST_ONLY" -eq 1 ]; then
  printf 'Skills in the manifest (%s):\n\n' "$SOURCE_KIND"
  manifest_query list | while IFS=$'\t' read -r name summary; do
    printf '  %-12s %s\n' "$name" "$summary"
  done
  exit 0
fi

if [ "${#WANTED[@]}" -eq 0 ]; then
  while IFS= read -r name; do WANTED+=("$name"); done < <(manifest_query names)
fi

# ------------------------------------------------------------------- scope

if [ -z "$SCOPE" ]; then
  # A piped script has the script on stdin, so a prompt has to read the
  # terminal directly. With no terminal there is nothing to guess from:
  # installing globally when the user meant one repo is the wrong default.
  # `[ -r /dev/tty ]` is not the test: the node exists and looks readable even
  # when the process has no controlling terminal. Only opening it proves it.
  if (exec 3<>/dev/tty) 2>/dev/null; then
    {
      printf '\nWhere should these skills be installed?\n\n'
      printf '  1) global   %s/skills — every repo on this machine\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
      printf '  2) project  <repo>/.claude/skills — this repo only\n\n'
      printf 'Choice [1/2]: '
    } >/dev/tty
    read -r reply </dev/tty
    case "$reply" in
      1|g|global)  SCOPE='global' ;;
      2|p|project) SCOPE='project' ;;
      *)           die "not a choice: '$reply'" ;;
    esac
  else
    die "no scope given and no terminal to ask on.
    Re-run with one of:
      curl -fsSL $RAW_BASE/install.sh | bash -s -- --global
      curl -fsSL $RAW_BASE/install.sh | bash -s -- --project"
  fi
fi

case "$SCOPE" in
  global)
    DEST_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
    ;;
  project)
    if [ -z "$PROJECT_PATH" ]; then
      need_cmd git
      PROJECT_PATH="$(git rev-parse --show-toplevel 2>/dev/null)" \
        || die "not inside a git repository — pass --project=PATH"
    fi
    [ -d "$PROJECT_PATH" ] || die "no such directory: $PROJECT_PATH"
    DEST_ROOT="$PROJECT_PATH/.claude/skills"
    ;;
esac

# ----------------------------------------------------------------- install

fetch_file() {
  # fetch_file <skill> <file> <out>
  if [ "$SOURCE_KIND" = 'clone' ]; then
    cp "$SELF_DIR/$1/$2" "$3"
  else
    curl -fsSL "$RAW_BASE/$1/$2" -o "$3" \
      || die "cannot download $1/$2 from $RAW_BASE"
  fi
}

# Fail on an unknown name before anything is printed or written.
for skill in "${WANTED[@]}"; do
  manifest_query files "$skill" >/dev/null
done

installed=0
skipped=0
backed_up=0

printf 'Installing into %s (%s)\n' "$DEST_ROOT" "$SCOPE"
[ "$DRY_RUN" -eq 1 ] && printf '(dry run — nothing is written)\n'
printf '\n'

for skill in "${WANTED[@]}"; do
  files="$(manifest_query files "$skill")"
  dest="$DEST_ROOT/$skill"

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    staged="$TMPDIR_SELF/$skill-$(printf '%s' "$file" | tr '/' '_')"
    fetch_file "$skill" "$file" "$staged"

    target="$dest/$file"
    if [ -f "$target" ] && cmp -s "$staged" "$target"; then
      printf '  = %-28s unchanged\n' "$skill/$file"
      skipped=$((skipped + 1))
      continue
    fi

    if [ -f "$target" ] && [ "$FORCE" -eq 0 ]; then
      printf '  ~ %-28s replaced (backup: %s.bak)\n' "$skill/$file" "$file"
      [ "$DRY_RUN" -eq 1 ] || cp "$target" "$target.bak"
      backed_up=$((backed_up + 1))
    elif [ -f "$target" ]; then
      printf '  ~ %-28s overwritten\n' "$skill/$file"
    else
      printf '  + %-28s installed\n' "$skill/$file"
    fi

    if [ "$DRY_RUN" -eq 0 ]; then
      mkdir -p "$(dirname "$target")"
      cp "$staged" "$target"
    fi
    installed=$((installed + 1))
  done <<<"$files"
done

printf '\n%d written, %d unchanged, %d backed up.\n' "$installed" "$skipped" "$backed_up"

if [ "$DRY_RUN" -eq 1 ]; then
  printf 'Dry run — re-run without --dry-run to apply.\n'
  exit 0
fi

cat <<'NEXT'

Next: these skills read paths and commands from a per-repo config, and they
refuse to guess. In the repository you want to release, either write
.claude/release.config.json yourself or ask Claude Code to bootstrap it:

  "set up the release config for this repo"

It proposes a config from what it finds and writes nothing before you approve.
NEXT
