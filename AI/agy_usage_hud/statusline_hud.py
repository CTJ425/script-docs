import sys
import json
import math
import os
import time
from typing import NamedTuple, Optional

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
SEPARATOR = f" {COLOR_DIM}|{COLOR_RESET} "
FALLBACK_LINE = f"5h {UNKNOWN_SEGMENT}{SEPARATOR}Wk {UNKNOWN_SEGMENT}"

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
CACHE_VERSION = 1
CACHE_MAX_AGE_SECONDS = 7 * 86400  # 7 days
CACHE_FUTURE_SLACK_SECONDS = 300  # 300 seconds slack for clock skew
TOKEN_FILE = os.environ.get(
    "USAGE_HUD_TOKEN_PATH",
    os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
)
QUOTA_API_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"
API_REFRESH_INTERVAL = 5.0  # seconds between background API polls



class BucketResult(NamedTuple):
    """Domain representation of a resolved quota bucket."""
    used_percent: float
    reset_in_seconds: Optional[int]
    resets_at: Optional[int]
    is_live: bool
    family: str
    canonical_name: str


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

    return {
        "used_percent": used_pct,
        "reset_in_seconds": reset_sec
    }


def get_cache_path() -> str:
    """Returns the effective cache file path."""
    return os.environ.get("USAGE_HUD_CACHE", CACHE_FILE)


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


