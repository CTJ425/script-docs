---
name: versioning
description: Decide the next version number, keep dev and release branches in sync, and publish or update a GitHub Release with gh. Use when you bump a version, cut a release, merge a dev branch into the release branch, write a CHANGELOG entry, or fix a wrong release body.
---

# Versioning and release

This skill holds the **rules**. The project holds the **paths**.

Read `.claude/release.config.json` in the repository root before you change any file.
If that file does not exist, go to § Bootstrap. Do not guess file paths.

> **Older name.** A repo set up before this skill was split may carry
> `.claude/version.config.json` with the `repo` keys at the top level and no `ship`
> section. Read it, work from it, and offer once to rename it to
> `.claude/release.config.json` in the same commit. Never keep both files.

The `ship` section of the same file belongs to the **`ship`** skill. Do not read or
write it here.

---

## Config contract

Every `path` in this file is **relative to the repository root**, never to `appDir`.
`appDir` only says where to run commands.

```json
{
  "repo": {
    "tagPrefix": "",
    "releaseBranch": "main",
    "devBranch": "dev",
    "changelog": "docs/CHANGELOG.md",
    "changelogLang": "en",
    "appDir": "."
  },
  "version": {
    "syncFiles": [
      { "path": "package.json", "type": "npm" },
      { "path": "src/version.ts", "type": "regex", "pattern": "APP_VERSION = '<version>'" },
      { "path": "README.md", "type": "regex", "pattern": "badge/version-<version>-" }
    ],
    "release": { "enabled": true, "publishedBy": "skill", "draft": false, "latest": true }
  }
}
```

### `repo` — shared with the `ship` skill

| Field | Meaning |
| ---- | ---- |
| `tagPrefix` | Text before the number in the git tag. `""` for `1.2.3`, `"v"` for `v1.2.3` |
| `releaseBranch` | The branch that carries official numbers |
| `devBranch` | The branch that carries `-dev.N` numbers. `null` for a single-branch repo |
| `changelog` | Path of the version history file. **This file is the source of truth** |
| `changelogLang` | Language of the changelog entries you write, as a BCP 47 tag (`zh-TW`, `en`). Absent means `en` |
| `appDir` | Directory to run `npm` and other project commands from |

### `version` — owned by this skill

| Field | Meaning |
| ---- | ---- |
| `syncFiles` | Every file that shows the version. `[]` means no file shows it — then the git tag is the only carrier |
| `release.enabled` | `false` skips all `gh` steps |
| `release.publishedBy` | `"skill"` — you create the Release. `"ci"` — a workflow creates it on push and you only confirm and repair it. Absent means `"skill"` |
| `release.draft` | `true` creates the Release as a draft |
| `release.latest` | `false` does not mark the new Release as latest |

### `syncFiles` entry types

| `type` | How to write the version |
| ---- | ---- |
| `npm` | Run `npm version <version> --no-git-tag-version --allow-same-version` in `appDir`. **Use this for `package.json`** |
| `json` | Set the JSON key named by `key` |
| `regex` | Replace the number inside `pattern`, where `<version>` marks the number |

**Never list `package-lock.json` as a `json` entry.** A lockfile holds the number in
both `version` and `packages[""].version`; editing one key leaves the other stale and
`npm ci` then installs a version that disagrees with the app. The `npm` type updates
`package.json` and the lockfile together, which is the only edit that keeps them equal.

---

## Number format

| Branch | Format | Example |
| ---- | ---- | ---- |
| Release | `x.y.z` | `0.6.48` |
| Dev | `x.y.z-dev.N` | `0.6.48-dev.3` |

`x.y.z` and `x.x.x` name the same three-part number. This file writes `x.y.z` so that
each position has its own letter.

### Which position to increase

| Position | Name | Increase it when |
| ---- | ---- | ---- |
| `x` | major | The change breaks compatibility. A user must change something to keep working |
| `y` | minor | The change adds a feature, a subproject, or a command, and stays compatible |
| `z` | patch | The change fixes a defect, edits documentation, or refactors. Behavior stays the same |

When you increase a position, set every position to its right to `0`.
Examples: `1.2.4` → `1.3.0` for a feature; `1.2.4` → `2.0.0` for a break.

