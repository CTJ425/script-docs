# Adversarial Challenge Report — Milestone M1

**Target Files**:
- `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`
- `/home/ivan/project/script-docs/agy/usage_hud/test_statusline.py`

**Challenger**: Challenger 1 (Milestone M1 Core Robustness)
**Verdict**: **APPROVE**
**Overall Risk Assessment**: LOW

---

## Executive Summary

As Challenger 1 for Milestone M1 (Core Robustness & Edge Case Fixes), I subjected `statusline_hud.py` to rigorous empirical and static code analysis against 5 core adversarial attack vectors:
1. **Extremely large JSON payloads (>1MB)**
2. **Deeply nested arrays or invalid JSON types (`[{"quota": ...}]`, `12345`, `true`, `null`)**
3. **Complex non-ASCII UTF-8 sequences (emojis, zero-width joiners, surrogate pairs, full-width CJK)**
4. **Extreme floating point values (`1e308`, `-1e308`, `nan`, `-nan`, `inf`, `-inf`)**
5. **String float timestamps (`"123.456"`, `"-0.0"`, `"0.0001"`)**

`statusline_hud.py` passed all adversarial vectors. It **NEVER crashes**, **NEVER outputs non-ASCII characters** (`ord(c) < 128` guaranteed), and **ALWAYS exits with code 0**.

---

## Stress Test Harness & Methodology

A standalone, reproducible test harness was constructed at:
`/home/ivan/project/script-docs/agy/usage_hud/.agents/challenger_m1_1/harness.py`

### Test Vector Results Matrix

| ID | Attack Vector / Scenario | Input Payload | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|---|
| CAT1-01 | Large Payload (>1MB Array) | 1.2MB JSON array | Fallback statusline, exit 0, pure ASCII | Fallback statusline, exit 0, pure ASCII | **PASS** |
| CAT1-02 | Large Payload (>1MB Dict) | Dict with 1.2MB string value in `active_model` | Model truncated to 20 ASCII chars, exit 0 | Sanitized & truncated to 20 chars, exit 0 | **PASS** |
| CAT2-01 | Array of Quota Dicts | `[{"quota": ...}]` | Fallback statusline, exit 0 | Fallback statusline, exit 0 | **PASS** |
| CAT2-02 | Integer Primitive Payload | `12345` | Fallback statusline, exit 0 | Fallback statusline, exit 0 | **PASS** |
| CAT2-03 | Boolean Primitive Payload | `true` | Fallback statusline, exit 0 | Fallback statusline, exit 0 | **PASS** |
| CAT2-04 | Null Primitive Payload | `null` | Fallback statusline, exit 0 | Fallback statusline, exit 0 | **PASS** |
| CAT2-05 | Non-dict Quota Value | `{"quota": "invalid"}` | Default 0.0% / (0m), exit 0 | Default 0.0% / (0m), exit 0 | **PASS** |
| CAT2-06 | Non-dict Quota Item | `{"quota": {"rolling_5h": 99999}}` | Default 0.0% / (0m), exit 0 | Default 0.0% / (0m), exit 0 | **PASS** |
| CAT2-07 | Non-string Model (List) | `{"active_model": [1, 2, 3]}` | Converted to string, truncated, ASCII | `"[1, 2, 3]"` (len 9), exit 0 | **PASS** |
| CAT2-08 | Non-string Model (Dict) | `{"active_model": {"id": "gpt"}}` | Converted to string, truncated, ASCII | `"{'id': 'gpt'}"` (len 14), exit 0 | **PASS** |
| CAT3-01 | Emojis & ZWJ in Model | `"gemini-3.6-⚡-pro-👨‍👩‍👧‍👦-🔥"` | Non-ASCII stripped, len <= 20, ASCII | `"gemini-3.6--pro--"` (ASCII), exit 0 | **PASS** |
| CAT3-02 | CJK Full-Width Characters | `"繁體中文測試模型ＡＢＣ１２３"` | Non-ASCII stripped, ASCII only | Empty model / ASCII fallback, exit 0 | **PASS** |
| CAT3-03 | Non-ASCII Keys & Values | `{"測試鍵": "測試值", "active_model": "test-🚀-model"}` | Non-ASCII stripped, correct parsing | Parsed safely, model `"test--model"`, exit 0 | **PASS** |
| CAT4-01 | Extreme Positive Float | `used_percent: 1e308`, `reset_in_seconds: 1e308` | Percentage clamped 100%, reset formatted as ASCII | Clamped to 100.0%, reset duration rendered, exit 0 | **PASS** |
| CAT4-02 | Extreme Negative Float | `used_percent: -1e308`, `reset_in_seconds: -1e308` | Percentage clamped 0%, reset formatted as 0m | Clamped to 0.0%, reset (0m), exit 0 | **PASS** |
| CAT4-03 | NaN / Inf Strings | `used_percent: "nan"`, `reset_in_seconds: "inf"` | NaN -> 0.0%, inf reset -> 0, exit 0 | Percentage 0.0%, reset (0m), exit 0 | **PASS** |
| CAT5-01 | String Float Timestamp | `reset_in_seconds: "123.456"` | Parsed to int 123 -> (2m), exit 0 | Duration (2m), exit 0 | **PASS** |
| CAT5-02 | Negative Zero Timestamp | `reset_in_seconds: "-0.0"` | Parsed to int 0 -> (0m), exit 0 | Duration (0m), exit 0 | **PASS** |
| CAT5-03 | Sub-second Timestamp | `reset_in_seconds: "0.0001"` | Parsed to int 0 -> (0m), exit 0 | Duration (0m), exit 0 | **PASS** |

---

## Technical Findings & Code Defensive Analysis

1. **Top-Level Fault-Tolerance Catch-All**:
   In `statusline_hud.py:main()`, any unhandled exception or parsing error triggers:
   ```python
   except Exception:
       print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")
   ```
   This guarantees that process exit code is strictly `0` under any catastrophic failure, standard error is clean, and stdout receives valid fallback ANSI ASCII output.

2. **100% Pure-ASCII Enforcer**:
   `sanitize_ascii` filters out all characters with `ord(c) >= 128`. Furthermore, `render_statusline` wraps its final output line with `sanitize_ascii(line)` prior to return. This double-layer sanitization ensures no Unicode glyphs or surrogate pairs escape into stdout.

3. **Numeric Robustness**:
   - `make_ascii_progress_bar`, `get_color_code`, and `parse_quota_data` explicitly test `math.isnan()` and `math.isinf()` and handle float conversion exceptions (`ValueError`, `TypeError`, `OverflowError`).
   - String float timestamps like `"123.456"` are converted to `float` first, checked for `NaN`/`inf`, and converted to `int`. Negative timestamps default gracefully to `"0m"`.

4. **Model Name Truncation**:
   `model_name = sanitize_ascii(raw_model)[:20]` strictly bounds model string length to 20 characters maximum.

---

## Unchallenged Areas

- Hardware resource exhaustion (e.g. system out-of-memory prior to python execution) — out of scope for application layer testing.

---

## Final Verdict

**APPROVE**. `statusline_hud.py` meets all M1 robustness requirements.
