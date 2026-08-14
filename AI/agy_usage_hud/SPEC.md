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
   `fetched_at` is within the 30-second precedence window. agy only refreshes
   the payload's `quota` block when a response arrives, so between turns it
   reports figures the poller has already superseded.
2. **Live `stdin` payload**.
3. **Cache fallback** — any bucket in a cache younger than 7 days.

- **Absolute Reset Instants**: `reset_time` is absolute and always wins. A bare
  `reset_in_seconds` is relative to the moment agy *built* the payload, so it is
  anchored once (`resets_at = round(epoch_now + reset_in_seconds)`) and that
  anchor is reused for as long as the payload keeps reporting the same relative
  value. Re-deriving it every render re-pins the deadline to the present, which
  freezes the countdown and stops the window ever rolling over.
- **Rollover Evaluation** (cache path): if `resets_at <= epoch_now`, the window
  has rolled over -> `used_percent = 0.0`, countdown omitted. The payload path
  states the current percentage outright, so a passed deadline only bottoms the
  countdown out at `0m`.
- **Staleness**: a figure resolved from the cache whose `fetched_at` is more
  than 600 seconds old renders with a dim `~` prefix. Without it an expired
  OAuth token or a payload that stopped carrying quota is indistinguishable from
  a genuinely idle account.
- **Model Name Fallback**: If live payload model name is empty/missing, fallback to cached model name if available.

### 4. Context Window Resolution & Formatting
- **Payload Source**: Context window metrics (`used_percentage`, `current_usage.input_tokens`, `total_input_tokens`, `context_window_size`) are parsed directly from the live `stdin` payload.
- **Session-Scoped**: Context window represents local prompt tokens for the active conversation; it is not polled from the remote Quota API.
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
- **TC-57 / TC-59 (API Precedence)**: Verify a recent API bucket outranks the payload, and yields to it once past the precedence window.
- **TC-58 (No Clobber)**: Verify a payload render leaves a recent API bucket intact in the cache.
- **TC-60 / TC-61 (Anchoring)**: Verify an unchanged `reset_in_seconds` reuses its stored anchor, and a changed one re-anchors.
- **TC-62 / TC-63 (Staleness)**: Verify figures nobody confirmed within the staleness threshold render with `~`, and recent ones do not.
- **TC-64 / TC-65 (Failed Fetch)**: Verify a failed `--bg-fetch` writes a complete, re-readable cache carrying `last_api_error` and preserving existing buckets.
- **TC-66 (Expired Token)**: Verify an expired token renders without stderr or delay.

### 4. Test Suite Expansion (Tier 11: In-Process Unit Checks)
- **UC-01**–**UC-13**: ISO-8601 parsing, token expiry, skew window, and background fetch spawning decisions.
- **UC-14**–**UC-18**: Token formatting, boundary validation, context parsing, and rendering ANSI color checks.

### 5. Test Suite Expansion (Tier 12: Context Window Suite)
- **TC-67**–**TC-78**: Context window token formatting (`current_usage` vs `total_tokens`), size abbreviations (`k`, `M`), color thresholds (green/yellow/red), missing/corrupted degradations, and pure ASCII verification.

### 6. Determinism Requirements
- The suite sets `USAGE_HUD_DISABLE_BG_FETCH=1` by default; cases exercising the fetch re-enable it explicitly. No case may depend on a reachable API or a valid token, and none may spawn a process that writes to the user's real cache.
- Time-relative fixtures are built **at execution time**, not when the case list is constructed: a cache whose timestamps predate the preceding cases has already aged by the time it is read.
- Countdown fixtures sit in the middle of the minute band they assert (`mid_band`), so seconds spent running the suite cannot drop the rendered value into the band below.

### 7. Live Quota API Fetch & Background Refresh
- Real-time quota updates directly fetch from `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` using the OAuth token at `~/.gemini/antigravity-cli/antigravity-oauth-token` (overridable via `USAGE_HUD_TOKEN_PATH`).
- Statusline renders instantly using local cache (<10ms).
- When `now - last_api_fetch >= 5` seconds, statusline spawns a non-blocking, detached background subprocess (`--bg-fetch`) to update `usage_hud_cache.json` in ~150ms without hanging prompt render.
- On API error or offline status, `last_api_error` is recorded and no further fetch is spawned for 60 seconds (`API_ERROR_COOLDOWN`), preventing subprocess thrashing.

### 8. OAuth Token Handling
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


