#!/usr/bin/env python3
import sys
import json
import math
import os
import re
import time
from datetime import datetime, timezone
from typing import NamedTuple, Optional, Tuple

# ANSI Color definitions
COLOR_RESET = "\033[0m"
COLOR_GREEN = "\033[1;32m"
COLOR_YELLOW = "\033[1;33m"
COLOR_RED = "\033[1;31m"
COLOR_CYAN = "\033[1;36m"
COLOR_DIM = "\033[2m"

# Rendered for a window whose usage is unknown. Deliberately NOT "0.0%": a
# green zero reads as "plenty of quota left", which is a claim we cannot make
# when the payload did not carry the figure at all.
UNKNOWN_SEGMENT = f"{COLOR_DIM}--%{COLOR_RESET}"
UNKNOWN_CTX = f"{COLOR_DIM}--{COLOR_RESET}"
SEPARATOR = f" {COLOR_DIM}|{COLOR_RESET} "
FALLBACK_LINE = f"Ctx {UNKNOWN_CTX}{SEPARATOR}5h {UNKNOWN_SEGMENT}{SEPARATOR}Wk {UNKNOWN_SEGMENT}"

# Prefixes a figure that no live source confirmed recently. Without it a frozen
# HUD -- an expired OAuth token, a payload that stopped carrying quota -- is
# indistinguishable from a genuinely idle account, which is exactly how a stale
# reading gets mistaken for the truth.
STALE_SEGMENT_PREFIX = f"{COLOR_DIM}~{COLOR_RESET}"

# Long enough for the longest display_name observed so far,
# "Gemini 3.6 Flash (High)" (23 chars); at 20 it was chopped mid-word.
MODEL_MAX_LEN = 24

# Bucket names, after the family prefix is stripped. First entry of each tuple
# is the canonical name; the rest are tolerated aliases.
FIVE_H_NAMES = ("5h", "rolling_5h", "rolling5h", "five_hour", "5_hour")
WEEKLY_NAMES = ("weekly", "week", "7d", "seven_days")

# Antigravity meters Gemini models and third-party models against separate
# quota pools, exposed side by side as "gemini-5h" and "3p-5h". Only the pool
# the active model draws from is worth showing.
GEMINI_FAMILY = "gemini"
THIRD_PARTY_FAMILY = "3p"

# Cache settings
CACHE_FILE = os.environ.get(
    "USAGE_HUD_CACHE",
    os.path.expanduser("~/.gemini/antigravity-cli/usage_hud_cache.json")
)
# Version 2 adds per-bucket provenance (source / fetched_at / anchor_reset_in).
# Version 1 caches are discarded rather than migrated: they carry no provenance,
# so every bucket in them would have to be guessed at, and one API poll rebuilds
# the whole file anyway.
CACHE_VERSION = 2
CACHE_MAX_AGE_SECONDS = 7 * 86400  # 7 days
CACHE_FUTURE_SLACK_SECONDS = 300  # 300 seconds slack for clock skew
# The context map holds one entry per agy session sharing this cache file.
# Without a cap it grows for as long as the machine keeps opening new
# sessions, so the least recently touched entries are dropped once this
# many are tracked.
MAX_TRACKED_SESSIONS = 8
DEFAULT_TOKEN_FILE = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
QUOTA_API_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"
API_REFRESH_INTERVAL = 5.0  # seconds between background API polls

# A cached figure older than this is rendered with STALE_SEGMENT_PREFIX.
STALE_AFTER_SECONDS = 600.0

# An API reading outranks the stdin payload for as long as it is not stale.
# The payload carries no timestamp of its own -- agy refreshes its quota
# block only when a response arrives -- so a short window here means a
# transient poll failure lets a frozen payload displace a figure the poller
# actually confirmed, and write_cache then persists that regression.
API_RESULT_MAX_AGE_SECONDS = STALE_AFTER_SECONDS

# Cooldown after an API fetch failure. Must stay well below
# API_RESULT_MAX_AGE_SECONDS, or a transient failure would let a stale
# payload win over an API reading that is still fresh enough to trust.
API_ERROR_COOLDOWN = 15.0

# How far a payload's implied deadline may drift from a cached API resets_at
# and still be treated as the same window (see anchor_live_resets_at).
ANCHOR_MATCH_TOLERANCE_SECONDS = 900.0

# A lock older than this belongs to a dead daemon. Must exceed the longest
# possible run_daemon iteration (API_ERROR_COOLDOWN plus the 3s fetch
# timeout), or a live daemon mid-iteration would look stale and get a
# duplicate spawned alongside it.
DAEMON_LOCK_STALE_SECONDS = 30.0

# Holds the fd of the flock'd daemon lock file while this process owns it.
# The lock exists for exactly as long as this fd stays open; it must not be
# closed or garbage collected while the daemon runs.
_daemon_lock_fd: Optional[int] = None

# No render for this long: nobody is watching the HUD, so the daemon exits
# instead of polling forever in the background.
DAEMON_IDLE_EXIT_SECONDS = 120.0

# Hard ceiling on a daemon's lifetime, in case the idle check is ever starved.
DAEMON_MAX_LIFETIME_SECONDS = 6 * 3600

# Treat the OAuth token as dead slightly before its stated expiry, so a request
# cannot be issued in the last moments of its validity and land after it.
TOKEN_EXPIRY_SKEW_SECONDS = 30.0

# Bucket provenance, recorded per cache entry.
SOURCE_API = "api"
SOURCE_PAYLOAD = "payload"


def get_token_path() -> str:
    """Returns the effective OAuth token file path dynamically."""
    return os.environ.get("USAGE_HUD_TOKEN_PATH", DEFAULT_TOKEN_FILE)


