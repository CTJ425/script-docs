# AGY Usage HUD — Spec

## Problem Statement

When running Antigravity CLI (`agy`), the statusline interceptor (`statusline_hud.py`) receives statusline payloads via `stdin` during CLI prompt render events. However, users experience the following issues with real-time usage visibility:

1. **Static Countdowns During Terminal Idle**: When the user is not actively submitting prompts, statusline countdown timers (e.g. `3h11m`) do not update in real-time because `statusline_hud.py` is purely stateless and lacks a time-rolling reference to system time.
2. **Cold-Start Degraded Display (`--%`)**: At CLI startup or during initial authentication phase when the payload carries incomplete or absent quota information, the statusline falls back to `--%` (unknown) rather than showing recent valid usage figures.
3. **Delayed Rollover Detection**: When a quota window expires while idling, the display continues showing expired countdowns until a new live payload triggers, instead of automatically resetting usage to `0.0%`.
4. **Figures Frozen for the Rest of the Session**: The HUD keeps rendering numbers that stopped moving, with nothing to distinguish them from live ones. Three causes compound:
   - the OAuth access token expires roughly an hour into a session, after which every poll returns `401` and is swallowed;
   - the `stdin` payload overwrites the poller's fresher figures in the cache, so live refresh has no effect even while the token is valid;
   - `reset_in_seconds` is re-anchored to the present on every render, pinning the countdown to its initial value and preventing the window from ever rolling over.

## Solution

Upgrade `statusline_hud.py` to incorporate a **Local Cold-Start Cache** and **Dynamic Time-Rolling Engine**:

1. **Dynamic Time-Rolling**: Convert incoming `reset_in_seconds` into absolute epoch timestamps (`resets_at = epoch_now + reset_in_seconds`) stored in the disk cache. Compute remaining duration dynamically against current system time on every render invocation.
2. **Cold-Start & Bucket Fallback**: Persist model name and quota bucket usage to `~/.gemini/antigravity-cli/usage_hud_cache.json` (overridable via `USAGE_HUD_CACHE`). When live payload fields are missing or authenticating, fallback to fresh cached values.
3. **Automatic Window Rollover**: If `current_epoch >= resets_at`, automatically treat the expired window as rolled over (`0.0%` used, countdown cleared).
4. **Zero-Crash Resiliency**: All cache reading, parsing, and atomic writing (`.tmp` + rename) operations fail silently on error without affecting stdout rendering or exit code (always 0).

## User Stories

1. As a CLI user, I want the statusline reset countdown to dynamically reflect the actual remaining time based on system clock on every render, so that I have accurate countdown visibility even during prompt idle periods.
2. As a CLI user, I want the statusline to display my last known quota usage immediately upon starting a new `agy` session, so that I don't see `--%` unknown indicators while the CLI is initializing or authenticating.
3. As a CLI user, I want quota buckets that pass their reset timestamp to automatically roll over to `0.0%`, so that I know my quota has reset without needing to wait for a new API request payload.
4. As a CLI user, I want different model families (`gemini-*` vs `3p-*`) to merge seamlessly in the local cache, so that switching models does not wipe out cached usage history for other model families.
5. As a CLI user, I want any disk cache corruption or permission failure to be handled silently, so that my terminal prompt never crashes or outputs error tracebacks.
6. As a developer, I want to override the cache location via an environment variable (`USAGE_HUD_CACHE`), so that unit tests can execute in complete isolation without mutating the user's home directory.

## Implementation Decisions

### 1. Module Structure & Cache Path
- Primary interceptor script: `statusline_hud.py` (Python 3 standard library only).
- Cache file path: `os.environ.get("USAGE_HUD_CACHE")` falling back to `~/.gemini/antigravity-cli/usage_hud_cache.json`.
- Cache schema version: `2`.
- Maximum cache age: `7 days` (`604800 seconds`).
- Future clock skew slack: `300 seconds`.
- Staleness threshold: `600 seconds`.
- API precedence window: `30 seconds`.

