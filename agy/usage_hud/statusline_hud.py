#!/usr/bin/env python3
"""
AGY Usage Statusline Interceptor (Pure ASCII Version)
Reads JSON payload from stdin passed by AGY CLI TUI statusline trigger.
Outputs one pure ASCII line:

    <model> | 5h <pct>% (<reset>) | Wk <pct>% (<reset>)

Percentages only -- no progress bar. The usage level is carried entirely by
the colour of the number (green / yellow / red), which needs no horizontal
space, so the line stays short on a narrow terminal.
"""

import sys
import json
import math

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


def sanitize_ascii(text) -> str:
    """Strips non-ASCII characters (ord(c) >= 128) from text."""
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
    return "".join(c for c in text if ord(c) < 128)


def format_duration(seconds) -> str:
    """Formats seconds into ASCII duration string (e.g. 2h10m or 3d04h)."""
    if seconds is None:
        return "--"
    try:
        val = float(seconds)
        if math.isnan(val) or math.isinf(val):
            return "--"
        total_seconds = int(val)
    except (ValueError, TypeError, OverflowError):
        return "--"

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
    try:
        pct = float(percent)
        if math.isnan(pct):
            pct = 0.0
        elif math.isinf(pct):
            pct = 100.0 if pct > 0 else 0.0
    except (ValueError, TypeError, OverflowError):
        pct = 0.0

    if pct >= 90.0:
        return COLOR_RED
    elif pct >= 70.0:
        return COLOR_YELLOW
    else:
        return COLOR_GREEN


def extract_quota_item(quota_dict: dict, possible_keys: list):
    """Finds quota dictionary using multiple possible key names."""
    if not isinstance(quota_dict, dict):
        return None

    for key in possible_keys:
        if key in quota_dict:
            item = quota_dict[key]
            if isinstance(item, dict):
                return item

    # One level down, for payloads that nest the buckets under a model/plan key.
    for val in quota_dict.values():
        if isinstance(val, dict):
            for key in possible_keys:
                if key in val and isinstance(val[key], dict):
                    return val[key]
    return None


def parse_quota_data(data: dict):
    """Extracts 5h and Weekly quota info."""
    if not isinstance(data, dict):
        data = {}

    quota = data.get("quota", {})
    if not isinstance(quota, dict):
        quota = {}

    if not quota and ("rolling_5h" in data or "5h" in data):
        quota = data

    five_h = extract_quota_item(quota, ["rolling_5h", "5h", "rolling5h", "five_hour", "5_hour"])
    weekly = extract_quota_item(quota, ["weekly", "week", "7d", "seven_days"])

    def parse_item(item):
        """Parses one window, or returns None when the payload carries no
        usable usage figure for it (missing bucket, missing field, garbage
        value). None means 'unknown' and is rendered as '--%', never as 0%."""
        if not isinstance(item, dict):
            return None

        used_pct = item.get("used_percent")
        rem_frac = item.get("remaining_fraction")
        reset_sec = item.get("reset_in_seconds", item.get("reset_in", 0))

        if used_pct is None and rem_frac is None:
            return None

        if used_pct is None:
            try:
                rf = float(rem_frac)
            except (ValueError, TypeError, OverflowError):
                return None
            if math.isnan(rf) or math.isinf(rf):
                return None
            used_pct = (1.0 - rf) * 100.0

        try:
            val = float(used_pct)
        except (ValueError, TypeError, OverflowError):
            return None
        if math.isnan(val):
            return None
        if math.isinf(val):
            val = 100.0 if val > 0 else 0.0
        used_pct = round(max(0.0, min(100.0, val)), 1)

        try:
            if reset_sec is None:
                reset_sec = 0
            else:
                r_val = float(reset_sec)
                if math.isnan(r_val) or math.isinf(r_val):
                    reset_sec = 0
                else:
                    reset_sec = int(r_val)
        except (ValueError, TypeError, OverflowError):
            reset_sec = 0

        return {
            "used_percent": used_pct,
            "reset_in_seconds": reset_sec
        }

    return {
        "5h": parse_item(five_h),
        "weekly": parse_item(weekly)
    }


def render_window(label: str, item) -> str:
    """Renders one usage window, or the '--%' unknown marker when item is None."""
    if item is None:
        return f"{label} {UNKNOWN_SEGMENT}"

    pct = item["used_percent"]
    col = get_color_code(pct)
    rst = format_duration(item["reset_in_seconds"])
    return f"{label} {col}{pct:.1f}%{COLOR_RESET} {COLOR_DIM}({rst}){COLOR_RESET}"


def render_statusline(data: dict) -> str:
    """Renders pure ASCII statusline string."""
    if not isinstance(data, dict):
        data = {}

    parsed = parse_quota_data(data)

    raw_model = data.get("active_model", data.get("model", ""))
    model_name = sanitize_ascii(raw_model)[:20]

    # Model first: it is the one field that is always short and always known,
    # so it anchors the line when a terminal truncates the tail.
    parts = []
    if model_name:
        parts.append(f"{COLOR_CYAN}{model_name}{COLOR_RESET}")
    parts.append(render_window("5h", parsed["5h"]))
    parts.append(render_window("Wk", parsed["weekly"]))

    return sanitize_ascii(SEPARATOR.join(parts))


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            print(FALLBACK_LINE)
            return

        data = json.loads(raw_input)
        if not isinstance(data, dict):
            # Non-dict JSON payloads (arrays, primitives) carry nothing usable.
            print(FALLBACK_LINE)
            return

        status_line = render_statusline(data)
        print(status_line)
    except Exception:
        # This runs on every prompt render: never crash, never hang the TUI.
        print(FALLBACK_LINE)


if __name__ == "__main__":
    main()