**Before version 1.0.0 the rule shifts left.** While `x` is `0`, the public contract is
not stable yet:

- A breaking change increases `y`. It does not increase `x`.
- Everything else increases `z`.
- Move to `1.0.0` only when the user declares the contract stable. Never decide this alone.

Rules:

1. `x.y.z` in a dev number is the **next** official version, not the current one.
2. `N` starts at **1** and increases by 1 for each versioned change on that target.
3. Write `-dev.1`, not `-dev-1` and not `-dev1`.
4. Increase `z` by default. Use the table above when the change is more than a fix.
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
3. Write the new number into **every** file in `syncFiles`, by its `type`.
4. Add a `changelog` entry under the new heading, written in `changelogLang`.
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
   Skip when `devBranch` is `null`.
6. Publish the Release, or confirm the one CI published. See § GitHub Release.
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
CHANGELOG=$(python3 -c "import json;print(json.load(open('.claude/release.config.json'))['repo']['changelog'])")
NOTES=$(mktemp -t "notes-$VERSION.XXXXXX.md")

python3 - "$CHANGELOG" "$VERSION" > "$NOTES" <<'PY'
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

test -s "$NOTES" || echo "EMPTY — check the heading format"
```

`re.escape` keeps `0.9.2` from matching `0.9.20`. The next version heading stops the
scan, so trailing sections never leak into the notes.

`mktemp` keeps two repos releasing at the same time from overwriting each other's notes.
Always check that the file is not empty before you publish.

### When CI publishes it

With `release.publishedBy: "ci"`, a workflow creates the Release on the push to
`releaseBranch`. Do **not** run `gh release create` — you would race the workflow.

1. Wait for the workflow, then read the body: `gh release view "$TAG" | head -20`.
2. Body wrong or missing a section → repair it with `gh release edit` (below).

Such a workflow almost always creates only *missing* Releases and **skips existing
ones**, which is why the changelog has to be final before the push. Once the Release
exists, the only fix is by hand.

**A CI-created tag is not in your clone.** The workflow creates it on the server, so your
local repository never has it until you `git fetch --tags`. This bites during a history
rewrite: `git push --force --tags` pushes the tags you hold and silently leaves the
CI-created ones pointing at commits that no longer exist. After any rewrite, list the
remote's tags and check each one resolves in the new history:

```bash
git ls-remote --tags origin | grep -v '\^{}' | while read sha ref; do
  git cat-file -e "$sha^{commit}" 2>/dev/null || echo "STALE: ${ref#refs/tags/} $sha"
done
```

Re-point a stale tag through the rewrite's own mapping —
`grep "^<old-sha> " .git/filter-repo/commit-map` gives the new one — then force-push that
single ref. Check the newest tag first: it is the one most likely to be stale, and its
Release is the one people open.

### Publish or update

```bash
TAG="$VERSION"          # prepend tagPrefix if the config sets one

# 1. Does the Release exist?
gh release view "$TAG" --json tagName -q .tagName 2>/dev/null

# 2a. It does not exist — create it.
gh release create "$TAG" \
  --title "$TAG" \
  --notes-file "$NOTES" \
  --target "$(git rev-parse HEAD)" \
  --latest

# 2b. It exists and the body is wrong — overwrite the body.
gh release edit "$TAG" --notes-file "$NOTES"

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

Run these steps when `.claude/release.config.json` does not exist:

1. Find the files that show a version:
   `grep -RIl --exclude-dir=node_modules --exclude-dir=.git -E '[0-9]+\.[0-9]+\.[0-9]+' README.md package.json src 2>/dev/null | head`
2. Find the changelog: `ls CHANGELOG.md docs/CHANGELOG.md docs/**/CHANGELOG.md 2>/dev/null`
3. Read the branch names: `git branch -r | head`
4. Read the tag style: `git tag --sort=-creatordate | head -3`
5. Read the language of the existing changelog entries and set `changelogLang` to match.
6. Show the proposed config to the user. **Ask for approval. Write nothing before it.**
7. Write `.claude/release.config.json` with the `repo` and `version` sections. Leave the
   `ship` section out — the `ship` skill bootstraps its own. Then continue with the
   original task.