### 2. Cache Schema Design
```json
{
  "version": 2,
  "saved_at": 1722417300,
  "last_api_fetch": 1722417300.4,
  "model": "Gemini 3.6 Flash (High)",
  "quota": {
    "gemini-5h": {
      "used_percent": 0.1,
      "resets_at": 1722428815,
      "source": "api",
      "fetched_at": 1722417300.4
    },
    "gemini-weekly": {
      "used_percent": 15.1,
      "resets_at": 1722849108,
      "source": "payload",
      "fetched_at": 1722417298.1,
      "anchor_reset_in": 431793
    }
  }
}
```

Version 2 adds per-bucket provenance. Version 1 caches are discarded rather than
migrated: they record no source for any bucket, and a single API poll rebuilds
the file.

| Field | Meaning |
| --- | --- |
| `source` | `api` (polled) or `payload` (arrived on `stdin`) |
| `fetched_at` | When that figure was last confirmed by its source |
| `anchor_reset_in` | The `reset_in_seconds` that `resets_at` was derived from, present only when the payload carried no absolute `reset_time` |
| `last_api_error` | Epoch of the last failed poll; absent once one succeeds |

### 3. Bucket Resolution & Time-Rolling Protocol

Resolution order per window, first match wins:

1. **Recent API reading** — a cached bucket with `source: "api"` whose
   `fetched_at` is within the precedence window, which is deliberately the same
   600 seconds as the staleness threshold. agy only refreshes the payload's
   `quota` block when a response arrives, so between turns it reports figures
   the poller has already superseded — and the payload carries no timestamp of
   its own, so there is nothing to compare its age against. A window shorter
   than `API_ERROR_COOLDOWN` guaranteed the opposite of the intent: every
   transient poll failure handed the display back to a frozen payload, and
   `write_cache` then persisted that figure over the polled one. The cooldown
   is 15 seconds precisely so it can never outlast this window.
2. **Live `stdin` payload**.
3. **Cache fallback** — any bucket in a cache younger than 7 days.

- **Absolute Reset Instants**: `reset_time` is absolute and always wins. A bare
  `reset_in_seconds` is relative to the moment agy *built* the payload, so it is
  anchored once (`resets_at = round(epoch_now + reset_in_seconds)`) and that
  anchor is reused for as long as the payload keeps reporting the same relative
  value. Re-deriving it every render re-pins the deadline to the present, which
  freezes the countdown and stops the window ever rolling over.
- **A cached API deadline anchors the payload too.** A bucket written by the
  poller records an absolute `resets_at` but no `anchor_reset_in`, so the anchor
  match above cannot fire and the payload path would re-pin to the present on
  every render — the same freeze, re-entering through the API path. The payload
  therefore reuses the cached absolute deadline whenever it is within
  `ANCHOR_MATCH_TOLERANCE_SECONDS` (900) of the payload's own
  `reset_in_seconds`, and re-anchors only beyond that. The tolerance separates
  the two cases cleanly: a lagging payload drifts by minutes, while a payload
  describing a *different* window differs by the window length (5h or 7d).
- **Rollover Evaluation** (cache path): if `resets_at <= epoch_now`, the window
  has rolled over -> `used_percent = 0.0`, countdown omitted. The payload path
  states the current percentage outright, so a passed deadline only bottoms the
  countdown out at `0m`.
- **No countdown at zero usage**: the quota API slides an unused window's
  `resetTime` to `now + <window length>` on every poll, so a `0.0%` countdown
  can never move and reads as a broken clock. It is omitted. A deadline that has
  genuinely passed (`reset_in_seconds <= 0`) still renders `0m`, because that is
  real information rather than a sliding placeholder.
- **Staleness**: a figure resolved from the cache whose `fetched_at` is more
  than 600 seconds old renders with a dim `~` prefix. Without it an expired
  OAuth token or a payload that stopped carrying quota is indistinguishable from
  a genuinely idle account.