def resolve_bucket(data: dict, family: str, names: tuple, cache: dict, now: float) -> Optional[BucketResult]:
    """Resolves usage bucket for a window: live payload first, then fresh cache."""
    canonical_name = names[0]  # "5h" or "weekly"

    # 1. Live payload evaluation
    if isinstance(data, dict):
        quota = data.get("quota", {})
        live_item = select_bucket(quota, names, family)
        if live_item is None:
            live_item = select_bucket(data, names, family)
        parsed_live = parse_item(live_item)
        if parsed_live is not None:
            reset_sec = parsed_live.get("reset_in_seconds", 0)
            resets_at = int(now + reset_sec) if reset_sec > 0 else None
            return BucketResult(
                used_percent=parsed_live["used_percent"],
                reset_in_seconds=reset_sec,
                resets_at=resets_at,
                is_live=True,
                family=family,
                canonical_name=canonical_name
            )

    # 2. Check fresh cache
    if not cache_is_fresh(cache, now):
        return None

    cached_item = cached_bucket(cache, family, canonical_name, names=names)
    if cached_item is None or not isinstance(cached_item, dict):
        return None

    val = safe_float(cached_item.get("used_percent"))
    if val is None:
        return None
    used_pct = round(max(0.0, min(100.0, val)), 1)

    resets_at_val = safe_float(cached_item.get("resets_at"))
    if resets_at_val is not None:
        resets_at_int = int(resets_at_val)
        if resets_at_int <= now:
            # Window rolled over -> used_percent = 0.0, countdown omitted
            return BucketResult(
                used_percent=0.0,
                reset_in_seconds=None,
                resets_at=None,
                is_live=False,
                family=family,
                canonical_name=canonical_name
            )
        else:
            remaining = int(resets_at_int - now)
            return BucketResult(
                used_percent=used_pct,
                reset_in_seconds=remaining,
                resets_at=resets_at_int,
                is_live=False,
                family=family,
                canonical_name=canonical_name
            )

    return BucketResult(
        used_percent=used_pct,
        reset_in_seconds=None,
        resets_at=None,
        is_live=False,
        family=family,
        canonical_name=canonical_name
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


def fetch_live_quota_from_api() -> Optional[dict]:
    """Fetches real-time usage quota from Google Cloud Code PA API directly using OAuth token."""
    try:
        token_path = os.environ.get("USAGE_HUD_TOKEN_PATH", TOKEN_FILE)
        if not os.path.isfile(token_path):
            return None
        with open(token_path, "r", encoding="utf-8") as f:
            token_data = json.load(f)
        access_token = token_data.get("token", {}).get("access_token")
        if not isinstance(access_token, str) or not access_token:
            return None

        import urllib.request
        from datetime import datetime

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
                resets_at = None
                if isinstance(reset_time_str, str) and reset_time_str:
                    try:
                        clean_time = reset_time_str.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(clean_time)
                        resets_at = int(dt.timestamp())
                    except Exception:
                        pass
                quota[bid.lower()] = {
                    "used_percent": used_pct,
                    "resets_at": resets_at
                }
        return quota if quota else None
    except Exception:
        return None


def do_background_fetch():
    """Background entry point: fetches live quota and updates cache atomically."""
    try:
        now = time.time()
        live_quota = fetch_live_quota_from_api()
        if not live_quota:
            return

        cache_path = get_cache_path()
        existing_cache = read_cache() or {}
        new_quota = {}
        if isinstance(existing_cache.get("quota"), dict):
            new_quota.update(existing_cache["quota"])
        new_quota.update(live_quota)

        model_name = existing_cache.get("model", "")
        next_cache = {
            "version": CACHE_VERSION,
            "saved_at": int(now),
            "last_api_fetch": now,
            "model": model_name,
            "quota": new_quota
        }
        atomic_write_json(cache_path, next_cache)
    except Exception:
        pass


def maybe_trigger_bg_fetch(cache: Optional[dict], now: float):
    """Spawns non-blocking background fetch if enough time has passed."""
    if os.environ.get("USAGE_HUD_DISABLE_BG_FETCH") == "1":
        return
    last_fetch = safe_float(cache.get("last_api_fetch") if isinstance(cache, dict) else None) or 0.0
    if now - last_fetch < API_REFRESH_INTERVAL:
        return

    import subprocess
    try:
        cmd = [sys.executable, os.path.abspath(__file__), "--bg-fetch"]
        env = dict(os.environ)
        env["USAGE_HUD_DISABLE_BG_FETCH"] = "1"
        subprocess.Popen(
            cmd,
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env
        )
    except Exception:
        pass


def write_cache(resolved_model: str, resolved_buckets: dict, cache: dict, now: float):
    """Safely updates disk cache with live buckets and model info."""
    try:
        cache_path = get_cache_path()
        usable_cache = cache if cache_is_fresh(cache, now) else None

        new_quota = {}
        if usable_cache and isinstance(usable_cache.get("quota"), dict):
            new_quota.update(usable_cache["quota"])

        # Update live buckets in cache
        has_updates = False
        for window_key, item in resolved_buckets.items():
            if isinstance(item, BucketResult) and item.is_live:
                fam = item.family or GEMINI_FAMILY
                canonical = item.canonical_name or window_key
                key = f"{fam}-{canonical}".lower()

                has_updates = True
                bucket_entry = {"used_percent": item.used_percent}
                if item.resets_at is not None:
                    bucket_entry["resets_at"] = item.resets_at
                new_quota[key] = bucket_entry

        model_to_save = resolved_model or (usable_cache.get("model") if usable_cache else "")

        if not has_updates and not (usable_cache is None and (new_quota or model_to_save)):
            return

        next_cache = {
            "version": CACHE_VERSION,
            "saved_at": int(now),
            "model": model_to_save,
            "quota": new_quota
        }
        if usable_cache and usable_cache.get("last_api_fetch") is not None:
            next_cache["last_api_fetch"] = usable_cache["last_api_fetch"]

        if usable_cache and is_cache_equivalent(usable_cache, next_cache):
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
    reset_sec = item.reset_in_seconds
    if reset_sec is not None:
        rst = format_duration(reset_sec)
        return f"{label} {col}{pct:.1f}%{COLOR_RESET} {COLOR_DIM}({rst}){COLOR_RESET}"
    return f"{label} {col}{pct:.1f}%{COLOR_RESET}"


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

    write_cache(model_name, resolved_buckets, cache, now)
    maybe_trigger_bg_fetch(cache, now)

    parts = []
    if model_name:
        parts.append(f"{COLOR_CYAN}{model_name}{COLOR_RESET}")
    parts.append(render_window("5h", bucket_5h))
    parts.append(render_window("Wk", bucket_wk))

    return sanitize_ascii(SEPARATOR.join(parts))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--bg-fetch":
        do_background_fetch()
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


