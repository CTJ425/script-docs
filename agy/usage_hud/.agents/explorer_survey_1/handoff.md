# AGY Pure-ASCII Usage Statusline Survey Handoff Report

## 1. Observation

- **Project Root Directory**: `/home/ivan/project/script-docs/agy/usage_hud`
- **Inspected Files**:
  1. `statusline_hud.py` (192 lines, 5537 bytes): Core statusline interpreter reading JSON payload from `sys.stdin` and outputting ANSI-colored pure ASCII string.
  2. `test_statusline.py` (143 lines, 5068 bytes): Automated test runner executing 6 basic test cases against `statusline_hud.py` via `subprocess.Popen`.
  3. `setup.sh` (30 lines, 1086 bytes): Deployment script for permission assignment (`chmod +x`) and running tests.
  4. `README.md` (50 lines, 1743 bytes): Quick setup overview.
  5. `.agents/ORIGINAL_REQUEST.md` (35 lines, 1565 bytes): Task specification detailing requirements R1 (Verification), R2 (Robustness & Fixes), R3 (Documentation: `USER_GUIDE.md` & `TROUBLESHOOTING.md`).

- **Specific Code Findings in `statusline_hud.py`**:
  - Line 158: `model_name = data.get("active_model", data.get("model", ""))` reads model name without length truncation or ASCII character sanitization.
  - Line 26: `total_seconds = int(seconds)` in `format_duration` only catches `(ValueError, TypeError)`. If `seconds` is `float('inf')`, `int(seconds)` raises `OverflowError`.
  - Line 52: `filled_len = int(round((clamped / 100.0) * length))` in `make_ascii_progress_bar`. If `percent` is `float('nan')`, `clamped` is `nan`, and `round(nan)` raises `ValueError` outside of the `clamped` try-except block.
  - Absence of files: `USER_GUIDE.md` and `TROUBLESHOOTING.md` do not exist in the project directory yet.

---

## 2. Logic Chain

1. **Observation**: `ORIGINAL_REQUEST.md` requires truncation of super long AI model names (R1/R2) and 100% pure ASCII output compliance without Non-ASCII leaks.
2. **Observation**: `statusline_hud.py` line 158 extracts `model_name` directly and includes it in `model_part` (lines 160-162) without checking length or filtering characters.
3. **Reasoning**: If an incoming payload contains a 100-character model name or Unicode/Emoji characters (e.g. `gemini-🚀-pro-preview-experimental`), `statusline_hud.py` will print un-truncated lines and Non-ASCII characters to stdout, breaking layout and violating the pure ASCII constraint.
4. **Observation**: `ORIGINAL_REQUEST.md` requires 100% crash-free stability under invalid/corrupted payloads and extreme edge cases.
5. **Observation**: `statusline_hud.py` lines 26 & 52 can raise `OverflowError` (when converting `float('inf')` in `format_duration`) or `ValueError` (when calling `round(nan)` in `make_ascii_progress_bar`).
6. **Reasoning**: To ensure 100% crash-free operation, floating point edge cases (`NaN`, `Inf`) and non-string field types must be handled defensively inside data conversion functions.
7. **Observation**: `ORIGINAL_REQUEST.md` R3 specifies creating Traditional Chinese manuals (`USER_GUIDE.md` and `TROUBLESHOOTING.md`). Currently neither file exists.
8. **Conclusion**: Implementation requires updating `statusline_hud.py` for model truncation, ASCII sanitization, and float edge case handling; expanding `test_statusline.py` with edge case tests; and creating `USER_GUIDE.md` and `TROUBLESHOOTING.md`.

---

## 3. Caveats

- Terminal command execution via `run_command` in this environment required explicit user interaction that timed out. All findings were verified through meticulous static code analysis of `statusline_hud.py`, `test_statusline.py`, `setup.sh`, `README.md`, and `.agents/ORIGINAL_REQUEST.md`.
- No other unexamined source files exist in the project directory.

---

## 4. Conclusion

The survey phase for AGY Pure-ASCII Usage Statusline is complete. All current features, functions, data flows, edge-case vulnerabilities, and missing requirements have been enumerated and documented in detail in `/home/ivan/project/script-docs/agy/usage_hud/.agents/explorer_survey_1/analysis.md`.

---

## 5. Verification Method

To independently verify the survey findings:
1. Inspect `/home/ivan/project/script-docs/agy/usage_hud/.agents/explorer_survey_1/analysis.md` for full breakdown and specifications.
2. Inspect `statusline_hud.py` lines 26, 52, and 158 to verify the identified vulnerabilities (model name truncation missing, ASCII filtering missing, NaN/Inf floating point exception risks).
3. Run `python3 test_statusline.py` in `/home/ivan/project/script-docs/agy/usage_hud` once implementation is complete to verify 100% ASCII compliance and test pass rates.