- **Model Name Fallback**: If live payload model name is empty/missing, fallback to cached model name if available.

### 4. Context Window Resolution & Formatting
- **Payload Source**: Context window metrics (`used_percentage`, `current_usage.input_tokens`, `total_input_tokens`, `context_window_size`) are parsed directly from the live `stdin` payload; it is not polled from the remote Quota API.
- **`Ctx` is the session's cumulative usage, not the window's occupancy.** Occupancy
  falls whenever the context is compacted, which reads as usage being refunded.
- **Only rises are counted, and the tally is keyed by `session_id`.** agy's field
  names do not settle which of its numbers is which: in the captured `idle`
  payload `used_percentage` equals `total_input_tokens / context_window_size`
  exactly, while `current_usage.input_tokens` is two orders larger; a live
  capture had `current_usage: null` and every token field at `0`. Summing only
  the rises is correct under either reading — a source that is already
  cumulative never falls, and one that is occupancy falls only on a compaction,
  which consumed nothing. The session key is `session_id`, then
  `conversation_id`, then `""`.
- **An absent observation is not an observation of zero.** When
  `parse_context_window` yields nothing the field renders `Ctx --` and the
  stored tally is left untouched; feeding a spurious `0` in would make the next
  real reading count twice.
- **A tally per session, because one cache serves them all.** `context` is a map
  keyed by session id, each entry holding `cumulative_tokens`, `last_observed`
  and `last_seen`. A single slot keyed by one id meant two agy sessions open at
  once reset each other's counter on every render — the ordinary case on a
  machine with more than one terminal, not an edge case. The map is capped at
  `MAX_TRACKED_SESSIONS` (8) by `last_seen`, so it cannot grow without bound.
- **`accumulate_context` assumes a non-negative observation.** Its only caller
  clamps with `max(0, used_tokens)` in `parse_context_window`. A negative value
  would land in the compaction branch and set a negative floor, so the next real
  reading would overcount by the glitch's size. The clamp stays at the caller
  rather than being repeated here: this file does not carry error handling for
  paths that do not exist, and a future caller is the thing to fix, not this
  function.
- **The session being rendered is never evicted.** `last_seen` has one-second
  resolution, so sessions rendering in the same second tie, and breaking that
  tie by map order dropped the very session whose render triggered the write —
  restarting its tally. Eviction chooses among the *other* entries only.
- **A zero observation never re-floors a session that has already spent
  tokens.** `parse_context_window` yields `used_tokens = 0` from a partially
  present field set, which is indistinguishable from a genuine idle zero.
  Re-flooring on it makes the next real reading count from zero a second time,
  and the overcount is permanent. A compaction drops to a smaller *non-zero*
  occupancy; a drop to exactly `0` mid-session is missing data.
- **The tally must be carried by every writer.** `base_cache` and `write_cache`
  both rebuild the cache from a fixed key set, so either one dropping `context`
  resets the counter every few seconds — and no unit test would see it, because
  both writers look correct in isolation.
- **The background fetch re-reads `context` immediately before writing.** It
  snapshots the cache, spends up to three seconds on the network, then writes;
  carrying the snapshot's `context` would silently discard whatever a render
  stored in between. Quota buckets tolerate that because the next poll
  re-derives them — a lost context delta has no second source and is gone.
- **No denominator.** Cumulative usage has no ceiling, so `Ctx 1.4M/1M` would
  divide two different quantities. The threshold colour still tracks **window
  occupancy**, so the field keeps warning about running out of context even
  though its number no longer measures it.
- **Formatting Protocol**:
  - `< 1,000`: Direct integer (e.g. `146`, `500`).
  - `1,000 ~ 99,999`: Formatted with `k` and up to one decimal if fractional (e.g. `19.5k`, `20k`).
  - `100,000 ~ 999,999`: Integer `k` (e.g. `200k`, `128k`).
  - `>= 1,000,000`: Formatted as `M` (e.g. `1048576` $\to$ `1M`, `2000000` $\to$ `2M`).