class BucketResult(NamedTuple):
    """Domain representation of a resolved quota bucket."""
    used_percent: float
    reset_in_seconds: Optional[int]
    resets_at: Optional[int]
    is_live: bool
    family: str
    canonical_name: str
    source: str = SOURCE_PAYLOAD
    is_stale: bool = False
    anchor_reset_in: Optional[int] = None


class ContextResult(NamedTuple):
    """Domain representation of parsed context window usage."""
    used_tokens: int
    total_tokens: int
    used_percent: float


def safe_float(value) -> Optional[float]:
    """Safely converts value to float, returning None if invalid or NaN/Inf."""
    if value is None:
        return None
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    except (ValueError, TypeError, OverflowError):
        return None


_SUBSECOND_OVERFLOW = re.compile(r"^(.*\.\d{6})\d+(.*)$")


def parse_iso8601(value) -> Optional[float]:
    """Converts an ISO-8601 timestamp to epoch seconds, or None if unusable.

    Sub-second digits past the sixth are dropped: agy emits nanoseconds
    ("...:47.446579281+08:00"), which fromisoformat rejects before Python 3.11.
    A timestamp without an offset is read as UTC, matching the API's own "Z".
    """
    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    overflow = _SUBSECOND_OVERFLOW.match(text)
    if overflow:
        text = overflow.group(1) + overflow.group(2)

    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def sanitize_ascii(text) -> str:
    """Strips non-ASCII characters (ord(c) >= 128) from a string.

    Non-strings yield "" rather than str(text): the payload's "model" is an
    object, and stringifying it would render a Python repr into the statusline.
    """
    if not isinstance(text, str):
        return ""
    return "".join(c for c in text if ord(c) < 128)


def clean_model_name(text: str) -> str:
    """Strips non-ASCII and truncates model name to MODEL_MAX_LEN."""
    return sanitize_ascii(text)[:MODEL_MAX_LEN].strip()


def format_duration(seconds) -> str:
    """Formats seconds into ASCII duration string (e.g. 2h10m or 3d04h)."""
    val = safe_float(seconds)
    if val is None:
        return "--"
    total_seconds = int(val)

    if total_seconds <= 0:
        return "0m"

    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60

    if days > 0:
        return f"{days}d{hours:02d}h"
    elif hours > 0:
        return f"{hours}h{minutes:02d}m"
    else:
        return f"{minutes}m"


def format_token_count(tokens: Optional[int]) -> str:
    """Formats integer token count into human-readable ASCII string (e.g. 500, 19.5k, 200k, 1M)."""
    val = safe_float(tokens)
    if val is None or val < 0:
        return "0"
    num = int(val)
    if num < 1000:
        return str(num)
    if num >= 1_000_000 or num >= 1048576:
        # Check standard binary 1M / 2M (1048576 / 2097152) or decimal 1M
        if abs(num - 1048576) < 50000 or abs(num - 1_000_000) < 50000:
            return "1M"
        if abs(num - 2097152) < 50000 or abs(num - 2_000_000) < 50000:
            return "2M"
        m = num / 1_000_000.0
        if round(m, 1) == float(int(round(m, 1))):
            return f"{int(round(m, 1))}M"
        return f"{m:.1f}M"
    if num >= 100_000:
        k = round(num / 1000.0)
        return f"{int(k)}k"
    k_val = num / 1000.0
    rounded_1d = round(k_val, 1)
    if rounded_1d == float(int(rounded_1d)):
        return f"{int(rounded_1d)}k"
    return f"{rounded_1d:.1f}k"


def parse_context_window(data: dict) -> Optional[ContextResult]:
    """Parses context_window from payload, returning ContextResult or None."""
    if not isinstance(data, dict):
        return None
    cw = data.get("context_window")
    if not isinstance(cw, dict):
        return None

    size_raw = safe_float(cw.get("context_window_size"))
    if size_raw is None or size_raw <= 0:
        return None
    total_tokens = int(size_raw)

    used_tokens = None
    cur_usage = cw.get("current_usage")
    if isinstance(cur_usage, dict):
        inp = safe_float(cur_usage.get("input_tokens"))
        out = safe_float(cur_usage.get("output_tokens"))
        if inp is not None or out is not None:
            used_tokens = int((inp or 0.0) + (out or 0.0))

    if used_tokens is None:
        tot_inp = safe_float(cw.get("total_input_tokens"))
        tot_out = safe_float(cw.get("total_output_tokens"))
        if tot_inp is not None or tot_out is not None:
            used_tokens = int((tot_inp or 0.0) + (tot_out or 0.0))

    used_pct_raw = safe_float(cw.get("used_percentage", cw.get("used_percent")))
    if used_tokens is None:
        if used_pct_raw is not None:
            used_tokens = int(round(total_tokens * (used_pct_raw / 100.0)))

    if used_tokens is None:
        return None

    used_tokens = max(0, used_tokens)
    if used_pct_raw is not None:
        used_percent = round(max(0.0, min(100.0, used_pct_raw)), 1)
    else:
        pct = (used_tokens / total_tokens) * 100.0 if total_tokens > 0 else 0.0
        used_percent = round(max(0.0, min(100.0, pct)), 1)

    return ContextResult(
        used_tokens=used_tokens,
        total_tokens=total_tokens,
        used_percent=used_percent
    )


