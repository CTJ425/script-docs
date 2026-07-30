# Empirical Challenge Report — Milestone M1 (Core Robustness & Edge Case Fixes)

**Challenger**: Challenger 2
**Target Module**: `statusline_hud.py` & `test_statusline.py`
**Scope**: Pure ASCII compliance, visual formatting integrity, and edge-case robustness
**Verdict**: **APPROVE**

---

## 1. Executive Summary

As Challenger 2 for Milestone M1, an empirical adversarial stress test was conducted on `statusline_hud.py` to evaluate line length boundaries, progress bar rendering edge cases, abrupt stdin closure, binary stream noise, and pure ASCII compliance.

All challenge objectives were systematically validated against implementation logic and empirical test vectors. The implementation demonstrates robust defensive programming, strictly maintains visual formatting integrity, enforces 100% pure ASCII output (`ord(c) < 128`), and handles invalid/malformed payloads cleanly with exit code 0 and fallback display.

---

## 2. Objective Analysis & Verification Findings

### Objective 1: Line Length Boundaries & Model Name Truncation
- **Tested Cases**: Model name empty (`""`), 1 char (`"a"`), 20 chars (`"12345678901234567890"`), 21 chars (`"123456789012345678901"`), and 500 chars (`"x" * 500`).
- **Code Trace**:
  - `statusline_hud.py` extracts model via `raw_model = data.get("active_model", data.get("model", ""))`.
  - Model name is sanitized and sliced: `model_name = sanitize_ascii(raw_model)[:20]`.
  - When `model_name` is non-empty, it appends ` | {model_name}` formatted with ANSI cyan/dim codes.
  - When `model_name` is empty, `model_part` is empty string (`""`).
- **Results**:
  - **Empty (`""`)**: Displays quota bars without model suffix. No trailing pipe or spaces.
  - **1 char (`"a"`)**: Appends ` | a`. Visual length increases by 4 chars.
  - **20 chars**: Appends ` | 12345678901234567890`. Visual model string length is exactly 20 chars.
  - **21 chars**: Truncated cleanly to `12345678901234567890`. Visual model string length is capped at 20 chars.
  - **500 chars**: Truncated cleanly to `x` * 20. Visual model string length is capped at 20 chars.
- **Verdict**: PASS. Line length is strictly bounded and prevents TUI visual line wrapping.

### Objective 2: Progress Bar Rendering Under Special Percentages
- **Tested Cases**: Negative percentages (`-50%`), boundary `0%`, `50%`, `100%`, overflow (`150%`), `NaN` (`float('nan')`), `+Inf` (`float('inf')`), and `-Inf` (`float('-inf')`).
- **Code Trace**:
  - `make_ascii_progress_bar(percent, length=8)` parses `percent` via `float(percent)`.
  - Checked against `math.isnan(val)` -> clamped to `0.0`.
  - Checked against `math.isinf(val)` -> clamped to `100.0` if `val > 0` else `0.0`.
  - Clamped between `0.0` and `100.0` via `max(0.0, min(100.0, val))`.
  - Filled length computed as `int(round((clamped / 100.0) * length))`.
- **Results**:
  - `-50%`: Clamped to `0.0%`, renders `[........]`.
  - `0%`: Clamped to `0.0%`, renders `[........]`.
  - `50%`: Renders `[====....]`.
  - `100%`: Clamped to `100.0%`, renders `[========]`.
  - `150%`: Clamped to `100.0%`, renders `[========]`.
  - `NaN`: Clamped to `0.0%`, renders `[........]`.
  - `+Inf`: Clamped to `100.0%`, renders `[========]`.
  - `-Inf`: Clamped to `0.0%`, renders `[........]`.
- **Verdict**: PASS. Progress bar rendering is mathematically sound, immune to floats/NaN/Inf exceptions or bar length overflows.

### Objective 3: Stdin Exit Code & Fallback Line Behavior
- **Tested Cases**: Abrupt stdin closure (EOF / empty stdin), whitespace stdin, invalid JSON syntax, non-dict JSON array (`[1, 2, 3]`), and binary noise simulation (`/dev/urandom` byte streams).
- **Code Trace**:
  - `main()` reads from `sys.stdin.read()`.
  - If `raw_input` is empty or whitespace, prints fallback line `5h: [........] --% | Wk: [........] --%` and returns cleanly.
  - If `json.loads(raw_input)` raises exception or returns non-dict, prints fallback line and returns cleanly.
  - Outer `try ... except Exception:` catches any decoding or unexpected runtime errors, printing fallback line.
- **Results**:
  - Exit Code: Always `0` across all malformed / abrupt / binary noise cases.
  - Output: Exact pure ASCII fallback line `5h: [........] --% | Wk: [........] --%` with ANSI dim formatting.
  - Zero crashes or unhandled stack traces.
- **Verdict**: PASS. Fault tolerance meets all interface contract requirements.

### Objective 4: Pure ASCII Compliance Verification
- **Tested Cases**: All outputs generated across Objectives 1-3, plus non-ASCII model inputs (e.g. `gemini-3.6-⚡-pro-中文`).
- **Code Trace**:
  - `sanitize_ascii(text)` filters using `"".join(c for c in text if ord(c) < 128)`.
  - `render_statusline(data)` wraps final string in `sanitize_ascii(line)`.
  - Fallback prints use literal ASCII escape sequences `\033[...]`.
- **Results**:
  - 100% of characters printed (excluding ANSI codes) satisfy `ord(c) < 128`.
  - Non-ASCII characters in model names are stripped seamlessly without altering layout alignment.
- **Verdict**: PASS. 100% Pure ASCII compliant.

---

## 3. Adversarial Stress-Test Matrix

| # | Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|-----------------|-------------------|-----------------|--------|
| 1 | Model: empty `""` | No model suffix in line | `5h: [...] ... \| Wk: [...] ...` | PASS |
| 2 | Model: 1 char `"a"` | Suffix `\| a` | `... \| Wk: [...] ... \| a` | PASS |
| 3 | Model: 20 chars | Suffix with 20 visible chars | Exact 20 char model string | PASS |
| 4 | Model: 21 chars | Suffix truncated to 20 chars | Exact 20 char model string | PASS |
| 5 | Model: 500 chars | Suffix truncated to 20 chars | Exact 20 char model string | PASS |
| 6 | Progress bar: `-50%` | Render `[........]` | `[........]` | PASS |
| 7 | Progress bar: `0%` | Render `[........]` | `[........]` | PASS |
| 8 | Progress bar: `50%` | Render `[====....]` | `[====....]` | PASS |
| 9 | Progress bar: `100%` | Render `[========]` | `[========]` | PASS |
| 10 | Progress bar: `150%` | Render `[========]` | `[========]` | PASS |
| 11 | Progress bar: `NaN` | Render `[........]` | `[........]` | PASS |
| 12 | Progress bar: `+Inf` | Render `[========]` | `[========]` | PASS |
| 13 | Progress bar: `-Inf` | Render `[........]` | `[........]` | PASS |
| 14 | Stdin: abrupt EOF / empty | Fallback line, exit code 0 | `5h: [........] --% \| Wk: [........] --%`, exit 0 | PASS |
| 15 | Stdin: binary noise (`/dev/urandom`) | Fallback line, exit code 0 | `5h: [........] --% \| Wk: [........] --%`, exit 0 | PASS |

---

## 4. Final Verdict

**FINAL VERDICT: APPROVE**

`statusline_hud.py` satisfies all core robustness requirements, pure ASCII constraints, visual formatting standards, and edge-case handling specs for Milestone M1.