- **Color Thresholds**:
  - `< 70.0%`: Green (`\033[1;32m`).
  - `70.0% ~ 89.9%`: Yellow (`\033[1;33m`).
  - `>= 90.0%`: Red (`\033[1;31m`).
- **Fallback**: Missing or uninitialized context window renders dim `Ctx --`.

### 5. Atomic Persistence & Merging
- Cache file writes perform partial merging: live bucket updates merge over existing fresh cached buckets.
- Write process uses atomic write pattern: write to `CACHE_FILE + ".tmp." + pid`, followed by `os.replace()`.
- Writes are skipped if cache payload contents (`model` and `quota` values) have not changed — except when a bucket's `fetched_at` has aged past half the staleness threshold, so a figure the payload keeps confirming does not age into looking stale.
- **A payload never displaces an API reading inside its precedence window.** The render path prefers the API figure and the write path leaves it in place; without both halves the poller writes a fresh figure that the next render overwrites, which is what silently disabled live refresh.
- **Every write is a complete cache.** `version`, `saved_at`, `model` and `quota` are always present, including on the background fetch's failure path. A partial write (a bare `{"last_api_fetch": ...}`) is rejected by `read_cache` for having no version, losing the bookkeeping the write existed for and respawning the fetch on every render.

## Testing Decisions

### 1. Test Seam & Isolation
- Seam: External process execution seam (`subprocess.Popen` / `subprocess.run`).
- Invocation: `test_statusline.py` executes `statusline_hud.py` passing test payloads via `stdin`.
- Isolation: All cache-related tests set `USAGE_HUD_CACHE` to isolated temporary directory paths (`tempfile.mkdtemp()`).

### 2. Test Suite Expansion (Tier 9: Cold-Start Cache & Time-Rolling)
- **TC-48 (Cold-Start Write)**: Verify valid payload creates cache file with expected structure and timestamps.
- **TC-49 (Cold-Start Read Fallback)**: Verify empty/authenticating payload reads cached values and renders model + percentages.
- **TC-50 (Dynamic Time-Rolling)**: Verify countdown calculation reflects time elapsed between payload receipt and rendering.
- **TC-51 (Window Rollover)**: Verify cached bucket with past `resets_at` renders `0.0%` without countdown.
- **TC-52 (Expired Cache Ignored)**: Verify cache older than 7 days is ignored and renders `--%`.
- **TC-53 (Bucket Merging)**: Verify `gemini-*` payload does not wipe out cached `3p-*` buckets.
- **TC-54 (Fault Tolerance)**: Verify corrupted JSON or unwritable cache directory degrades silently to normal rendering with exit code 0.

### 3. Test Suite Expansion (Tier 10: Live API Precedence & Provenance)
- **TC-57 / TC-59 (API Precedence)**: Verify a recent API bucket outranks the payload, and yields to it once past the precedence window. TC-59's fixture age moved from 120s to 900s when that window widened to the staleness threshold; its name and assertions are unchanged, because the contract it states did not change — only the number the window is set to.
- **TC-58 (No Clobber)**: Verify a payload render leaves a recent API bucket intact in the cache.
- **TC-60 / TC-61 (Anchoring)**: Verify an unchanged `reset_in_seconds` reuses its stored anchor, and a changed one re-anchors.
- **TC-62 / TC-63 (Staleness)**: Verify figures nobody confirmed within the staleness threshold render with `~`, and recent ones do not.
- **TC-64 / TC-65 (Failed Fetch)**: Verify a failed `--bg-fetch` writes a complete, re-readable cache carrying `last_api_error` and preserving existing buckets.
- **TC-66 (Expired Token)**: Verify an expired token renders without stderr or delay.