def accumulate_context(session_id, observed, previous, now) -> dict:
    """Folds one more observation into the map of all tracked sessions.

    `previous` is the whole map of `{session_id: {cumulative_tokens,
    last_observed, last_seen}}` -- one cache file serves every agy session on
    the machine, so a single tally would have two open sessions resetting
    each other's counter on every render. Returns a new map; `previous` is
    never mutated, and every other session's entry is carried through
    untouched.

    Sums only the rises. This is correct whichever of agy's ambiguous token
    fields `observed` came from: a field that is already cumulative never
    falls, so its deltas sum to itself; a field that is window occupancy
    falls only on a compaction, which consumed nothing.

    A zero (or negative) observation on a session that has already spent
    tokens is treated as missing data rather than a genuine idle zero --
    re-flooring on it would make the next real reading count from zero
    again, a permanent overcount.
    """
    base = previous if isinstance(previous, dict) else {}
    result = dict(base)

    observed_val = safe_float(observed)
    observed_int = int(observed_val) if observed_val is not None else 0

    entry = base.get(session_id)
    if not isinstance(entry, dict):
        entry = None

    if entry is None:
        floor = max(0, observed_int)
        new_entry = {
            "cumulative_tokens": floor,
            "last_observed": floor,
            "last_seen": int(now),
        }
    else:
        prev_cumulative_val = safe_float(entry.get("cumulative_tokens"))
        prev_cumulative = int(prev_cumulative_val) if prev_cumulative_val is not None else 0
        prev_observed_val = safe_float(entry.get("last_observed"))
        prev_observed = int(prev_observed_val) if prev_observed_val is not None else 0

        if observed_int <= 0 and prev_cumulative > 0:
            # Missing data, not a compaction: keep the existing floor so the
            # next real reading is not double counted from zero.
            new_entry = {
                "cumulative_tokens": prev_cumulative,
                "last_observed": prev_observed,
                "last_seen": int(now),
            }
        elif observed_int >= prev_observed:
            new_entry = {
                "cumulative_tokens": prev_cumulative + (observed_int - prev_observed),
                "last_observed": observed_int,
                "last_seen": int(now),
            }
        else:
            # A compaction: the window shrank without spending anything, so
            # only the floor moves.
            new_entry = {
                "cumulative_tokens": prev_cumulative,
                "last_observed": observed_int,
                "last_seen": int(now),
            }

    result[session_id] = new_entry

    if len(result) > MAX_TRACKED_SESSIONS:
        def last_seen_of(item):
            entry = item[1]
            if not isinstance(entry, dict):
                return -1.0
            val = safe_float(entry.get("last_seen"))
            return val if val is not None else -1.0

        # session_id is the one whose render triggered this write; last_seen
        # has one-second resolution, so it can tie with other sessions and an
        # eviction sort would drop it on the very render that just touched it.
        # Excluding it from the sort pool guarantees it survives regardless
        # of ties, while the other entries still compete on last_seen.
        others = [item for item in result.items() if item[0] != session_id]
        kept_others = sorted(others, key=last_seen_of, reverse=True)[:MAX_TRACKED_SESSIONS - 1]
        result = dict(kept_others)
        result[session_id] = new_entry

    return result


def render_context_window(ctx: Optional[ContextResult]) -> str:
    """Renders the Context Window segment (e.g. Ctx 1.4M or Ctx --).

    No "/total" denominator: ctx.used_tokens is the session's cumulative
    usage, which has no ceiling, so a ratio against the window size would
    compare two different quantities. The colour still tracks window
    occupancy (ctx.used_percent), not the cumulative figure -- the number
    says how much the session has spent, the colour still warns about
    running out of window.
    """
    if ctx is None:
        return f"Ctx {UNKNOWN_CTX}"
    used_str = format_token_count(ctx.used_tokens)
    color = get_color_code(ctx.used_percent)
    return f"Ctx {color}{used_str}{COLOR_RESET}"


def get_color_code(percent) -> str:
    """Returns ANSI color code based on percentage threshold."""
    val = safe_float(percent)
    pct = 0.0 if val is None else val

    if pct >= 90.0:
        return COLOR_RED
    elif pct >= 70.0:
        return COLOR_YELLOW
    else:
        return COLOR_GREEN


