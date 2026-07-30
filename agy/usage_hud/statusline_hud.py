#!/usr/bin/env python3
"""
AGY Usage Statusline Interceptor (Pure ASCII Version)
Reads JSON payload from stdin passed by AGY CLI TUI statusline trigger.
Outputs a pure ASCII formatted statusline showing 5h rolling & Weekly usage.
"""

import sys
import json
import re
import math

# ANSI Color definitions
COLOR_RESET = "\033[0m"
COLOR_GREEN = "\033[1;32m"
COLOR_YELLOW = "\033[1;33m"
COLOR_RED = "\033[1;31m"
COLOR_CYAN = "\033[1;36m"
COLOR_DIM = "\033[2m"


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


def make_ascii_progress_bar(percent, length: int = 8) -> str:
    """Generates a pure ASCII progress bar using '=' and '.' (e.g. [====....])."""
    try:
        val = float(percent)
        if math.isnan(val):
            clamped = 0.0
        elif math.isinf(val):
            clamped = 100.0 if val > 0 else 0.0
        else:
            clamped = max(0.0, min(100.0, val))
    except (ValueError, TypeError, OverflowError):
        clamped = 0.0

    try:
        filled_len = int(round((clamped / 100.0) * length))
        filled_len = max(0, min(length, filled_len))
    except (ValueError, TypeError, OverflowError):
        filled_len = 0

    bar = "=" * filled_len + "." * (length - filled_len)
    return f"[{bar}]"


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

    # Recursive check for nested model/bucket structures
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
        if not isinstance(item, dict):
            return {"used_percent": 0.0, "reset_in_seconds": 0}

        used_pct = item.get("used_percent")
        rem_frac = item.get("remaining_fraction")
        reset_sec = item.get("reset_in_seconds", item.get("reset_in", 0))

        if used_pct is None and rem_frac is not None:
            try:
                rf = float(rem_frac)
                if math.isnan(rf) or math.isinf(rf):
                    used_pct = 0.0
                else:
                    used_pct = (1.0 - rf) * 100.0
            except (ValueError, TypeError, OverflowError):
                used_pct = 0.0
        elif used_pct is None:
            used_pct = 0.0

        try:
            val = float(used_pct)
            if math.isnan(val):
                used_pct = 0.0
            elif math.isinf(val):
                used_pct = 100.0 if val > 0 else 0.0
            else:
                used_pct = round(max(0.0, min(100.0, val)), 1)
        except (ValueError, TypeError, OverflowError):
            used_pct = 0.0

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


def render_statusline(data: dict) -> str:
    """Renders pure ASCII statusline string."""
    if not isinstance(data, dict):
        data = {}

    parsed = parse_quota_data(data)

    q5 = parsed["5h"]
    qw = parsed["weekly"]

    pct5 = q5["used_percent"]
    pctw = qw["used_percent"]

    bar5 = make_ascii_progress_bar(pct5, length=8)
    barw = make_ascii_progress_bar(pctw, length=8)

    col5 = get_color_code(pct5)
    colw = get_color_code(pctw)

    rst5 = format_duration(q5["reset_in_seconds"])
    rstw = format_duration(qw["reset_in_seconds"])

    raw_model = data.get("active_model", data.get("model", ""))
    model_name = sanitize_ascii(raw_model)[:20]

    if model_name:
        model_part = f" {COLOR_DIM}|{COLOR_RESET} {COLOR_CYAN}{model_name}{COLOR_RESET}"
    else:
        model_part = ""

    line = (
        f"5h: {col5}{bar5} {pct5:4.1f}%{COLOR_RESET} {COLOR_DIM}({rst5}){COLOR_RESET} "
        f"{COLOR_DIM}|{COLOR_RESET} "
        f"Wk: {colw}{barw} {pctw:4.1f}%{COLOR_RESET} {COLOR_DIM}({rstw}){COLOR_RESET}"
        f"{model_part}"
    )

    return sanitize_ascii(line)


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            # Fallback pure ASCII display
            print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")
            return

        data = json.loads(raw_input)
        if not isinstance(data, dict):
            # Fallback pure ASCII display for non-dict JSON payloads
            print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")
            return

        status_line = render_statusline(data)
        print(status_line)
    except Exception:
        # Fallback pure ASCII display on error
        print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")


if __name__ == "__main__":
    main()
