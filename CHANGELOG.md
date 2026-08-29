# Changelog

Version history of this repository. The git tag adds a `v` prefix; the headings below do not.
This file is the source of truth for every GitHub Release body.

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
