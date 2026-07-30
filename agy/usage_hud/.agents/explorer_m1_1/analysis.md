# Analysis & Fix Strategy Report: `statusline_hud.py` (Milestone M1)

## Executive Summary
This document provides a comprehensive root cause analysis, edge case evaluation, and exact line-by-line modification plan for `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`.

The objective of Milestone M1 is to harden `statusline_hud.py` against all edge cases, ensuring 100% pure ASCII output (`ord(c) < 128`), model name truncation to max 20 characters, total immunity against float `NaN`/`inf`/negative/string timestamp anomalies, and full tolerance for non-dict JSON payloads.

---

## 1. Problem Identification & Evidence Chains

### Problem 1: Model Name Truncation & ASCII Sanitization Deficit
- **Location**: `statusline_hud.py`, lines 158-163
- **Observation**:
  ```python
  model_name = data.get("active_model", data.get("model", ""))
  if model_name:
      model_part = f" {COLOR_DIM}|{COLOR_RESET} {COLOR_CYAN}{model_name}{COLOR_RESET}"
  ```
- **Vulnerabilities**:
  1. No length truncation: If `active_model` is over 20 characters (e.g., `"gemini-3.6-pro-exp-2026-07-30"`), the statusline overflows terminal line width.
  2. No ASCII sanitization: If `active_model` contains Emojis or Unicode characters (e.g., `"gpt-4o-🚀-超強大"`, `"claude-3-5-sonnet-🔥"`), non-ASCII characters pass directly to `stdout`, violating the pure ASCII constraint.
  3. Non-string type vulnerability: If `active_model` is an integer (`123`), boolean (`True`), or list, `model_name` may not behave as expected or may fail when concatenated/sliced.

### Problem 2: `OverflowError`, NaN, and Float-String Failures in `format_duration`
- **Location**: `statusline_hud.py`, lines 21-28
- **Observation**:
  ```python
  def format_duration(seconds: float) -> str:
      if seconds is None:
          return "--"
      try:
          total_seconds = int(seconds)
      except (ValueError, TypeError):
          return "--"
  ```
- **Vulnerabilities**:
  1. `float('inf')` or `"inf"`: `int(float('inf'))` raises `OverflowError: cannot convert float infinity to integer`. The current `except (ValueError, TypeError):` block does NOT catch `OverflowError`, resulting in an unhandled exception crash.
  2. Float string inputs (e.g., `"3600.5"`): `int("3600.5")` raises `ValueError: invalid literal for int() with base 10: '3600.5'`. `format_duration` returns `"--"` instead of properly converting to float first and calculating `3600` seconds (`"1h00m"`).
  3. Negative timestamps (e.g., `-500`): Currently `if total_seconds <= 0: return "0m"`, which correctly returns `"0m"`, but `float("-500.5")` fails if passed as string `" -500.5 "`.

### Problem 3: `ValueError` Crash in `make_ascii_progress_bar` on `NaN` / `inf`
- **Location**: `statusline_hud.py`, lines 45-55
- **Observation**:
  ```python
  def make_ascii_progress_bar(percent: float, length: int = 8) -> str:
      try:
          clamped = max(0.0, min(100.0, float(percent)))
      except (ValueError, TypeError):
          clamped = 0.0

      filled_len = int(round((clamped / 100.0) * length))
      filled_len = max(0, min(length, filled_len))
      bar = "=" * filled_len + "." * (length - filled_len)
      return f"[{bar}]"
  ```
- **Vulnerabilities**:
  1. `float('nan')` or `"nan"`: In Python, `min(100.0, float('nan'))` returns `100.0` or `nan` depending on evaluation order. If `clamped` becomes `nan`, `round(float('nan'))` on line 52 raises `ValueError: cannot convert float NaN to integer`. Because `int(round(...))` is outside the `try...except` block, the script crashes!
  2. `float('inf')`: If `percent` is `float('inf')`, `clamped` becomes `100.0`, but arithmetic ops could theoretically overflow if `length` or multipliers vary. Line 52 lacks exception guarding.

### Problem 4: `AttributeError` on Non-Dict JSON Payloads
- **Location**: `statusline_hud.py`, `parse_quota_data` (line 93) and `render_statusline` (line 139)
- **Observation**:
  ```python
  def parse_quota_data(data: dict):
      quota = data.get("quota", {})
  ```
