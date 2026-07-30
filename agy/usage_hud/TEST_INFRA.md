# E2E Test Infrastructure & Methodology (`TEST_INFRA.md`)

## 1. Test Architecture Overview

The **AGY Pure-ASCII Usage Statusline** test framework provides automated end-to-end (E2E) and boundary verification for `statusline_hud.py`. 

The test harness (`test_statusline.py`) executes `statusline_hud.py` as an isolated subprocess via `subprocess.Popen`, injecting standard UTF-8 JSON payloads into `sys.stdin` and inspecting `sys.stdout`, `sys.stderr`, and exit codes.

### Key Verification Mechanisms
- **Process Isolation**: Each test case runs in a fresh Python process to ensure zero state contamination.
- **Pure ASCII Constraint Enforcer**: `verify_ascii()` strips ANSI color escape sequences (`\033[...]`) via regex (`\x1b\[[0-9;]*m`) and verifies that every remaining character has an ASCII ordinal value strictly less than 128 (`ord(c) < 128`).
- **ANSI Color Code Validation**: Verifies appropriate ANSI escape codes (`\033[1;32m` for Green, `\033[1;33m` for Yellow, `\033[1;31m` for Red) are emitted based on quota usage thresholds.
- **Model Name Truncation Guard**: Verifies that model names exceeding 20 characters are strictly truncated before formatting.

---

## 2. 4-Tier Test Classification Methodology

The test suite is structured into 4 distinct testing tiers, covering happy paths, schema variations, extreme boundaries, and structural fault tolerance:

| Tier | Category | Focus Area | Objective |
|------|----------|------------|-----------|
| **Tier 1** | Core Functionality | Standard Usage & Color Coding | Verify statusline formatting, percentage displays, duration calculations, and color thresholds (<70% Green, 70-90% Yellow, >=90% Red). |
| **Tier 2** | Compatibility | Field Variations & Schema Aliases | Ensure backward compatibility with legacy fields (`remaining_fraction`) and alternative key names (`5h` vs `rolling_5h`, `week` vs `weekly`, `model` vs `active_model`). |
| **Tier 3** | Boundary & Sanitization | Extreme Inputs & Character Hygiene | Test overlong model names (>20 chars), non-ASCII character sanitization, percentage clamping (<0%, >100%), negative reset times, float string resets ("3600.5"), missing fields, and inf/nan resets. |
| **Tier 4** | Defense & Fault Tolerance | Malformed Payloads & Crash Prevention | Guard against empty stdin, invalid JSON syntax, non-dict payloads (arrays `[1,2,3]`, primitives `"str"`), and empty dictionaries `{}` without crashing. |

---

## 3. Boundary Coverage Matrix

