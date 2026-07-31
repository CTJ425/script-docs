import sys
import json
import math
import os
import time

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


def safe_float(value):
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


def read_cache() -> dict:
    """Reads disk cache safely. Returns dict or None."""
    try:
        cache_path = os.environ.get("USAGE_HUD_CACHE", CACHE_FILE)
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


def cached_bucket(cache: dict, family: str, canonical_name: str) -> dict:
    """Looks up a cached bucket key (e.g. gemini-5h) strictly matching the target family."""
    if not isinstance(cache, dict):
        return None
    quota = cache.get("quota")
    if not isinstance(quota, dict):
        return None
    key = f"{family}-{canonical_name}".lower()
    bucket = quota.get(key)
    if isinstance(bucket, dict):
        return bucket
    return None


def make_bucket_result(used_percent: float, reset_in_seconds, resets_at, is_live: bool, family: str, canonical_name: str) -> dict:
    """Helper to consistently format bucket resolution results."""
    return {
        "used_percent": used_percent,
        "reset_in_seconds": reset_in_seconds,
        "resets_at": resets_at,
        "is_live": is_live,
        "family": family,
        "canonical_name": canonical_name
    }


def resolve_bucket(data: dict, family: str, names, cache: dict, now: float):
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
            resets_at = (now + reset_sec) if reset_sec > 0 else None
            return make_bucket_result(parsed_live["used_percent"], reset_sec, resets_at, True, family, canonical_name)

    # 2. Check fresh cache
    if not cache_is_fresh(cache, now):
        return None

    cached_item = cached_bucket(cache, family, canonical_name)
    if cached_item is None or not isinstance(cached_item, dict):
        return None

    val = safe_float(cached_item.get("used_percent"))
    if val is None:
        return None
    used_pct = round(max(0.0, min(100.0, val)), 1)

    resets_at_val = safe_float(cached_item.get("resets_at"))
    if resets_at_val is not None:
        if resets_at_val <= now:
            # Window rolled over -> used_percent = 0.0, countdown omitted
            return make_bucket_result(0.0, None, None, False, family, canonical_name)
        else:
            remaining = int(resets_at_val - now)
            return make_bucket_result(used_pct, remaining, resets_at_val, False, family, canonical_name)

    return make_bucket_result(used_pct, None, None, False, family, canonical_name)


def resolve_model_name(data: dict, cache: dict, now: float) -> str:
    """Returns model display name, trying live payload first, then fresh cache."""
    raw_model = extract_model_name(data)
    model_name = sanitize_ascii(raw_model)[:MODEL_MAX_LEN].strip()
    if model_name:
        return model_name

    if cache_is_fresh(cache, now):
        cached_m = cache.get("model")
        if isinstance(cached_m, str) and cached_m.strip():
            return sanitize_ascii(cached_m)[:MODEL_MAX_LEN].strip()

    return ""


def write_cache(data: dict, resolved_model: str, resolved_buckets: dict, cache: dict, now: float):
    """Safely updates disk cache with live buckets and model info."""
    try:
        cache_path = os.environ.get("USAGE_HUD_CACHE", CACHE_FILE)
        usable_cache = cache if cache_is_fresh(cache, now) else None

        new_quota = {}
        if usable_cache and isinstance(usable_cache.get("quota"), dict):
            new_quota.update(usable_cache["quota"])

        # Merge live buckets
        has_live = False
        for window_key, item in resolved_buckets.items():
            if item and item.get("is_live"):
                has_live = True
                fam = item.get("family", GEMINI_FAMILY)
                c_name = item.get("canonical_name", window_key)
                key = f"{fam}-{c_name}".lower()
                new_quota[key] = {
                    "used_percent": item["used_percent"],
                    "resets_at": item.get("resets_at")
                }

        model_to_save = resolved_model or (usable_cache.get("model") if usable_cache else "")

        if not has_live and not (usable_cache is None and (new_quota or model_to_save)):
            return

        next_cache = {
            "version": CACHE_VERSION,
            "saved_at": int(now),
            "model": model_to_save,
            "quota": new_quota
        }

        if usable_cache:
            if usable_cache.get("model") == next_cache["model"] and usable_cache.get("quota") == next_cache["quota"]:
                return

        cache_dir = os.path.dirname(cache_path)
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)

        tmp_file = f"{cache_path}.tmp.{os.getpid()}"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(next_cache, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_file, cache_path)
    except Exception:
        pass


def render_window(label: str, item) -> str:
    """Renders one usage window, or the '--%' unknown marker when item is None."""
    if item is None:
        return f"{label} {UNKNOWN_SEGMENT}"

    pct = item["used_percent"]
    col = get_color_code(pct)
    reset_sec = item.get("reset_in_seconds")
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

    write_cache(data, model_name, resolved_buckets, cache, now)

    parts = []
    if model_name:
        parts.append(f"{COLOR_CYAN}{model_name}{COLOR_RESET}")
    parts.append(render_window("5h", bucket_5h))
    parts.append(render_window("Wk", bucket_wk))

    return sanitize_ascii(SEPARATOR.join(parts))


def main():
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