### 4. Test Suite Expansion (Tier 11: In-Process Unit Checks)
- **UC-01**–**UC-13**: ISO-8601 parsing, token expiry, skew window, and background fetch spawning decisions.
- **UC-14**–**UC-18**: Token formatting, boundary validation, context parsing, and rendering ANSI color checks.
- **UC-19 / UC-20**: `file_age` reports `None` for a missing path; `touch_file` creates what is missing and `file_age` then dates it from now.
- **UC-21 / UC-22**: A daemon lock newer than `DAEMON_LOCK_STALE_SECONDS` suppresses the spawn; one older than it does not.
- **UC-23**: A render stamps the heartbeat even when every spawn gate says no.
- **UC-24 / UC-25**: The constant invariants — the precedence window equals the staleness threshold and outlasts the error cooldown, and the lock threshold outlasts the longest poll iteration.
- **UC-26 / UC-27**: `anchor_live_resets_at` reuses a cached absolute deadline within the tolerance, and re-anchors beyond it.
- **UC-28**–**UC-31**: Daemon lock ownership via `flock` — a free lock is claimed, a lock held by a live process is refused, one left by a dead process needs no age heuristic, and releasing hands it over.
- **UC-32**: Sixteen processes released from a shared timestamp produce exactly one lock winner, three rounds running. Written after a weaker eight-process version let a broken implementation pass three consecutive runs.
- **UC-33**: Without `fcntl` the lock file is still created, so the spawn gate suppresses and renders stop starting a daemon that dies instantly.
- **UC-34**–**UC-37**: `accumulate_context` — a fresh session, a rise, a drop that adds nothing but re-floors, and a rise after a drop.
- **UC-38**: Two concurrent sessions keep separate tallies.
- **UC-39**: A cumulative total renders without a window denominator.
- **UC-40 / UC-41**: A zero observation does not re-floor a session that has spent tokens, and a real reading after one is not double counted.
- **UC-42**: Stored tallies stay `int` rather than drifting into `float`.
- **UC-43 / UC-45**: The session map is capped at `MAX_TRACKED_SESSIONS`, including when every `last_seen` ties.
- **UC-44**: Eviction never drops the session being rendered.

### 5. Test Suite Expansion (Tier 12: Context Window Suite)
- **TC-67**–**TC-78**: Context window token formatting (`current_usage` vs `total_tokens`), size abbreviations (`k`, `M`), color thresholds (green/yellow/red), missing/corrupted degradations, and pure ASCII verification.

### 6. Test Suite Expansion (Tier 13: Live Refresh)
- **TC-79 (Precedence)**: Verify a 300s-old API bucket beats a disagreeing payload and is still recorded as `source: "api"` in the cache afterwards.
- **TC-80 (API-Anchored Countdown)**: Verify a 700s-old API bucket carrying `resets_at` but no `anchor_reset_in` anchors the payload's relative countdown, so the rendered value reflects the elapsed time instead of the payload's raw figure.
- **TC-81 (Out-of-Tolerance Re-Anchor)**: Verify a payload whose deadline differs from the cached one by more than the tolerance re-anchors to the present.
- **TC-82 / TC-83 (Zero-Usage Countdown)**: Verify a `0.0%` window renders no countdown, and a window with usage still renders one.
- **TC-84 (Terminal Zero)**: Verify a `0.0%` window whose deadline has already passed still renders `0m`.

### 7. Determinism Requirements
- The suite sets `USAGE_HUD_DISABLE_BG_FETCH=1` by default; cases exercising the fetch re-enable it explicitly. No case may depend on a reachable API or a valid token, and none may spawn a process that writes to the user's real cache.
- Time-relative fixtures are built **at execution time**, not when the case list is constructed: a cache whose timestamps predate the preceding cases has already aged by the time it is read.
- Countdown fixtures sit in the middle of the minute band they assert (`mid_band`), so seconds spent running the suite cannot drop the rendered value into the band below.

