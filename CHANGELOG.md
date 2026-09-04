# Changelog

Version history of this repository. The git tag adds a `v` prefix; the headings below do not.
This file is the source of truth for every GitHub Release body.

---

## 1.3.0 (2026-09-04)

### Features

#### AI / agy_usage_hud
- **The poller is a daemon, not a per-render spawn**: a one-shot fetch triggered from inside
  a render only polls while the TUI redraws, so no render meant no refresh whatever the
  interval constant claimed. A detached `--bg-daemon` now polls on its own cadence and exits
  once no render has stamped its heartbeat for 120 seconds. `--bg-fetch` stays one-shot as the
  loop body.
- **One daemon, arbitrated by the kernel**: the daemon holds `fcntl.flock` for its whole life,
  so the OS admits exactly one poller and releases the lock when that process dies — there is
  no stale-lock rule left to get wrong. Two earlier designs sequenced filesystem calls instead
  and were each measured letting several processes believe they held the lock, because both
  arbitrated on a *path* rather than on the file they had inspected.
- **`Ctx` shows the session's cumulative usage**: window occupancy falls whenever the context
  is compacted, which reads as usage being refunded. The field now sums only the rises, and
  keeps a tally per `session_id` — one cache file serves every agy session on the machine, so
  a single slot would have had two open sessions resetting each other on every render. agy's
  field names do not settle which of its numbers is cumulative — `used_percentage` is derived
  from `total_input_tokens` alone while `current_usage.input_tokens` is two orders larger —
  and summing rises is correct under either reading. A reading of `0` never re-floors a
  session that has already spent tokens, because a partially present field set is
  indistinguishable from a genuine idle zero and re-flooring on it overcounts permanently.
  The window denominator is gone, because cumulative usage has no ceiling; the threshold
  colour still tracks occupancy, so the warning survives.
- **No countdown for an unused window**: the quota API slides an unused window's `resetTime`
  to `now + <window length>` on every poll, so a `0.0%` countdown could never move. It is
  omitted; a deadline that has genuinely passed still renders `0m`.

### Fixes

#### AI / agy_usage_hud
- **Usage stopped moving a few minutes into a session**: an API reading outranked the `stdin`
  payload for only 30 seconds while the failure cooldown was 60, so every transient poll
  failure handed the display back to a payload agy had frozen — and `write_cache` then
  persisted that figure over the polled one. The precedence window is now the staleness
  threshold (600s) and the cooldown is 15s, so the cooldown can never outlast it.
- **The countdown froze again after the earlier anchor fix**: a bucket written by the poller
  records an absolute `resets_at` but no `anchor_reset_in`, so the payload path re-pinned
  `now + reset_in_seconds` on every render. It now reuses the cached absolute deadline when
  the two describe the same window, and re-anchors only beyond a 900-second tolerance.
- **A platform without `fcntl` started a doomed daemon on every render**: the import ran
  before the lock file was created, so nothing existed for the spawn gate to suppress on.

#### Repository
- **Last-updated dates on every published README**: a `> 最後更新：YYYY-MM-DD` line under each
  H1, carrying each file's real last-change date rather than a uniform stamp. `CLAUDE.md` (and
  its two mirrors) now require the date to move with the content in the same commit.
- **`.claude/route.config.json` for `agy_usage_hud`**: `paths.prod` fell back to the plugin
  default `["src/"]`, which this repository does not have, so every builder dispatch here was
  refused.
- **`.gitignore`**: `.claude/routing/` — dispatch telemetry, not documentation.

### Testing
- **98 -> 131 cases**. The new ones spawn real processes: UC-32 races sixteen of them for one
  lock, three rounds, because an eight-process version let a broken implementation pass three
  consecutive runs. TC-59's fixture age moved 120s -> 900s when the precedence window it was
  pinned to was retired; its name and assertions are unchanged.

---

## 1.2.1 (2026-08-29)

### Documentation