def extract_model_name(data: dict) -> str:
    """Returns the model's display name, or "" when the payload has none.

    "model" is an object ({"id", "display_name", "effort"}) and is null until
    the CLI finishes authenticating. A bare string is still accepted in case
    the shape changes back.
    """
    if not isinstance(data, dict):
        return ""
    raw = data.get("active_model")
    if raw is None:
        raw = data.get("model")

    if isinstance(raw, dict):
        for key in ("display_name", "displayName", "name", "id"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        return ""
    if isinstance(raw, str):
        return raw.strip()
    return ""


def model_family(model_name: str) -> str:
    """Maps a model name to the quota pool it draws from."""
    return GEMINI_FAMILY if "gemini" in model_name.lower() else THIRD_PARTY_FAMILY


def select_bucket(quota: dict, names, family: str):
    """Finds the quota bucket for one window, preferring the active model's pool.

    Buckets are keyed "<family>-<window>", e.g. "gemini-5h". Resolution order:
    the active model's family, then an unprefixed key, then any other family
    (sorted, so the choice is deterministic rather than dict-order luck).
    """
    if not isinstance(quota, dict):
        return None

    lowered = {}
    for key, val in quota.items():
        if isinstance(key, str) and isinstance(val, dict):
            lowered[key.lower()] = val

    for name in names:
        item = lowered.get(f"{family}-{name}")
        if item is not None:
            return item

    for name in names:
        item = lowered.get(name)
        if item is not None:
            return item

    name_set = set(names)
    for key in sorted(lowered):
        if "-" in key and key.rsplit("-", 1)[1] in name_set:
            return lowered[key]
    return None


def parse_item(item):
    """Parses one window, or returns None when the payload carries no usable
    usage figure for it (missing bucket, missing field, garbage value). None
    means 'unknown' and is rendered as '--%', never as 0%."""
    if not isinstance(item, dict):
        return None

    used_pct = None
    for key in ("used_percent", "used_percentage"):
        if item.get(key) is not None:
            used_pct = item[key]
            break

    if used_pct is None:
        rem_frac = safe_float(item.get("remaining_fraction"))
        if rem_frac is None:
            return None
        used_pct = (1.0 - rem_frac) * 100.0

    val = safe_float(used_pct)
    if val is None:
        return None
    used_pct = round(max(0.0, min(100.0, val)), 1)

    reset_sec_raw = item.get("reset_in_seconds", item.get("reset_in", 0))
    reset_sec_val = safe_float(reset_sec_raw)
    reset_sec = int(reset_sec_val) if reset_sec_val is not None else 0

    # reset_time is an absolute instant, reset_in_seconds is relative to whenever
    # agy built the payload -- which is not this render. Carry both; the caller
    # prefers the absolute one precisely because it does not rot.
    reset_epoch = parse_iso8601(item.get("reset_time"))

    return {
        "used_percent": used_pct,
        "reset_in_seconds": reset_sec,
        "resets_at": int(reset_epoch) if reset_epoch is not None else None
    }


def get_cache_path() -> str:
    """Returns the effective cache file path."""
    return os.environ.get("USAGE_HUD_CACHE", CACHE_FILE)


def daemon_lock_path() -> str:
    """Path to the lock file a running daemon holds beside the cache."""
    return get_cache_path() + ".lock"


def render_heartbeat_path() -> str:
    """Path to the file each render stamps, so a daemon can tell it is still watched."""
    return get_cache_path() + ".render"


def touch_file(path: str) -> None:
    """Creates path if missing and updates its mtime to now. Never raises."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a"):
            pass
        os.utime(path, None)
    except Exception:
        pass


def file_age(path: str, now: float) -> Optional[float]:
    """Seconds since path's mtime, or None if it is missing or unreadable."""
    try:
        return now - os.path.getmtime(path)
    except Exception:
        return None


def acquire_daemon_lock() -> bool:
    """Claims the daemon lock via fcntl.flock. Returns True only if we own it.

    The kernel arbitrates flock, so there is no stale lock and no age
    heuristic to get wrong: a lock left by a process that has exited is
    released by the kernel the moment that process dies.
    """
    global _daemon_lock_fd
    if _daemon_lock_fd is not None:
        return True

    lock_path = daemon_lock_path()
    try:
        os.makedirs(os.path.dirname(lock_path), exist_ok=True)
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o644)
    except Exception:
        return False

    # Import fcntl only after the lock file exists: on a platform without
    # fcntl this import fails, but the file's mtime still lands on disk for
    # maybe_trigger_bg_fetch's spawn gate to read. Reordering this back to
    # before os.open would silently restore a spawn-per-render loop.
    try:
        import fcntl

        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        os.close(fd)
        return False

    try:
        os.ftruncate(fd, 0)
        os.write(fd, str(os.getpid()).encode("utf-8"))
    except Exception:
        pass

    _daemon_lock_fd = fd
    return True


def release_daemon_lock() -> None:
    """Releases the held flock by closing its fd. Never raises."""
    global _daemon_lock_fd
    if _daemon_lock_fd is None:
        return
    try:
        os.close(_daemon_lock_fd)
    except Exception:
        pass
    _daemon_lock_fd = None


def read_cache() -> Optional[dict]:
    """Reads disk cache safely. Returns dict or None."""
    try:
        cache_path = get_cache_path()
        if not os.path.isfile(cache_path):
            return None
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        if data.get("version") != CACHE_VERSION:
            return None
        return data
    except Exception:
        return None


def cache_is_fresh(cache: dict, now: float) -> bool:
    """Checks if cache exists and is within 7 days age limit."""
    if not isinstance(cache, dict):
        return False
    saved_at = safe_float(cache.get("saved_at"))
    if saved_at is None:
        return False
    age = now - saved_at
    return -CACHE_FUTURE_SLACK_SECONDS <= age <= CACHE_MAX_AGE_SECONDS


def cached_bucket(cache: dict, family: str, canonical_name: str, names: tuple = None) -> Optional[dict]:
    """Looks up a cached bucket key (e.g. gemini-5h) matching target family, or alias fallback."""
    if not isinstance(cache, dict):
        return None
    quota = cache.get("quota")
    if not isinstance(quota, dict):
        return None
    key = f"{family}-{canonical_name}".lower()
    bucket = quota.get(key)
    if isinstance(bucket, dict):
        return bucket
    if names:
        item = select_bucket(quota, names, family)
        if isinstance(item, dict):
            return item
    return None


def entry_timestamp(entry, cache) -> Optional[float]:
    """When a cached bucket was last confirmed by a source.

    Falls back to the cache-wide saved_at for entries written before per-bucket
    provenance existed, or by a path that did not record it.
    """
    if isinstance(entry, dict):
        fetched_at = safe_float(entry.get("fetched_at"))
        if fetched_at is not None:
            return fetched_at
    if isinstance(cache, dict):
        return safe_float(cache.get("saved_at"))
    return None


def anchor_live_resets_at(parsed_live: dict, cached_item, now: float) -> Tuple[Optional[int], Optional[int]]:
    """Absolute reset instant for a payload bucket, plus the anchor to persist.

    reset_time is absolute, so it always wins. reset_in_seconds is only
    meaningful relative to the moment agy built the payload: re-deriving
    now + reset_in_seconds on every render re-pins the deadline to the present,
    so the countdown freezes at its initial value and the window can never roll
    over. Anchor it once instead, and keep that anchor for as long as the
    payload keeps reporting the same relative value.
    """
    absolute = parsed_live.get("resets_at")
    if absolute is not None:
        return int(absolute), None

    reset_sec = parsed_live.get("reset_in_seconds") or 0
    if reset_sec <= 0:
        return None, None

    if isinstance(cached_item, dict):
        previous_anchor = safe_float(cached_item.get("anchor_reset_in"))
        previous_resets_at = safe_float(cached_item.get("resets_at"))
        if (previous_anchor is not None
                and previous_resets_at is not None
                and int(previous_anchor) == int(reset_sec)):
            return int(previous_resets_at), int(reset_sec)

        # The cache may hold an absolute deadline from the poller with no
        # matching anchor (an API entry never records anchor_reset_in). The
        # poller's own resets_at is the better source, so reuse it whenever it
        # describes the same window as the payload -- a lagging payload drifts
        # by minutes, while a payload describing a different window differs by
        # the window length (5h or 7d), so a tolerance well under that
        # separates the two cleanly.
        if previous_resets_at is not None:
            drift = abs((previous_resets_at - now) - reset_sec)
            if drift <= ANCHOR_MATCH_TOLERANCE_SECONDS:
                return int(previous_resets_at), int(reset_sec)

    # Rounded: truncating loses up to a second of now, which is enough to render
    # an exactly-3600s payload as 59m.
    return int(round(now + reset_sec)), int(reset_sec)


