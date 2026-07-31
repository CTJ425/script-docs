# AGY Usage HUD — Spec

## Problem Statement

When running Antigravity CLI (`agy`), the statusline interceptor (`statusline_hud.py`) receives statusline payloads via `stdin` during CLI prompt render events. However, users experience the following issues with real-time usage visibility:

1. **Static Countdowns During Terminal Idle**: When the user is not actively submitting prompts, statusline countdown timers (e.g. `3h11m`) do not update in real-time because `statusline_hud.py` is purely stateless and lacks a time-rolling reference to system time.
2. **Cold-Start Degraded Display (`--%`)**: At CLI startup or during initial authentication phase when the payload carries incomplete or absent quota information, the statusline falls back to `--%` (unknown) rather than showing recent valid usage figures.
3. **Delayed Rollover Detection**: When a quota window expires while idling, the display continues showing expired countdowns until a new live payload triggers, instead of automatically resetting usage to `0.0%`.

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
- Cache schema version: `1`.
- Maximum cache age: `7 days` (`604800 seconds`).
- Future clock skew slack: `300 seconds`.

### 2. Cache Schema Design
```json
{
  "version": 1,
  "saved_at": 1722417300,
  "model": "Gemini 3.6 Flash (High)",
  "quota": {
    "gemini-5h": {
      "used_percent": 0.1,
      "resets_at": 1722428815
    },
    "gemini-weekly": {
      "used_percent": 15.1,
      "resets_at": 1722849108
    },
    "3p-5h": {
      "used_percent": 0.0,
      "resets_at": 1722435328
    },
    "3p-weekly": {
      "used_percent": 0.0,
      "resets_at": 1723023328
    }
  }
}
```

### 3. Bucket Resolution & Time-Rolling Protocol
- **Live Payload Precedence**: Live figures directly from `stdin` override cached figures for present buckets.
- **Cache Precedence**: Missing or unknown live buckets resolve to fresh cached bucket data if cache age `<= 7 days`.
- **Rollover Evaluation**:
  - If `resets_at` is present and `resets_at <= epoch_now`: window has rolled over -> `used_percent = 0.0`, countdown omitted.
  - If `resets_at > epoch_now`: calculate dynamic `reset_in_seconds = int(resets_at - epoch_now)`.
- **Model Name Fallback**: If live payload model name is empty/missing, fallback to cached model name if available.

### 4. Atomic Persistence & Merging
- Cache file writes perform partial merging: live bucket updates merge over existing fresh cached buckets.
- Write process uses atomic write pattern: write to `CACHE_FILE + ".tmp." + pid`, followed by `os.replace()`.
- Writes are skipped if cache payload contents (`model` and `quota` values) have not changed.

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

## Out of Scope

1. **Background Daemon / Network Polling**: No background processes or active HTTP calls to Antigravity API servers.
2. **CLI Binary Modifications**: No modifications to `agy` CLI binary or internal source code.
3. **Multi-User Cache Sharing**: Cache is strictly local to user profile or designated test path.

## Further Notes

- Full backwards compatibility with CLI `stdin` contracts is preserved.
- Output format remains 100% pure ASCII with ANSI color coding.