- **Vulnerabilities**:
  1. If `data` is valid JSON but not a dict (e.g. `[1, 2, 3]`, `"hello"`, `42`, `True`), `data.get(...)` raises `AttributeError: 'list' object has no attribute 'get'`.
  2. In `render_statusline`, line 158 `data.get("active_model", ...)` also raises `AttributeError` if `data` is not a dict.

---

## 2. Fix Strategy & Design Principles

1. **ASCII Sanitization Helper (`sanitize_ascii`)**:
   - Create a central helper function:
     ```python
     def sanitize_ascii(text) -> str:
         if not isinstance(text, str):
             text = str(text) if text is not None else ""
         return "".join(c for c in text if ord(c) < 128)
     ```
   - Strip all non-ASCII characters (`ord(c) >= 128`) from model names before truncation.
   - Run `sanitize_ascii` on the final output string in `render_statusline` as a defensive safety net.

2. **Model Name Truncation**:
   - Extract raw model string, sanitize to pure ASCII, then slice to max 20 characters:
     `model_name = sanitize_ascii(raw_model)[:20]`

3. **Robust Float & Duration Formatting (`format_duration`)**:
   - Convert input via `float(seconds)`.
   - Check `math.isnan(val)` and `math.isinf(val)` explicitly, returning `"--"`.
   - Catch `(ValueError, TypeError, OverflowError)` when converting `int(val)`.
   - Float strings like `"3600.5"` convert smoothly via `float()` first, then `int()`.
   - Negative numbers (`val <= 0`) return `"0m"`.

4. **Guarded Progress Bar (`make_ascii_progress_bar`)**:
   - Check `math.isnan(val)` -> `clamped = 0.0`.
   - Check `math.isinf(val)` -> `clamped = 100.0 if val > 0 else 0.0`.
   - Wrap both value calculation AND `int(round(...))` calculation inside `try...except (ValueError, TypeError, OverflowError)` blocks.

5. **Defensive Dict Type Checking**:
   - At the beginning of `parse_quota_data` and `render_statusline`:
     `if not isinstance(data, dict): data = {}`
   - Ensure `quota` inside `parse_quota_data` is also type-checked with `isinstance(quota, dict)`.

---

## 3. Exact Line-by-Line Modification Plan for `statusline_hud.py`

### Replacement Chunk 1: Imports (Lines 8-10)
**Target File**: `statusline_hud.py`
**Lines**: 8-10

**Target Content**:
```python
import sys
import json
import re
```

**Replacement Content**:
```python
import sys
import json
import re
import math
```

---

### Replacement Chunk 2: Add `sanitize_ascii` & Update `format_duration` (Lines 21-43)
**Target File**: `statusline_hud.py`
**Lines**: 21-43

**Target Content**:
```python
def format_duration(seconds: float) -> str:
    """Formats seconds into ASCII duration string (e.g. 2h10m or 3d04h)."""
    if seconds is None:
        return "--"
    try:
        total_seconds = int(seconds)
    except (ValueError, TypeError):
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
```

**Replacement Content**:
```python
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
```

---

### Replacement Chunk 3: Update `make_ascii_progress_bar` and `get_color_code` (Lines 45-70)
**Target File**: `statusline_hud.py`
**Lines**: 45-70

**Target Content**:
```python
def make_ascii_progress_bar(percent: float, length: int = 8) -> str:
    """Generates a pure ASCII progress bar using '=' and '.' (e.g. [====....])."""
    try:
        clamped = max(0.0, min(100.0, float(percent)))
    except (ValueError, TypeError):
        clamped = 0.0

    filled_len = int(round((clamped / 100.0) * length))
    filled_len = max(0, min(length, filled_len))
    bar = "=" * filled_len + "." * (length - filled_len)
    return f"[{bar}]"


def get_color_code(percent: float) -> str:
    """Returns ANSI color code based on percentage threshold."""
    try:
        pct = float(percent)
    except (ValueError, TypeError):
        pct = 0.0

    if pct >= 90.0:
        return COLOR_RED
    elif pct >= 70.0:
        return COLOR_YELLOW
    else:
        return COLOR_GREEN
```