def bucket_from_cache_entry(entry: dict, family: str, canonical_name: str, now: float,
                            is_live: bool, is_stale: bool) -> Optional[BucketResult]:
    """Builds a BucketResult from a cached entry, applying window rollover."""
    val = safe_float(entry.get("used_percent"))
    if val is None:
        return None
    used_pct = round(max(0.0, min(100.0, val)), 1)
    source = entry.get("source") if entry.get("source") in (SOURCE_API, SOURCE_PAYLOAD) else SOURCE_PAYLOAD

    resets_at_val = safe_float(entry.get("resets_at"))
    if resets_at_val is None:
        return BucketResult(
            used_percent=used_pct,
            reset_in_seconds=None,
            resets_at=None,
            is_live=is_live,
            family=family,
            canonical_name=canonical_name,
            source=source,
            is_stale=is_stale
        )

    resets_at_int = int(resets_at_val)
    if resets_at_int <= now:
        # Window rolled over: the figure describes a window that no longer
        # exists, so it is 0.0% with nothing left to count down to.
        return BucketResult(
            used_percent=0.0,
            reset_in_seconds=None,
            resets_at=None,
            is_live=is_live,
            family=family,
            canonical_name=canonical_name,
            source=source,
            is_stale=is_stale
        )

    return BucketResult(
        used_percent=used_pct,
        reset_in_seconds=int(round(resets_at_int - now)),
        resets_at=resets_at_int,
        is_live=is_live,
        family=family,
        canonical_name=canonical_name,
        source=source,
        is_stale=is_stale
    )


def resolve_bucket(data: dict, family: str, names: tuple, cache: dict, now: float) -> Optional[BucketResult]:
    """Resolves one usage window: recent API reading, then live payload, then cache."""
    canonical_name = names[0]  # "5h" or "weekly"

    cached_item = None
    if cache_is_fresh(cache, now):
        cached_item = cached_bucket(cache, family, canonical_name, names=names)
    cached_at = entry_timestamp(cached_item, cache)

    # 1. A recent API reading outranks the payload. agy refreshes the payload's
    #    quota block only when a response arrives, so between turns it reports
    #    figures the poller has already superseded -- and it used to overwrite
    #    them in the cache too, which made the poller pointless.
    if (isinstance(cached_item, dict)
            and cached_item.get("source") == SOURCE_API
            and cached_at is not None
            and now - cached_at <= API_RESULT_MAX_AGE_SECONDS):
        api_result = bucket_from_cache_entry(
            cached_item, family, canonical_name, now, is_live=True, is_stale=False
        )
        if api_result is not None:
            return api_result

    # 2. Live stdin payload.
    if isinstance(data, dict):
        quota = data.get("quota", {})
        live_item = select_bucket(quota, names, family)
        if live_item is None:
            live_item = select_bucket(data, names, family)
        parsed_live = parse_item(live_item)
        if parsed_live is not None:
            resets_at, anchor = anchor_live_resets_at(parsed_live, cached_item, now)
            # The payload states the current percentage outright, so unlike the
            # cache path a passed deadline does not zero it -- only the
            # countdown bottoms out, via format_duration.
            # Rounded, not truncated: anchoring drops now's sub-second part, and
            # truncating here would drop another, turning 1h00m into 59m.
            reset_display = int(round(resets_at - now)) if resets_at is not None else 0
            return BucketResult(
                used_percent=parsed_live["used_percent"],
                reset_in_seconds=reset_display,
                resets_at=resets_at,
                is_live=True,
                family=family,
                canonical_name=canonical_name,
                source=SOURCE_PAYLOAD,
                is_stale=False,
                anchor_reset_in=anchor
            )

    # 3. Cache fallback. Nothing confirmed this recently, so say so.
    if not isinstance(cached_item, dict):
        return None

    is_stale = cached_at is None or (now - cached_at) > STALE_AFTER_SECONDS
    return bucket_from_cache_entry(
        cached_item, family, canonical_name, now, is_live=False, is_stale=is_stale
    )


def resolve_model_name(data: dict, cache: dict, now: float) -> str:
    """Returns model display name, trying live payload first, then fresh cache."""
    raw_model = extract_model_name(data)
    model_name = clean_model_name(raw_model)
    if model_name:
        return model_name

    if cache_is_fresh(cache, now):
        cached_model = cache.get("model")
        if isinstance(cached_model, str) and cached_model.strip():
            return clean_model_name(cached_model)

    return ""


def atomic_write_json(file_path: str, data: dict):
    """Atomically writes dictionary as JSON to file_path via temporary file with cleanup."""
    cache_dir = os.path.dirname(file_path)
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)

    tmp_file = f"{file_path}.tmp.{os.getpid()}"
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_file, file_path)
    finally:
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except Exception:
                pass


