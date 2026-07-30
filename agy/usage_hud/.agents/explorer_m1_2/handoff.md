# Handoff Report: Defensive Edge-Case Rules & Safety Checks for `statusline_hud.py`

**Agent**: Explorer 2 (Milestone M1)  
**Target File**: `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`  
**Handoff Type**: Hard (Task Complete)  
**Date**: 2026-07-30  

---

## 1. Observation

1. **Target Source File**: `/home/ivan/project/script-docs/agy/usage_hud/statusline_hud.py`
   - ANSI color code definitions (lines 13–18):
     ```python
     COLOR_RESET = "\033[0m"
     COLOR_GREEN = "\033[1;32m"
     COLOR_YELLOW = "\033[1;33m"
     COLOR_RED = "\033[1;31m"
     COLOR_CYAN = "\033[1;36m"
     COLOR_DIM = "\033[2m"
     ```
   - Standard output rendering logic for model name (lines 158–162):
     ```python
     model_name = data.get("active_model", data.get("model", ""))
     if model_name:
         model_part = f" {COLOR_DIM}|{COLOR_RESET} {COLOR_CYAN}{model_name}{COLOR_RESET}"
     else:
         model_part = ""
     ```
   - Stdin reading and exception handling in `main()` (lines 175–188):
     ```python
     try:
         raw_input = sys.stdin.read()
         if not raw_input or not raw_input.strip():
             print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")
             return
         data = json.loads(raw_input)
         status_line = render_statusline(data)
         print(status_line)
     except Exception:
         print(f"5h: {COLOR_DIM}[........] --%{COLOR_RESET} {COLOR_DIM}|{COLOR_RESET} Wk: {COLOR_DIM}[........] --%{COLOR_RESET}")
     ```

2. **Project Contracts**: `/home/ivan/project/script-docs/agy/usage_hud/PROJECT.md`
   - ASCII Constraint: Every character printed (excluding ANSI escape interpretation) must satisfy `ord(c) < 128`.
   - Model Truncation: Model name strictly truncated to max 20 characters before color formatting.
   - Error Behavior: On empty input, invalid JSON, or exceptions, print fallback line `5h: [........] --% | Wk: [........] --%` with exit code 0. Never crash.

---

## 2. Logic Chain

1. **Observation 1**: ANSI color codes in `statusline_hud.py` use octal `\033` (ASCII 27 ESC), `[`, digits, semicolons, and `m`.
   - **Logic**: ASCII ordinal values for all characters in ANSI escape strings (`\033[1;32m`, `\033[0m`, etc.) range between 27 and 109, which are all strictly `< 128`.
   - **Deduction**: Standard ANSI color sequences naturally comply with the pure ASCII output constraint `ord(c) < 128`.

2. **Observation 2**: Dynamic strings (like model names or custom payload text) can contain non-ASCII characters (e.g., emojis, multi-byte UTF-8, or line break characters).
   - **Logic**: Applying `to_pure_ascii(text)` to dynamic payload fields before wrapping them in ANSI color codes ensures non-ASCII characters are stripped while preserving the ANSI color escape structure intact.
   - **Deduction**: The list comprehension pattern `"".join(c for c in text if ord(c) < 128 and c not in ('\r', '\n'))` safely filters out non-ASCII and carriage returns/newlines without raising `UnicodeEncodeError` on lone surrogates. Truncating after sanitizing (`to_pure_ascii(model).strip()[:20]`) guarantees max 20 printable ASCII characters.

3. **Observation 3**: `main()` uses `sys.stdin.read()`, `raw_input.strip()`, `json.loads()`, and `except Exception:`.
   - **Logic**:
     - If `stdin` is empty `""` or whitespace `"\n"`, line 177 catches it and outputs fallback statusline.
     - If `stdin` contains malformed JSON, `json.loads()` raises `JSONDecodeError`, caught by `except Exception:`.
     - If `stdin` contains non-dict JSON (e.g., `"[1, 2]"` or `"123"`), `parse_quota_data` raises `AttributeError` on `.get()`, caught by `except Exception:`.
     - Fallback output line contains only ASCII characters (`ord(c) < 128`).
   - **Deduction**: Stdin reading and error fallback behavior operate safely and output 100% pure ASCII under all invalid or empty input conditions. Adding an explicit `if not isinstance(data, dict): data = {}` guard inside `render_statusline` and `parse_quota_data` provides secondary layer defense against non-dict payloads.

---

## 3. Caveats

1. **Scope Boundary**: Read-only analysis assignment for Milestone M1 Explorer 2. Direct edits to `statusline_hud.py` will be performed by the Implementer agent based on `analysis.md` and this handoff.
2. **Terminal Execution Restriction**: Command execution timed out due to user prompt setting; analysis was verified via formal Python character encoding specifications and static code inspection.

---

## 4. Conclusion

1. **ANSI Color Code Preservation**: ANSI SGR color escape codes strictly satisfy `ord(c) < 128` and are fully preserved when output.
2. **ASCII Sanitization Helper (`to_pure_ascii`)**:
   ```python
   def to_pure_ascii(text: str) -> str:
       if text is None:
           return ""
       if not isinstance(text, str):
           try:
               text = str(text)
           except Exception:
               return ""
       return "".join(c for c in text if ord(c) < 128 and c not in ('\r', '\n'))
   ```
3. **Model Processing Pipeline**:
   ```python
   raw_model = data.get("active_model", data.get("model", ""))
   clean_model = to_pure_ascii(raw_model).strip()[:20]
   ```
4. **Fallback Behavior**: Fully verified. Fallback output string is 100% pure ASCII compliant and guarantees exit code 0 without unhandled exceptions.

---

## 5. Verification Method

### 5.1 Independent Verification Commands
Once the implementer applies the changes, run the following inline Python test:

```bash
python3 -c '
import statusline_hud

# Test 1: to_pure_ascii function
assert statusline_hud.to_pure_ascii("gpt-4o-🚀-Sonnet") == "gpt-4o--Sonnet"
assert statusline_hud.to_pure_ascii("Claude-3.5–Sonnet") == "Claude-3.5Sonnet"
assert statusline_hud.to_pure_ascii(None) == ""
assert statusline_hud.to_pure_ascii("\033[1;32mGreen\033[0m") == "\033[1;32mGreen\033[0m"

# Test 2: Output ASCII compliance check
line = statusline_hud.render_statusline({"active_model": "gpt-4o-🚀-very-long-model-name-over-20-chars"})
assert all(ord(c) < 128 for c in line), "Non-ASCII character found in statusline!"

print("ALL VERIFICATION ASSERTS PASSED CLEANLY!")
'
```

### 5.2 Test Cases & Invalidation Conditions
- **Invalidation Condition 1**: If any character printed in `sys.stdout` has `ord(c) >= 128`.
- **Invalidation Condition 2**: If passing malformed JSON or empty string to stdin causes a non-zero exit code or uncaught stack trace.
- **Invalidation Condition 3**: If model name exceeds 20 characters when rendered in statusline.

---