**Replacement Content**:
```python
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
```

---

### Replacement Chunk 4: Dict Type Checking & Math Guarding in `parse_quota_data` (Lines 93-136)
**Target File**: `statusline_hud.py`
**Lines**: 93-136

**Target Content**:
```python
def parse_quota_data(data: dict):
    """Extracts 5h and Weekly quota info."""
    quota = data.get("quota", {})
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
                used_pct = (1.0 - float(rem_frac)) * 100.0
            except (ValueError, TypeError):
                used_pct = 0.0
        elif used_pct is None:
            used_pct = 0.0

        try:
            used_pct = round(float(used_pct), 1)
        except (ValueError, TypeError):
            used_pct = 0.0

        try:
            reset_sec = int(reset_sec) if reset_sec is not None else 0
        except (ValueError, TypeError):
            reset_sec = 0

        return {
            "used_percent": used_pct,
            "reset_in_seconds": reset_sec
        }

    return {
        "5h": parse_item(five_h),
        "weekly": parse_item(weekly)
    }
```

**Replacement Content**:
```python
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
            return {"used_percent": 0.0, "reset_in_seconds": None}

        used_pct = item.get("used_percent")
        rem_frac = item.get("remaining_fraction")
        reset_sec = item.get("reset_in_seconds", item.get("reset_in", item.get("reset_time", None)))

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
                used_pct = round(val, 1)
        except (ValueError, TypeError, OverflowError):
            used_pct = 0.0

        return {
            "used_percent": used_pct,
            "reset_in_seconds": reset_sec
        }

    return {
        "5h": parse_item(five_h),
        "weekly": parse_item(weekly)
    }
```

---

### Replacement Chunk 5: Dict Check, Model Sanitization & Truncation in `render_statusline` (Lines 139-172)
**Target File**: `statusline_hud.py`
**Lines**: 139-172

**Target Content**:
```python
def render_statusline(data: dict) -> str:
    """Renders pure ASCII statusline string."""
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

    model_name = data.get("active_model", data.get("model", ""))
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

    return line
```

**Replacement Content**:
```python
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
```

---

## 4. Edge Case Matrix & Expected Behaviors

| Test Input Scenario | Subsystem | Raw Input Payload | Expected Output Behavior |
|---------------------|-----------|-------------------|--------------------------|
| Long Model Name | Model Truncation | `{"active_model": "gemini-3.6-pro-exp-2026-07-30"}` | `model_name` truncated to `"gemini-3.6-pro-exp-2"` (20 chars) |
| Non-ASCII / Emojis in Model | Model Sanitization | `{"active_model": "gpt-4o-🚀-超強大-v1.0"}` | `model_name` stripped of non-ASCII -> `"gpt-4o--v1.0"` |
| `float('inf')` reset time | `format_duration` | `{"quota": {"5h": {"reset_in_seconds": float('inf')}}}` | `format_duration` returns `"--"`, outputs `(--)` |
| String `"inf"` reset time | `format_duration` | `{"quota": {"5h": {"reset_in_seconds": "inf"}}}` | `format_duration` catches `isinf`, returns `"--"` |
| String float `"3600.5"` | `format_duration` | `{"quota": {"5h": {"reset_in_seconds": "3600.5"}}}` | `format_duration` converts float -> 3600s -> `"1h00m"` |
| Negative reset time `-500` | `format_duration` | `{"quota": {"weekly": {"reset_in_seconds": -500}}}` | `format_duration` returns `"0m"` |
| `float('nan')` percent | `make_ascii_progress_bar` | `{"quota": {"5h": {"used_percent": float('nan')}}}` | `make_ascii_progress_bar` returns `[........]`, pct `0.0%` |
| String `"nan"` percent | `make_ascii_progress_bar` | `{"quota": {"5h": {"used_percent": "nan"}}}` | `make_ascii_progress_bar` returns `[........]`, pct `0.0%` |
| Non-dict JSON list | Payload Type Check | `[1, 2, 3]` | `render_statusline` handles as `{}` safely without crash |
| Non-dict JSON scalar | Payload Type Check | `12345` or `"string_payload"` | `render_statusline` handles as `{}` safely without crash |