def is_cache_equivalent(previous_cache: dict, next_cache: dict) -> bool:
    """Checks if new cache content is functionally equivalent to previous cache."""
    if not isinstance(previous_cache, dict) or not isinstance(next_cache, dict):
        return False
    if previous_cache.get("model") != next_cache.get("model"):
        return False

    previous_quota = previous_cache.get("quota")
    next_quota = next_cache.get("quota")
    if not isinstance(previous_quota, dict) or not isinstance(next_quota, dict):
        return previous_quota == next_quota

    if set(previous_quota.keys()) != set(next_quota.keys()):
        return False

    for key, next_item in next_quota.items():
        previous_item = previous_quota.get(key)
        if not isinstance(previous_item, dict) or not isinstance(next_item, dict):
            return False
        if previous_item.get("used_percent") != next_item.get("used_percent"):
            return False

        previous_resets_at = previous_item.get("resets_at")
        next_resets_at = next_item.get("resets_at")
        if previous_resets_at != next_resets_at:
            if previous_resets_at is None or next_resets_at is None:
                return False
            if abs(float(previous_resets_at) - float(next_resets_at)) > 3:
                return False

    return True


def read_oauth_token() -> Optional[dict]:
    """Reads agy's OAuth token file, or None when absent/unreadable/malformed."""
    try:
        token_path = get_token_path()
        if not os.path.isfile(token_path):
            return None
        with open(token_path, "r", encoding="utf-8") as f:
            token_data = json.load(f)
        return token_data if isinstance(token_data, dict) else None
    except Exception:
        return None


def token_access_token(token_data) -> Optional[str]:
    """Returns the bearer token out of the token file, or None."""
    if not isinstance(token_data, dict):
        return None
    inner = token_data.get("token")
    if not isinstance(inner, dict):
        return None
    access_token = inner.get("access_token")
    if isinstance(access_token, str) and access_token:
        return access_token
    return None


def token_is_usable(token_data, now: float) -> bool:
    """True when the token file holds a bearer token that has not expired yet.

    We deliberately do not mint a replacement from the refresh_token: that needs
    agy's OAuth client secret, which has no business being in this repo. agy
    rewrites this file whenever it refreshes and every fetch re-reads it, so the
    HUD recovers on its own. Until then, checking the expiry here is what keeps
    us from spawning a process every few seconds to collect a certain 401 -- and
    is what lets the caller mark the figures stale instead of showing a frozen
    number that still looks live.
    """
    if token_access_token(token_data) is None:
        return False
    inner = token_data.get("token")
    expiry = parse_iso8601(inner.get("expiry")) if isinstance(inner, dict) else None
    if expiry is None:
        # No expiry recorded: let the request itself be the judge.
        return True
    return now < expiry - TOKEN_EXPIRY_SKEW_SECONDS


def cache_needs_touch(cache: dict, now: float) -> bool:
    """True when a bucket's fetched_at is old enough to need re-stamping.

    Skipping a write because nothing changed is what keeps the cache quiet, but
    a figure the payload keeps confirming would then age into looking stale. Let
    an unchanged entry through occasionally so its timestamp stays honest.
    """
    if not isinstance(cache, dict):
        return False
    quota = cache.get("quota")
    if not isinstance(quota, dict):
        return False
    for entry in quota.values():
        if not isinstance(entry, dict):
            continue
        fetched_at = safe_float(entry.get("fetched_at"))
        if fetched_at is None or now - fetched_at > STALE_AFTER_SECONDS / 2:
            return True
    return False


def fetch_live_quota_from_api() -> Optional[dict]:
    """Fetches real-time usage quota from Google Cloud Code PA API directly using OAuth token."""
    try:
        token_data = read_oauth_token()
        access_token = token_access_token(token_data)
        if access_token is None or not token_is_usable(token_data, time.time()):
            return None

        import urllib.request

        req = urllib.request.Request(
            QUOTA_API_URL,
            data=b"{}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "User-Agent": "antigravity/1.1.8"
            }
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            raw_res = resp.read().decode("utf-8")
            data = json.loads(raw_res)

        quota = {}
        groups = data.get("groups", [])
        if not isinstance(groups, list):
            return None

        for group in groups:
            if not isinstance(group, dict):
                continue
            buckets = group.get("buckets", [])
            if not isinstance(buckets, list):
                continue
            for b in buckets:
                if not isinstance(b, dict):
                    continue
                bid = b.get("bucketId")
                rem_frac = safe_float(b.get("remainingFraction"))
                reset_time_str = b.get("resetTime")
                if not isinstance(bid, str) or rem_frac is None:
                    continue
                used_pct = round(max(0.0, min(100.0, (1.0 - rem_frac) * 100.0)), 1)
                reset_epoch = parse_iso8601(reset_time_str)
                quota[bid.lower()] = {
                    "used_percent": used_pct,
                    "resets_at": int(reset_epoch) if reset_epoch is not None else None
                }
        return quota if quota else None
    except Exception:
        return None


def base_cache(existing_cache, now: float) -> dict:
    """A complete cache dict seeded from existing_cache.

    Every field the schema requires is filled in here. Writing a partial dict
    (a bare {"last_api_fetch": ...}) produces a file read_cache rejects for
    having no version, which loses the very bookkeeping the write was for and
    leaves the fetch to be retried on every single render.
    """
    seed = existing_cache if isinstance(existing_cache, dict) else {}
    quota = seed.get("quota")
    next_cache = {
        "version": CACHE_VERSION,
        "saved_at": int(now),
        "model": seed.get("model") if isinstance(seed.get("model"), str) else "",
        "quota": dict(quota) if isinstance(quota, dict) else {}
    }
    for carried in ("last_api_fetch", "last_api_error", "context"):
        if seed.get(carried) is not None:
            next_cache[carried] = seed[carried]
    return next_cache


def _refresh_context_before_write(next_cache: dict) -> None:
    """Re-reads the cache's `context` block right before a daemon write.

    `next_cache["context"]` was carried from the snapshot taken before the
    network fetch, which can take up to a few seconds. A render's own update
    to the tally in that window has no other source of truth -- unlike quota
    buckets, which the next poll re-derives from the API regardless of what
    gets written here -- so writing the stale snapshot back would silently
    erase it. Re-reading immediately before the write narrows that loss
    window from the fetch's whole duration to the gap between two adjacent
    statements.
    """
    fresh_cache = read_cache()
    if isinstance(fresh_cache, dict) and fresh_cache.get("context") is not None:
        next_cache["context"] = fresh_cache["context"]