#### AI / skill / versioning
- **Semantic rules for each position**: the `version` skill stated the `x.y.z` format but
  never said what each position means. It now carries a table — `x` for a compatibility
  break, `y` for a feature, `z` for a fix or a documentation edit — and the rule that every
  position to the right resets to `0`.
- **Pre-1.0 rule**: while `x` is `0`, a breaking change increases `y`, not `x`. The move to
  `1.0.0` needs the user to declare the contract stable; the skill never decides it alone.
- **Removed a rule with no test**: "bump minor or major only for a large change" gave no
  judgement an agent could apply. The position table replaces it.
- **Naming note**: `x.y.z` and `x.x.x` name the same number. The skill writes `x.y.z` so
  each position can be named on its own.

---

## 1.2.0 (2026-08-29)

### Features

#### AI / skill / versioning (new)
- **`version` skill for Claude Code**: a portable version-and-release skill. The skill holds
  the rules; each project holds its own paths in `.claude/version.config.json`, so one skill
  serves every repository without guessing file names.
- **GitHub Release automation with `gh`**: create a Release, or overwrite a wrong body with
  `gh release edit --notes-file`. The release notes come from the changelog section, so the
  changelog stays the single source of truth.
- **Changelog extractor**: a `python3` block reads one version section. `re.escape` keeps
  `0.9.2` from matching `0.9.20`, and the next version heading stops the scan.
- **Bootstrap flow**: the skill detects version files, changelog, branches, and tag style,
  then proposes a config for approval before it writes anything.
- **README**: install by symlink, update by `git pull`, plus a verification checklist.

#### Repository
- **`CHANGELOG.md` (new)**: version history for the whole repository, backfilled from
  Releases v1.0.0 to v1.1.0.
- **`.claude/version.config.json` (new)**: paths for the `version` skill.
- **Content pipeline**: `site/scripts/sync-content.mjs` now ignores the `skill` folder.
  A skill is a Claude Code asset, not an operations document, and `AI/skill/<name>/README.md`
  sits one level deeper than the two-level rule the site publishes.

---

## 1.1.0 (2026-08-27)

### Features & Enhancements

#### deploy-supabase (v0.8.0+ Compatibility)
- **CLI Options & Non-Interactive Mode**: Full support for CLI arguments and `-y` / `--non-interactive` flag for CI/CD and automated setups.
- **Core Credentials Customization**: Added options to customize or auto-generate secure high-entropy credentials for PostgreSQL (`--db-password`), Studio Dashboard (`--dashboard-user`, `--dashboard-password`), and MinIO/S3 (`--minio-user`, `--minio-password`).
- **Envoy Gateway & Studio Architecture**: Updated to align with Supabase v0.8.0+ stack where Studio is routed through API Gateway (port 8000), and Kong is available as an override.
- **Overrides Expansion**: Support for `kong`, `pg15` (default is PG 17), `caddy`, `nginx`, `s3`, `rustfs`, and `logs` with official `run.sh` tool support.
- **Reverse Proxy**: Support for `-r` / `--reverse-proxy` flag to sanitize external URLs and strip special host ports.
- **Documentation**: Updated README with CLI option reference table, architectural notes, and verification.

#### AI / agy_usage_hud
- **Context Window (CTX)**: Added Context Window quota segment to statusline HUD.

---

## 1.0.1 (2026-08-06)

### Documentation Update

- **deploy-supabase**:
  - Update execution command in documentation to download script first before executing to ensure interactive stdin works reliably.

---

## 1.0.0 (2026-08-06)

### Initial Release: Supabase Self-Hosted Automation Script

- **deploy-supabase**:
  - Interactive bash script for automated deployment of Supabase Self-Hosted on Linux.
  - Multi-tenant and multi-project port offset support.
  - Port collision detection prior to deployment.
  - Docker Compose container name deduplication.
  - Support for official Docker Compose overrides (Caddy, Nginx, MinIO, Logflare, PG17).
  - Integration with documentation site.
