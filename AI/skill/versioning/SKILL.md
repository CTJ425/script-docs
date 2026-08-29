---
name: version
description: Decide the next version number, keep dev and release branches in sync, and publish or update a GitHub Release with gh. Use when you bump a version, cut a release, merge a dev branch into the release branch, write a CHANGELOG entry, or fix a wrong release body.
---

# Version and release

This skill holds the **rules**. The project holds the **paths**.

Read `.claude/version.config.json` in the repository root before you change any file.
If that file does not exist, go to § Bootstrap. Do not guess file paths.

---

## Config contract

```json
{
  "tagPrefix": "",
  "releaseBranch": "main",
  "devBranch": "dev",
  "changelog": "docs/CHANGELOG.md",
  "appDir": ".",
  "syncFiles": [
    { "path": "package.json", "type": "json", "key": "version" },
    { "path": "package-lock.json", "type": "json", "key": "version" },
    { "path": "src/version.ts", "type": "regex", "pattern": "APP_VERSION = '<version>'" },
    { "path": "README.md", "type": "regex", "pattern": "badge/version-<version>-" }
  ],
  "release": { "enabled": true, "draft": false, "latest": true }
}
```

| Field | Meaning |
| ---- | ---- |
| `tagPrefix` | Text before the number in the git tag. Use `""` for no prefix, `"v"` for `v1.2.3` |
| `releaseBranch` | The branch that carries official numbers |
| `devBranch` | The branch that carries `-dev.N` numbers. Use `null` for a single-branch repo |
| `changelog` | Path of the version history file. This file is the source of truth |
| `appDir` | Directory to run `npm` from |
| `syncFiles` | Every file that shows the version. `<version>` marks the number in a `regex` pattern. Use `[]` when no file shows it — then the git tag is the only carrier |
| `release.enabled` | Set to `false` to skip all `gh` steps |

---

## Number format

| Branch | Format | Example |
| ---- | ---- | ---- |
| Release | `x.y.z` | `0.6.48` |
| Dev | `x.y.z-dev.N` | `0.6.48-dev.3` |

Rules:

1. `x.y.z` in a dev number is the **next** official version, not the current one.
2. `N` starts at **1** and increases by 1 for each versioned change on that target.
3. Write `-dev.1`, not `-dev-1` and not `-dev1`.
4. Bump the patch number by default. Bump minor or major only for a large change.
5. Only the release commit removes the `-dev.N` suffix.
6. Never leave the dev branch on a bare official number while work is unfinished.
7. After a release, both branches must show the **same** official number.

---

## Task: read the current version

- `syncFiles` is not empty: read the first entry.
- `syncFiles` is `[]`: read the newest tag — `git tag --sort=-v:refname | head -1`. Remove `tagPrefix`.

---

## Task: bump the dev version

1. Read the current number. See the task above.
2. Calculate the next number by the rules above.
3. Write the new number into **every** file in `syncFiles`.
4. Add a `changelog` entry under the new heading.
5. Verify: `grep -R "<old version>" <each syncFiles path>` returns nothing.

---

## Task: cut a release

1. Confirm the official number. Work at `0.6.48-dev.3` releases as `0.6.48`.
2. Write the official number into every file in `syncFiles`. Remove `-dev.N`.
   Skip this step when `syncFiles` is `[]`.
3. **Finalize the `changelog` section before you push.** Delete every "pending" or
   "not deployed" note. § GitHub Release explains why this order matters.
4. Merge into `releaseBranch` and push.
5. Sync the branches: `git push origin <releaseBranch>:<devBranch>`.
6. Publish the Release. See § GitHub Release.
7. The next versioned change on `devBranch` starts at `(patch + 1)-dev.1`.

---

## GitHub Release

The `changelog` file stays the source of truth. The Release is a mirror that makes
`gh release view <tag>` a cheap lookup.

**Warning: a Release body has no secret-scanning gate.** A public repository blocks a
credential at `git push`, but it publishes a Release body immediately. Paste only the
committed `changelog` section. Never paste logs, cron commands, or function output.

### Extract the notes

Read the section from the changelog into a notes file.

**Do not use `awk` here.** A skill file expands shell positional parameters before the
shell runs the command. An awk whole-line field reference is a positional parameter, so
the loader replaces it with the skill argument text and the pattern match fails.
Use `python3`. Keep every positional parameter out of this file.

```bash
VERSION=0.6.48
CHANGELOG=$(python3 -c "import json;print(json.load(open('.claude/version.config.json'))['changelog'])")

python3 - "$CHANGELOG" "$VERSION" > "/tmp/notes-$VERSION.md" <<'PY'
import re, sys
path, ver = sys.argv[1], sys.argv[2]
head = re.compile(r'^#+ +\[?' + re.escape(ver) + r'\]?([^0-9.]|$)')
nxt  = re.compile(r'^#+ +\[?[0-9]+\.')
out, on = [], False
for line in open(path, encoding='utf-8'):
    if on and nxt.match(line):
        break
    if on:
        out.append(line)
    elif head.match(line):
        on = True
text = re.sub(r'\n*-{3,}\s*$', '', ''.join(out).strip()).strip()
sys.stdout.write(text + '\n')
PY

test -s "/tmp/notes-$VERSION.md" || echo "EMPTY — check the heading format"
```

`re.escape` keeps `0.9.2` from matching `0.9.20`. The next version heading stops the
scan, so trailing sections never leak into the notes.

Always check that the file is not empty before you publish.

### Publish or update

```bash
TAG="$VERSION"          # add tagPrefix if the config sets one

# 1. Does the Release exist?
gh release view "$TAG" --json tagName -q .tagName 2>/dev/null

# 2a. It does not exist — create it.
gh release create "$TAG" \
  --title "$TAG" \
  --notes-file "/tmp/notes-$VERSION.md" \
  --target "$(git rev-parse HEAD)" \
  --latest

# 2b. It exists and the body is wrong — overwrite the body.
gh release edit "$TAG" --notes-file "/tmp/notes-$VERSION.md"

# 3. Confirm.
gh release view "$TAG" | head -20
```

Extra commands:

| Goal | Command |
| ---- | ---- |
| List the last 10 Releases | `gh release list --limit 10` |
| Mark an old Release as not latest | `gh release edit <tag> --latest=false` |
| Turn a draft into a public Release | `gh release edit <tag> --draft=false` |
| Remove a wrong Release | `gh release delete <tag> --cleanup-tag --yes` |

Rules:

- Only official `x.y.z` numbers get a Release. A `-dev.N` number never does.
- The tag must equal `tagPrefix` + the version string. No other form.
- `gh release create` fails if the Release exists. Use `gh release edit` to fix a body.
- An automated workflow that creates Releases usually **skips** existing ones. A body that
  is wrong at push time stays wrong until you run `gh release edit` by hand.

---

## Bootstrap

Run these steps when `.claude/version.config.json` does not exist:

1. Find the files that show a version:
   `grep -RIl --exclude-dir=node_modules --exclude-dir=.git -E '[0-9]+\.[0-9]+\.[0-9]+' README.md package.json src 2>/dev/null | head`
2. Find the changelog: `ls CHANGELOG.md docs/CHANGELOG.md docs/**/CHANGELOG.md 2>/dev/null`
3. Read the branch names: `git branch -r | head`
4. Read the tag style: `git tag --sort=-creatordate | head -3`
5. Show the proposed config to the user. Ask for approval.
6. Write `.claude/version.config.json`. Then continue with the original task.