| Test ID | Tier | Test Name | Payload Input / Scenario | Expected Outcome | Current Status |
|---------|------|-----------|--------------------------|------------------|----------------|
| **TC-01** | Tier 1 | Standard Usage (<70%) | `{"active_model": "gemini-3.6-flash", "quota": {"rolling_5h": {"used_percent": 35.0, ...}}}` | Green `\033[1;32m`, `35.0%`, `1h30m` | ✅ **PASS** |
| **TC-02** | Tier 1 | Warning Usage (70-90%) | `{"quota": {"rolling_5h": {"used_percent": 75.5, ...}}}` | Yellow `\033[1;33m`, `75.5%` | ✅ **PASS** |
| **TC-03** | Tier 1 | Critical Usage (>=90%) | `{"quota": {"rolling_5h": {"used_percent": 95.2, ...}}}` | Red `\033[1;31m`, `95.2%` | ✅ **PASS** |
| **TC-04** | Tier 2 | Legacy Field (`remaining_fraction`) | `{"quota": {"5h": {"remaining_fraction": 0.40}}}` | Converted `used_percent` = 60.0% | ✅ **PASS** |
| **TC-05** | Tier 2 | Key Aliases (`5h`, `week`, `model`) | `{"model": "gpt-4o", "quota": {"5h": {...}, "week": {...}}}` | Correctly parses `5h`, `week`, and `gpt-4o` | ✅ **PASS** |
| **TC-06** | Tier 3 | Model Name Truncation (>20 chars) | `{"active_model": "claude-3-5-sonnet-20241022-v1:0"}` | Model name truncated to `"claude-3-5-sonnet-20"` (length 20) | ❌ **FAIL** *(M1 Pending)* |
| **TC-07** | Tier 3 | Pure ASCII Sanitization | `{"active_model": "gemini-3.6-⚡-pro-中文"}` | Non-ASCII chars stripped/replaced; 100% pure ASCII output | ❌ **FAIL** *(M1 Pending)* |
| **TC-08** | Tier 3 | Percentage Underflow (<0%) | `{"quota": {"rolling_5h": {"used_percent": -15.0}}}` | Percentage clamped to `0.0%`, bar `[........]` | ❌ **FAIL** *(M1 Pending)* |
| **TC-09** | Tier 3 | Percentage Overflow (>100%) | `{"quota": {"rolling_5h": {"used_percent": 125.0}}}` | Percentage clamped to `100.0%`, bar `[========]` | ❌ **FAIL** *(M1 Pending)* |
| **TC-10** | Tier 3 | Negative Reset Time (-500s) | `{"quota": {"rolling_5h": {"reset_in_seconds": -500}}}` | Formatted cleanly as `(0m)` | ✅ **PASS** |
| **TC-11** | Tier 3 | Float String Reset Time ("3600.5") | `{"quota": {"rolling_5h": {"reset_in_seconds": "3600.5"}}}` | Parsed cleanly to 3600s (`1h00m`) | ❌ **FAIL** *(M1 Pending)* |
| **TC-12** | Tier 3 | Missing/None Reset Fields | `{"quota": {"rolling_5h": {"reset_in_seconds": null}}}` | Formatted cleanly as `(0m)` | ✅ **PASS** |
| **TC-13** | Tier 3 | Abnormal Reset ("inf", "nan") | `{"quota": {"rolling_5h": {"reset_in_seconds": "inf"}}}` | Gracefully handled as `(0m)` without crash | ✅ **PASS** |
| **TC-14** | Tier 4 | Empty Stdin Input | `""` (empty string) | Fallback display `5h: [........] --% ...` | ✅ **PASS** |
| **TC-15** | Tier 4 | Invalid JSON Syntax | `"{invalid json syntax..."` | Fallback display `5h: [........] --% ...` | ✅ **PASS** |
| **TC-16** | Tier 4 | Non-Dict JSON Array ([1,2,3]) | `[1, 2, 3, "corrupted"]` | Fallback display without exception crash | ✅ **PASS** |
| **TC-17** | Tier 4 | Non-Dict JSON Primitive | `"raw_string_payload"` | Fallback display without exception crash | ✅ **PASS** |
| **TC-18** | Tier 4 | Empty Dict Payload (`{}`) | `{}` | Safe default rendering (`0.0%`, `0m`) | ✅ **PASS** |

---

## 4. Test Execution & Reporting Instructions

To run the full 18-case boundary test suite, execute:

```bash
python3 test_statusline.py
```

### Exit Codes
- `0`: All test cases passed successfully.
- `1`: One or more test cases failed (details logged to stdout).

---

## 5. Escalated Implementation Defects (For Milestone M1)

The following 5 defect areas were identified during initial test suite execution and require implementation updates in `statusline_hud.py`:

1. **DEF-01 (TC-06)**: Model names exceeding 20 characters are rendered in full without truncation.
   - *Required Fix*: Truncate `model_name` to max 20 characters (`model_name[:20]`).
2. **DEF-02 (TC-07)**: Non-ASCII characters in model names/strings (e.g. `⚡`, `中文`) are emitted directly to stdout.
   - *Required Fix*: Sanitize strings to strip or encode any character with `ord(c) >= 128`.
3. **DEF-03 (TC-08)**: Negative percentage values (e.g. `-15.0%`) are formatted directly into the percentage text string instead of being clamped to `0.0%`.
   - *Required Fix*: Clamp `used_percent` to range `[0.0, 100.0]` prior to string formatting.
4. **DEF-04 (TC-09)**: Overflow percentage values (e.g. `125.0%`) are formatted directly into the percentage text string instead of being clamped to `100.0%`.
   - *Required Fix*: Clamp `used_percent` to range `[0.0, 100.0]` prior to string formatting.
5. **DEF-05 (TC-11)**: Float string reset values (e.g. `"3600.5"`) cause `int("3600.5")` to raise `ValueError`, reverting to `0s` fallback instead of parsing as `3600s` (`1h00m`).
   - *Required Fix*: Convert reset time string via `int(float(reset_sec))` when parsing.