### 8. Live Quota API Fetch & Background Refresh
- Real-time quota updates directly fetch from CloudCode `retrieveUserQuotaSummary` API using the OAuth token at `~/.gemini/antigravity-cli/antigravity-oauth-token` (overridable via `USAGE_HUD_TOKEN_PATH`). The active endpoint (e.g. `daily-cloudcode-pa.googleapis.com` or `cloudcode-pa.googleapis.com`) is auto-detected via `detect_quota_api_url()` from `cli.log` or overridden via `USAGE_HUD_QUOTA_API_URL` (default: `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary`).
- Statusline renders instantly using local cache (<10ms).
- **Polling is a daemon, not a per-render spawn.** A one-shot fetch triggered
  from inside a render only polls while the TUI is redrawing: no render, no
  refresh, whatever the interval constant claims. A render instead spawns a
  detached `--bg-daemon` process once, which then polls every
  `API_REFRESH_INTERVAL` (5s) on its own, independent of the render cadence.
- `--bg-fetch` still exists and is still one-shot; it is the body the daemon's
  loop calls, and the failure-path tests drive it directly.
- Two files live beside the cache: `<cache>.lock` and `<cache>.render`, stamped
  by every render.
- **`flock` decides who runs, not a heuristic.** The daemon holds
  `fcntl.flock(fd, LOCK_EX | LOCK_NB)` on the lock file for its whole life, so
  the kernel admits exactly one daemon and releases the lock the instant that
  process dies. There is no stale-lock rule to get wrong. Two earlier designs
  arbitrated by sequencing filesystem calls — a check-then-act touch, then an
  atomic-rename steal — and both were measured letting several processes each
  believe they owned the lock, because both arbitrated on a *path* rather than
  on the file they had inspected. `fcntl` is imported inside the function, not
  at module scope: a platform without it must cost the daemon, never the
  statusline.
- The lock file is never unlinked, and must not be deleted by hand. The lock
  belongs to the inode, so removing the file does not release it — it only lets
  the next process create a fresh inode and lock that instead, which is how two
  daemons would end up polling at once.
- `maybe_trigger_bg_fetch` still skips the spawn when the lock's mtime is newer
  than `DAEMON_LOCK_STALE_SECONDS` (30, chosen to exceed the longest possible
  iteration: `API_ERROR_COOLDOWN` plus the 3s fetch timeout). That gate is now
  only an optimisation — it avoids spawning a process that would immediately
  lose the `flock` — and correctness no longer depends on it.
- The daemon exits when `<cache>.render` has not been stamped for
  `DAEMON_IDLE_EXIT_SECONDS` (120) — nobody is watching the HUD — or after
  `DAEMON_MAX_LIFETIME_SECONDS` (6h), whichever comes first. The heartbeat is
  stamped on every render that reaches the spawn gate, including renders the
  gate turns away, or a daemon would starve itself while polls are on cooldown.
- On API error or offline status, `last_api_error` is recorded; the render-path
  gate suppresses spawns and the daemon backs off for 15 seconds
  (`API_ERROR_COOLDOWN`) instead of hammering a failing endpoint.

### 9. OAuth Token Handling
- The token file is re-read on **every** fetch, so a token agy has renewed is picked up on the next poll with no restart.
- The `expiry` field is checked before spawning: an expired token returns a certain `401 UNAUTHENTICATED`, so there is nothing worth spawning a process for. A `30`-second skew keeps a request from being issued in the last moments of validity.
- **The HUD never mints its own token.** Exchanging the `refresh_token` requires agy's OAuth client secret, which does not belong in this repo. The consequence is deliberate and bounded: while the token is dead the figures go stale, and the `~` prefix says so, until agy rewrites the file.
- Timestamps are parsed with a shared ISO-8601 reader that truncates sub-second digits past the sixth — agy emits nanoseconds (`...:47.446579281+08:00`), which `datetime.fromisoformat` rejects before Python 3.11.

## Out of Scope

1. **CLI Binary Modifications**: No modifications to `agy` CLI binary or internal source code.
2. **Multi-User Cache Sharing**: Cache is strictly local to user profile or designated test path.

## Further Notes

- Full backwards compatibility with CLI `stdin` contracts is preserved.
- Output format remains 100% pure ASCII with ANSI color coding.