def do_background_fetch():
    """Background entry point: fetches live quota and updates cache atomically."""
    try:
        now = time.time()
        cache_path = get_cache_path()
        existing_cache = read_cache()
        next_cache = base_cache(existing_cache, now)

        live_quota = fetch_live_quota_from_api()
        if not live_quota:
            # Record the failure so the render path can back off for
            # API_ERROR_COOLDOWN instead of respawning us every few seconds.
            next_cache["last_api_fetch"] = now
            next_cache["last_api_error"] = now
            _refresh_context_before_write(next_cache)
            atomic_write_json(cache_path, next_cache)
            return

        for key, entry in live_quota.items():
            entry["source"] = SOURCE_API
            entry["fetched_at"] = now
            next_cache["quota"][key] = entry

        next_cache["last_api_fetch"] = now
        next_cache.pop("last_api_error", None)
        _refresh_context_before_write(next_cache)
        atomic_write_json(cache_path, next_cache)
    except Exception:
        pass


def run_daemon():
    """Persistent poller: keeps do_background_fetch running on a cadence.

    --bg-fetch is one-shot and only ever runs from inside a render, so with no
    render there is no poll. This loop is spawned once and keeps polling on
    its own until nobody is watching (no fresh render heartbeat) or it hits
    its lifetime ceiling. Wrapped so the daemon can never raise: it is
    detached and its stderr goes to /dev/null anyway.
    """
    try:
        started = time.time()
        lock_path = daemon_lock_path()
        if not acquire_daemon_lock():
            return
        try:
            while True:
                do_background_fetch()  # already writes last_api_error on failure
                touch_file(lock_path)

                if time.time() - started > DAEMON_MAX_LIFETIME_SECONDS:
                    break

                heartbeat_age = file_age(render_heartbeat_path(), time.time())
                if heartbeat_age is None or heartbeat_age > DAEMON_IDLE_EXIT_SECONDS:
                    break

                cache = read_cache()
                # last_api_error is only ever set alongside a failing fetch and
                # popped on the next success, so its mere presence means the
                # last attempt (not a successful one) is the newest thing on
                # record: back off instead of hammering a failing endpoint.
                last_error = safe_float(cache.get("last_api_error")) if isinstance(cache, dict) else None
                if last_error is not None:
                    time.sleep(API_ERROR_COOLDOWN)
                else:
                    time.sleep(API_REFRESH_INTERVAL)
        finally:
            release_daemon_lock()
    except Exception:
        pass


def maybe_trigger_bg_fetch(cache: Optional[dict], now: float) -> bool:
    """Spawns a non-blocking background fetch when one is due.

    Returns whether a process was started, so the decision can be asserted on
    without having to observe a detached child.
    """
    if os.environ.get("USAGE_HUD_DISABLE_BG_FETCH") == "1":
        return False

    # Stamped on every render that reaches here, spawning or not: a daemon
    # started earlier reads this to decide whether anyone is still watching,
    # and skipping the stamp on cooldown renders would starve it.
    touch_file(render_heartbeat_path())

    # A daemon already holds the lock and is polling on its own cadence, so
    # spawning another one here would just duplicate its work.
    lock_age = file_age(daemon_lock_path(), now)
    if lock_age is not None and lock_age <= DAEMON_LOCK_STALE_SECONDS:
        return False

    last_fetch = safe_float(cache.get("last_api_fetch") if isinstance(cache, dict) else None) or 0.0
    if now - last_fetch < API_REFRESH_INTERVAL:
        return False

    # Back off after a failure. Without this the constant was decorative and a
    # failing API was retried at the full poll rate, one process per render.
    last_error = safe_float(cache.get("last_api_error") if isinstance(cache, dict) else None)
    if last_error is not None and now - last_error < API_ERROR_COOLDOWN:
        return False

    # An expired token yields a guaranteed 401, so there is nothing to spawn
    # for. Re-reading the file here is also how the HUD notices agy renewing it.
    if not token_is_usable(read_oauth_token(), now):
        return False

    import subprocess
    try:
        cmd = [sys.executable, os.path.abspath(__file__), "--bg-daemon"]
        env = dict(os.environ)
        env["USAGE_HUD_DISABLE_BG_FETCH"] = "1"
        subprocess.Popen(
            cmd,
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env
        )
        return True
    except Exception:
        return False


