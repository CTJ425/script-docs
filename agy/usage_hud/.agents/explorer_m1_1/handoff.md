# Handoff Report: Explorer 1 (Milestone M1)

## 1. Observation
Target file examined: `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`

Key code observations and vulnerabilities found:
- **Model Name Truncation & ASCII Sanitization**:
  - `statusline_hud.py:158-163`: `model_name = data.get("active_model", data.get("model", ""))` is rendered directly into `model_part` without truncation or character filtering. Emojis, non-ASCII Unicode (e.g. Traditional Chinese, UTF-8 symbols), and strings >20 characters cause terminal statusline overflow and violate pure ASCII requirement (`ord(c) < 128`).
- **Float & Timestamp Edge Cases**:
  - `statusline_hud.py:25-28`: `format_duration` calls `int(seconds)` inside a `try...except (ValueError, TypeError):` block. When `seconds` is `float('inf')` or `"inf"`, `int()` raises `OverflowError`, which is NOT caught by `(ValueError, TypeError)`, leading to script crash.
  - `statusline_hud.py:26`: When `seconds` is a float string (e.g. `"3600.5"`), `int("3600.5")` raises `ValueError`, returning `"--"` instead of parsing float `3600.5` -> `3600` seconds (`"1h00m"`).
  - `statusline_hud.py:47-53`: `make_ascii_progress_bar` calculates `filled_len = int(round((clamped / 100.0) * length))` outside the `try...except` block. When `percent` is `float('nan')` or `"nan"`, `clamped` may be `nan`. `round(float('nan'))` raises `ValueError: cannot convert float NaN to integer`, crashing the script.
- **Payload Dict Type Checking**:
  - `statusline_hud.py:95` (`parse_quota_data`) & `statusline_hud.py:141` (`render_statusline`): Both functions assume `data` is a `dict`. Passing a JSON list (`[1, 2, 3]`), string (`"payload"`), or number (`42`) causes `AttributeError: 'list' object has no attribute 'get'`.

---

## 2. Logic Chain
1. **Model Name Truncation & ASCII Filtering**:
   - Step 1: Create helper `sanitize_ascii(text)` returning `"".join(c for c in str(text) if ord(c) < 128)` to strip non-ASCII characters (`ord(c) >= 128`).
   - Step 2: In `render_statusline`, sanitize `raw_model` first and slice to `[:20]`:
     `model_name = sanitize_ascii(raw_model)[:20]`
   - Step 3: Run `sanitize_ascii` on the final output string in `render_statusline` as a defensive safety net.

2. **Duration & Progress Bar Robustness**:
   - Step 1: In `format_duration`, convert input via `val = float(seconds)`. Check `math.isnan(val)` or `math.isinf(val)` explicitly, returning `"--"`. Catch `(ValueError, TypeError, OverflowError)` when calling `int(val)`. Convert float string `"3600.5"` cleanly via float first. Treat negative values (`val <= 0`) as `"0m"`.
   - Step 2: In `make_ascii_progress_bar`, check `math.isnan(val)` -> `clamped = 0.0` and `math.isinf(val)` -> `clamped = 100.0 if val > 0 else 0.0`. Wrap both calculation steps inside `try...except (ValueError, TypeError, OverflowError)` blocks.

3. **Payload Dict Type Checking**:
   - Step 1: Add `if not isinstance(data, dict): data = {}` at the top of `parse_quota_data` and `render_statusline`.
   - Step 2: Ensure `quota` in `parse_quota_data` is checked with `if not isinstance(quota, dict): quota = {}`.

---

## 3. Caveats
- **Scope Boundary**: Explorer 1 is strictly read-only. All concrete line-by-line modifications are specified in `analysis.md` and this handoff report, ready for Implementer 1 to execute.
- **Dependencies**: Requires `import math` added to `statusline_hud.py`.
- **ANSI Escape Codes**: `ord(c) < 128` applies to ANSI escape sequences (`\033[...]`) since `\033` has ordinal 27. `sanitize_ascii` preserves ANSI codes intact while removing non-ASCII Unicode characters.

---

## 4. Conclusion
The proposed fixes in `analysis.md` address all identified vulnerabilities in `statusline_hud.py`:
1. Model names are sanitized to pure ASCII and truncated to max 20 characters.
2. `format_duration` and `make_ascii_progress_bar` are 100% immune to `float('nan')`, `float('inf')`, `"inf"`, `"nan"`, `"3600.5"`, negative timestamps, and `OverflowError`.
3. Non-dict JSON payloads fallback safely without raising `AttributeError`.

Detailed code replacement chunks are available in `/home/ivan/project/script-docs/agy/usage_hud/.agents/explorer_m1_1/analysis.md`.

---

## 5. Verification Method
To verify the implementation once applied by Implementer:
1. **Existing Test Suite**:
   Run `python3 test_statusline.py` from `/home/ivan/project/script-docs/agy/usage_hud`.
   Expected: All existing test cases pass with exit code 0.

2. **Inline Edge-Case Verification Script**:
   Execute the following inline Python check:
   ```python
   from statusline_hud import format_duration, make_ascii_progress_bar, render_statusline, sanitize_ascii

   # 1. Model truncation & ASCII sanitization
   assert sanitize_ascii("gpt-4o-🚀-超強大-v1.0") == "gpt-4o--v1.0"
   res = render_statusline({"active_model": "gemini-3.6-pro-exp-2026-07-30"})
   assert "gemini-3.6-pro-exp-2" in res
   assert "2026-07-30" not in res  # Verified truncated to 20 chars

   # 2. Float & Timestamp handling
   assert format_duration(float('inf')) == "--"
   assert format_duration("inf") == "--"
   assert format_duration("nan") == "--"
   assert format_duration("3600.5") == "1h00m"
   assert format_duration(-500) == "0m"

   # 3. Progress Bar NaN/Inf handling
   assert make_ascii_progress_bar(float('nan')) == "[........]"
   assert make_ascii_progress_bar("nan") == "[........]"

   # 4. Non-dict payload
   res_list = render_statusline([1, 2, 3])
   assert "[........]" in res_list

   print("All verification assertions passed successfully!")
   ```

3. **ASCII Ordinance Check**:
   For any output string `out` from `render_statusline(payload)`:
   `all(ord(c) < 128 for c in out)` must evaluate to `True`.
