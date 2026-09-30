---
name: ship
description: Run the release pipeline end to end - gates, version bump, changelog, push the dev branch, deploy, verify, then the release branch. Use when the user says ship, release, cut a version, push this out, or deploy this change.
---

# Ship

This skill holds the **order and the stop signs**. The project holds the **commands**.

Read `.claude/release.config.json` in the repository root before you run anything.
If that file does not exist, go to § Bootstrap. Do not guess commands.

The `version` section of the same file belongs to the **`versioning`** skill. This skill
calls that one at step 3 and step 8; it never decides a version number itself.

---

## Config contract

```json
{
  "repo": {
    "releaseBranch": "main",
    "devBranch": "dev",
    "appDir": ".",
    "changelogLang": "en"
  },
  "ship": {
    "gates": [
      { "name": "test",  "cmd": "npm test" },
      { "name": "build", "cmd": "npm run build" },
      { "name": "edge",  "cmd": "npm run typecheck:edge", "paths": ["supabase/**"] }
    ],
    "flow": { "devFirst": true, "askBeforeRelease": true },
    "deploy": { "hookSkill": "supabase-ops", "triggerPaths": ["supabase/**"] },
    "verify": { "hookSkill": "verify" },
    "record": { "hookSkill": "bookkeeping" }
  }
}
```

### `repo` — owned by the `versioning` skill

This skill only reads these four. Edit them in one place: the `repo` section.

| Field | Meaning here |
| ---- | ---- |
| `releaseBranch` | The branch step 8 pushes to. `null` is not allowed |
| `devBranch` | The branch step 4 pushes to. `null` means a single-branch repo — see § Single branch |
| `appDir` | Default working directory for every gate |
| `changelogLang` | Language of the changelog entry and of the final report |

### `ship` — owned by this skill

| Field | Meaning |
| ---- | ---- |
| `gates[].name` | Label for the report |
| `gates[].cmd` | The command, run verbatim |
| `gates[].cwd` | Where to run it. Absent means `repo.appDir` |
| `gates[].paths` | Run this gate only when the diff touches these globs. Absent means always |
| `flow.devFirst` | `false` skips steps 4-7 and releases straight from the working branch |
| `flow.askBeforeRelease` | `false` removes the stop at step 8. Only the user may set this |
| `deploy.hookSkill` | Skill that owns deployment. Preferred over `deploy.cmd` |
| `deploy.cmd` | A one-line deploy for a project with no deploy skill |
| `deploy.triggerPaths` | Deploy only when the diff touches these globs. Absent means always |
| `verify.hookSkill` / `verify.cmd` | How to check the deployed result |
| `record.hookSkill` | Skill that owns the project's tracking documents |

Any section that is absent is **skipped silently**. A repo with no deploy step simply has
no `deploy` key.

---

## The pipeline

Run the steps in this order. Do not reorder, do not run two at once.

### 1. Gates

Run every gate whose `paths` match the diff, from its `cwd`.

**Run the `cmd` string verbatim.** Never substitute a command you believe is equivalent
or faster — a project puts a command in this list because a narrower one has already let
a failure through. If a gate fails: **stop**, report the failing output, and change
nothing else.

### 2. Nothing to ship

If the working tree is clean and the branch is already pushed, say so and stop. Do not
bump a version to have something to do.

### 3. Version and changelog

Hand this to the **`versioning`** skill — task *bump the dev version*. Write the
changelog entry in `changelogLang`.

### 4. Commit and push the dev branch

Commit, then push `devBranch`. **Never push `releaseBranch` at this step.**

### 5. Deploy

If `deploy` is configured and the diff touches `deploy.triggerPaths`:

- `deploy.hookSkill` present → load that skill and follow it. It owns the environment
  facts, the flags, and the pre-flight checks.
- only `deploy.cmd` present → run it.
- neither present → **stop and ask the user how this project deploys.**

**Never invent a deploy command.** Do not guess a CLI, a project reference, an
environment name, or a flag. A wrong deploy target is not recoverable by editing a file.

### 6. Verify

Check the deployed result, not the build output. Use `verify.hookSkill` or `verify.cmd`.
Report what you actually observed. If you could not verify, say so and say why.

### 7. Finalize the changelog — before any release push

Delete every "pending", "not deployed", or "to be confirmed" note from the entry.

This order is not cosmetic. A Release body is generated from the changelog section at
push time, and the automation that creates it **skips a Release that already exists**. A
section that still says "pending" when the release branch is pushed becomes the permanent
public Release body, fixable only by hand with `gh release edit`.

### 8. Stop and ask

Unless `flow.askBeforeRelease` is `false`: **stop here.** Report the gate results, the
version, the deploy result, and what verification showed. Ask the user to authorize the
release.

Do not continue on your own reading of "looks good". Step 8 is the only place a human
sees the whole pipeline before it becomes public.

### 9. Release

With the user's authorization, hand this to the **`versioning`** skill — task
*cut a release*. That task strips `-dev.N`, merges into `releaseBranch`, syncs the
branches, and publishes the Release.

### 10. A release-branch push deploys nothing

Pushing `releaseBranch` moves code, not a running service. Whatever step 5 deployed to
the dev environment must be deployed to production **separately**, after the push, and
verified there. Skipping this leaves production running the old code while the changelog
claims otherwise.

### 11. Record

If `record.hookSkill` is set, load it and update the project's tracking documents.

### 12. Report

One short summary in `changelogLang`: gates, version, what deployed where, what you
verified, and anything still unverified.

---

## Single branch

When `devBranch` is `null` or `flow.devFirst` is `false`:

- Steps 4-7 collapse into one push to `releaseBranch`.
- Step 8 still applies. Ask before that push.
- Steps 1, 3, 7, 10, 11, 12 are unchanged.

---

## Bootstrap

Run these steps when the `ship` section does not exist:

1. Read the available commands: `cat package.json` (the `scripts` block), `ls Makefile justfile 2>/dev/null`.
2. Read the branches: `git branch -r | head`.
3. Look for a project skill that owns deployment: `ls .claude/skills/ 2>/dev/null`.
4. Look for a project skill that owns tracking documents, and for the project's `CLAUDE.md`.
5. Propose a `ship` section. **Ask for approval. Write nothing before it.**
6. Leave `deploy` out entirely rather than guessing a deploy command. An absent section
   is skipped; a wrong one deploys to the wrong place.
7. Write the section into `.claude/release.config.json`, then continue with the original task.