def write_cache(resolved_model: str, resolved_buckets: dict, cache: dict, now: float,
                 context_block: Optional[dict] = None):
    """Safely updates disk cache with live buckets, model info and context.

    context_block is the freshly accumulated session map for this render, or
    None when there was nothing new to fold in (parse_context_window returned
    None). It forces a write even when the buckets and model are unchanged:
    accumulate_context updates last_seen (and usually last_observed) on every
    observation, so skipping the write here would silently drop that update
    on the next background fetch.
    """
    try:
        cache_path = get_cache_path()
        fresh_disk_cache = read_cache()
        usable_cache = fresh_disk_cache if cache_is_fresh(fresh_disk_cache, now) else (cache if cache_is_fresh(cache, now) else None)

        new_quota = {}
        if usable_cache and isinstance(usable_cache.get("quota"), dict):
            new_quota.update(usable_cache["quota"])

        # Update live buckets in cache
        has_updates = False
        for window_key, item in resolved_buckets.items():
            if not isinstance(item, BucketResult) or not item.is_live:
                continue
            # A bucket resolved from the API is already in the cache verbatim;
            # rewriting it here would only re-stamp it with a payload's
            # provenance.
            if item.source == SOURCE_API:
                continue

            fam = item.family or GEMINI_FAMILY
            canonical = item.canonical_name or window_key
            key = f"{fam}-{canonical}".lower()

            # Never let a payload figure displace an API reading that is still
            # inside its precedence window: the poller is the fresher source,
            # and clobbering it here is what silently disabled live refresh.
            previous = new_quota.get(key)
            if isinstance(previous, dict) and previous.get("source") == SOURCE_API:
                previous_at = entry_timestamp(previous, usable_cache)
                if previous_at is not None and now - previous_at <= API_RESULT_MAX_AGE_SECONDS:
                    continue

            has_updates = True
            bucket_entry = {
                "used_percent": item.used_percent,
                "source": SOURCE_PAYLOAD,
                "fetched_at": now
            }
            if item.resets_at is not None:
                bucket_entry["resets_at"] = item.resets_at
            if item.anchor_reset_in is not None:
                bucket_entry["anchor_reset_in"] = item.anchor_reset_in
            new_quota[key] = bucket_entry

        model_to_save = resolved_model or (usable_cache.get("model") if usable_cache else "")

        # A new context_block always needs writing, even when nothing else
        # changed: it is not reflected in is_cache_equivalent below, so
        # without this a quiet render would drop it right back on the floor.
        if (not has_updates and context_block is None
                and not (usable_cache is None and (new_quota or model_to_save))):
            return

        next_cache = {
            "version": CACHE_VERSION,
            "saved_at": int(now),
            "model": model_to_save,
            "quota": new_quota
        }
        for carried in ("last_api_fetch", "last_api_error"):
            if usable_cache and usable_cache.get(carried) is not None:
                next_cache[carried] = usable_cache[carried]

        if context_block is not None:
            next_cache["context"] = context_block
        elif usable_cache and usable_cache.get("context") is not None:
            next_cache["context"] = usable_cache["context"]

        if (context_block is None
                and usable_cache
                and is_cache_equivalent(usable_cache, next_cache)
                and not cache_needs_touch(usable_cache, now)):
            return

        atomic_write_json(cache_path, next_cache)
    except Exception:
        pass


def render_window(label: str, item: Optional[BucketResult]) -> str:
    """Renders one usage window, or the '--%' unknown marker when item is None."""
    if item is None:
        return f"{label} {UNKNOWN_SEGMENT}"

    pct = item.used_percent
    col = get_color_code(pct)
    mark = STALE_SEGMENT_PREFIX if item.is_stale else ""
    reset_sec = item.reset_in_seconds
    # The API slides an unused window's resetTime to now + the window length,
    # so a 0%-used countdown never moves and reads as broken. Suppress it only
    # while it is still counting down: a deadline that has genuinely passed
    # (reset_sec <= 0) is real information, not a sliding placeholder.
    if reset_sec is not None and not (pct == 0.0 and reset_sec > 0):
        rst = format_duration(reset_sec)
        return f"{label} {mark}{col}{pct:.1f}%{COLOR_RESET} {COLOR_DIM}({rst}){COLOR_RESET}"
    return f"{label} {mark}{col}{pct:.1f}%{COLOR_RESET}"


def render_statusline(data: dict) -> str:
    """Renders pure ASCII statusline string, with cache & time rolling."""
    if not isinstance(data, dict):
        data = {}

    now = time.time()
    cache = read_cache()

    model_name = resolve_model_name(data, cache, now)
    family = model_family(extract_model_name(data) or model_name)

    bucket_5h = resolve_bucket(data, family, FIVE_H_NAMES, cache, now)
    bucket_wk = resolve_bucket(data, family, WEEKLY_NAMES, cache, now)

    resolved_buckets = {
        "5h": bucket_5h,
        "weekly": bucket_wk
    }

    ctx_observed = parse_context_window(data)
    context_block = None
    context_result = None
    if ctx_observed is not None:
        session_id = data.get("session_id")
        if not isinstance(session_id, str):
            session_id = data.get("conversation_id")
            if not isinstance(session_id, str):
                session_id = ""
        raw_context = cache.get("context") if isinstance(cache, dict) else None
        # A non-dict, or the old single-slot shape (a flat tally, not a map
        # of per-session entries), is not the current map format: start the
        # count over instead of misreading it.
        if isinstance(raw_context, dict) and all(isinstance(v, dict) for v in raw_context.values()):
            previous_context = raw_context
        else:
            previous_context = {}
        context_block = accumulate_context(session_id, ctx_observed.used_tokens, previous_context, now)
        context_result = ContextResult(
            used_tokens=context_block[session_id]["cumulative_tokens"],
            total_tokens=ctx_observed.total_tokens,
            used_percent=ctx_observed.used_percent,
        )

    write_cache(model_name, resolved_buckets, cache, now, context_block)
    maybe_trigger_bg_fetch(cache, now)

    parts = []
    if model_name:
        parts.append(f"{COLOR_CYAN}{model_name}{COLOR_RESET}")
    parts.append(render_context_window(context_result))
    parts.append(render_window("5h", bucket_5h))
    parts.append(render_window("Wk", bucket_wk))

    return sanitize_ascii(SEPARATOR.join(parts))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--bg-fetch":
        do_background_fetch()
        sys.exit(0)

    if len(sys.argv) > 1 and sys.argv[1] == "--bg-daemon":
        run_daemon()
        sys.exit(0)

    try:
        raw_input = sys.stdin.read()
        data = {}
        if raw_input and raw_input.strip():
            try:
                parsed = json.loads(raw_input)
                if isinstance(parsed, dict):
                    data = parsed
            except Exception:
                pass

        status_line = render_statusline(data)
        print(status_line)
    except Exception:
        # This runs on every prompt render: never crash, never hang the TUI.
        print(FALLBACK_LINE)


if __name__ == "__main__":
    main()


